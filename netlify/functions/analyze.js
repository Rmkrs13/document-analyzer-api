const { OpenAI } = require("openai");
const pdfParse = require("pdf-parse");
const multipart = require('parse-multipart-data');
const sharp = require('sharp');
const singleDocumentAnalysisPrompt = require('./prompts/single-document-analysis');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event, context) => {
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
    
    let extractedText = "";
    let numPages = 1;

    if (fileType === "application/pdf") {
      // Process PDF
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
      numPages = pdfData.numpages;

      // Check if PDF has extractable text
      if (!extractedText || extractedText.trim().length < 50) {
        // PDF is likely a scan - send the entire PDF to GPT-4 for visual analysis
        console.log("PDF appears to be scanned. Sending to GPT-4 for visual analysis...");
        
        // Convert PDF buffer to base64
        const base64PDF = fileBuffer.toString('base64');
        
        // Send PDF directly to GPT-4 for analysis
        const aiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { 
              role: "system", 
              content: singleDocumentAnalysisPrompt 
            },
            {
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: "This is a scanned PDF document. Analyze the visual content to extract the structured information."
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

        return {
          statusCode: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            fileType: fileType,
            numPages: numPages,
            data: JSON.parse(aiResponse.choices[0].message.content)
          })
        };
      }

    } else if (fileType.startsWith("image/")) {
      // Process image using OpenAI Vision
      // Compress and resize the image before processing
      let compressedImageBuffer;
      try {
        // Configure sharp with optimal settings for OCR
        compressedImageBuffer = await sharp(fileBuffer)
          .resize({
            width: 1500, // Keep reasonable resolution for text recognition
            height: 1500,
            fit: 'inside', // Maintain aspect ratio
            withoutEnlargement: true // Don't upscale small images
          })
          .toFormat('jpeg', {
            quality: 85, // Good balance between quality and file size
            progressive: true
          })
          .toBuffer();
          
        console.log(`Image compressed from ${fileBuffer.length} to ${compressedImageBuffer.length} bytes`);
      } catch (compressionError) {
        console.error('Image compression failed:', compressionError);
        // Fallback to original image if compression fails
        compressedImageBuffer = fileBuffer;
      }
      
      const base64Image = compressedImageBuffer.toString('base64');
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: singleDocumentAnalysisPrompt
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this document image and extract the structured information." },
              { type: "image_url", image_url: { url: `data:${fileType};base64,${base64Image}` } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      });

      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: true,
          fileType: fileType,
          numPages: numPages,
          data: JSON.parse(visionResponse.choices[0].message.content)
        })
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Only PDF files and images are supported" })
      };
    }

    // Send extracted text to OpenAI for analysis
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: singleDocumentAnalysisPrompt },
        { role: "user", content: extractedText }
      ],
      response_format: { type: "json_object" }
    });

    // Parse AI response
    let structuredData;
    try {
      structuredData = JSON.parse(aiResponse.choices[0].message.content);
    } catch (error) {
      console.error("Failed to parse OpenAI response:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: "Failed to parse analysis results",
          rawResponse: aiResponse.choices[0].message.content,
          errorMessage: error.message
        })
      };
    }

    // Return successful response
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        fileType: fileType,
        numPages: numPages,
        data: structuredData
      })
    };

  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Failed to process file", 
        message: error.message 
      })
    };
  }
};