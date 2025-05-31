const { OpenAI } = require("openai");
const pdfParse = require("pdf-parse");
const multipart = require('parse-multipart-data');

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

    // Only process PDFs for page splitting
    if (fileType !== "application/pdf") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Only PDF files are supported for page splitting" })
      };
    }

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

    // Send extracted text to OpenAI for boundary analysis
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: pageSplitterPrompt },
        { role: "user", content: `Total pages in PDF: ${numPages}\n\nExtracted text with page breaks:\n${extractedText}` }
      ],
      response_format: { type: "json_object" }
    });

    // Parse AI response
    let structuredData;
    try {
      structuredData = JSON.parse(aiResponse.choices[0].message.content);
      
      // Validate the response structure
      if (!structuredData.totalPages || !structuredData.totalDocuments || !structuredData.documentBoundaries) {
        throw new Error("Invalid response structure from AI");
      }

      // Ensure totalPages matches the actual PDF page count
      structuredData.totalPages = numPages;

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