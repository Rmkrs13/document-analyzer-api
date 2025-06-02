const { OpenAI } = require("openai");
const pdfParse = require("pdf-parse");
const multipart = require('parse-multipart-data');
const sharp = require('sharp');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// System prompt for identifying document boundaries
const pageSplitterPrompt = `You are an AI assistant that identifies where individual documents begin within a multi-document PDF.

Analyze the PDF text and return:
1. Total number of pages
2. Total number of individual documents
3. Page number where each document starts

Look for document boundaries like:
- New letterheads
- Different dates/senders/recipients
- Page numbering resets
- Clear document endings

Return JSON in this exact format:
{
  "totalPages": <number>,
  "totalDocuments": <number>,
  "documentBoundaries": [
    {
      "documentNumber": 1,
      "startPage": 1
    },
    {
      "documentNumber": 2,
      "startPage": <page number>
    }
  ]
}`;

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // Check if method is POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check API key
  const authHeader = event.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.SECRET_KEY}`) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Unauthorized access' })
    };
  }

  try {
    // Parse multipart form data
    const boundary = multipart.getBoundary(event.headers['content-type']);
    if (!boundary) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing boundary in content-type' })
      };
    }

    const parts = multipart.parse(Buffer.from(event.body, 'base64'), boundary);
    if (!parts || parts.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file parts found in the request' })
      };
    }

    const filePart = parts.find(part => part.name === 'file');
    if (!filePart) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file found in the request' })
      };
    }

    const fileBuffer = filePart.data;
    const fileType = filePart.type;

    let aiResponse;
    let structuredData;

    if (fileType === "application/pdf") {
      // Process PDF
      const pdfData = await pdfParse(fileBuffer, {
        // Return page breaks to help identify document boundaries
        pagerender: function(pageData) {
          return pageData.getTextContent().then(function(textContent) {
            let text = '';
            for (let item of textContent.items) {
              text += item.str + ' ';
            }
            return text + '\n\n--- PAGE BREAK ---\n\n';
          });
        }
      });

      const extractedText = pdfData.text;
      const numPages = pdfData.numpages;

      // Check if PDF has extractable text
      if (!extractedText || extractedText.trim().length < 50) {
        // PDF is likely a scan - send the entire PDF to GPT-4 for visual analysis
        console.log("PDF appears to be scanned. Sending to GPT-4 for visual analysis...");
        
        // Convert PDF buffer to base64
        const base64PDF = fileBuffer.toString('base64');
        
        // Send PDF directly to GPT-4 for analysis
        aiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { 
              role: "system", 
              content: pageSplitterPrompt 
            },
            {
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: `This is a scanned PDF with ${numPages} pages. Analyze the visual content to identify document boundaries based on letterheads, formatting changes, signatures, and other visual cues.`
                },
                { 
                  type: "image_url", 
                  image_url: { 
                    url: `data:application/pdf;base64,${base64PDF}` 
                  } 
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        });
        
      } else {
        // PDF has text - use standard text analysis
        aiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: pageSplitterPrompt },
            { role: "user", content: `Total pages in PDF: ${numPages}\n\nExtracted text with page breaks:\n${extractedText}` }
          ],
          response_format: { type: "json_object" }
        });
      }

    } else if (fileType.startsWith("image/")) {
      // Process image (photo scan) using Vision API
      // Compress image first for better performance
      let compressedImageBuffer;
      try {
        compressedImageBuffer = await sharp(fileBuffer)
          .resize({
            width: 2000, // Higher res for document analysis
            height: 2000,
            fit: 'inside',
            withoutEnlargement: true
          })
          .toFormat('jpeg', {
            quality: 90
          })
          .toBuffer();
      } catch (compressionError) {
        console.error('Image compression failed:', compressionError);
        compressedImageBuffer = fileBuffer;
      }

      const base64Image = compressedImageBuffer.toString('base64');
      
      // Use vision API to analyze the scanned document
      aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system", 
            content: pageSplitterPrompt
          },
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "This is a scanned document. Analyze it to identify document boundaries. If it appears to be multiple pages, identify where each document starts based on visual cues like headers, letterheads, or content changes."
              },
              { 
                type: "image_url", 
                image_url: { url: `data:${fileType};base64,${base64Image}` } 
              }
            ]
          }
        ],
        response_format: { type: "json_object" }
      });

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Only PDF files and images are supported" })
      };
    }

    // Parse AI response (if we didn't return early for scanned PDFs)
    if (!structuredData) {
      try {
        structuredData = JSON.parse(aiResponse.choices[0].message.content);
        
        // Validate the response structure
        if (!structuredData.totalPages || !structuredData.totalDocuments || !structuredData.documentBoundaries) {
          throw new Error("Invalid response structure from AI");
        }

        // For PDFs, ensure totalPages matches the actual PDF page count
        if (fileType === "application/pdf") {
          const pdfData = await pdfParse(fileBuffer);
          structuredData.totalPages = pdfData.numpages;
        }

      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: "Failed to parse document boundaries", 
            details: parseError.message 
          })
        };
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(structuredData)
    };

  } catch (error) {
    console.error("Error processing document:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Internal server error", 
        details: error.message 
      })
    };
  }
};