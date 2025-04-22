const { OpenAI } = require("openai");
const pdfParse = require("pdf-parse");
const multipart = require('parse-multipart-data');

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
    } else if (fileType.startsWith("image/")) {
      // Process image using OpenAI Vision
      const base64Image = fileBuffer.toString('base64');
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all text from this image, preserving layout as much as possible." },
              { type: "image_url", image_url: { url: `data:${fileType};base64,${base64Image}` } }
            ]
          }
        ]
      });
      extractedText = visionResponse.choices[0].message.content;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Unsupported file type" })
      };
    }

    // OpenAI Prompt to ensure structured JSON
    const prompt = `
    Extract structured document details from this text. If the document contains multiple items (e.g., multiple invoices or letters), list them separately in an array.
    
    IMPORTANT: Return ONLY the raw JSON without any markdown formatting, code blocks, or explanations. Do not use \`\`\` or any other formatting.
    
    The response format must always be:
    
    {
      "totalPages": <total number of pages>,
      "uniquePages": <count of unique pages>,
      "documents": [
        {
          "startPage": <page number>,
          "endPage": <page number>,
          "sender": {
            "name": "<sender name>",
            "address": "<sender address>",
            "companyNumber": "<company number>",
            "email": "<sender email>",
            "phone": "<sender phone number>"
          },
          "receiver": {
            "name": "<receiver name>",
            "address": "<receiver address>"
          },
          "documentDetails": {
            "caseNumber": "<case number>",
            "invoiceAmount": <invoice amount>,
            "dueDate": "<due date>",
            "dateCreated": "<creation date>",
            "dateSent": "<sent date>",
            "summary": "<brief one-sentence summary>",
            "documentType": "<type of document: invoice, letter, etc.>"
          }
        }
      ]
    }

    Ensure the JSON format remains the same, even if some values are missing (use null or empty strings).
    If a value isn't present in the document, use null.
    For numeric values like invoiceAmount, use actual numbers (not strings) when present; otherwise use null.
    
    Remember: Return ONLY the raw JSON without any formatting or explanation.`;

    // Send extracted text to OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: extractedText }
      ]
    });

    // Parse AI response
    let structuredData;
    try {
      // Get the raw content
      let content = aiResponse.choices[0].message.content;
      console.log("Original OpenAI response:", content);
      
      // Check if content is wrapped in markdown code blocks and remove them
      if (content.includes("```")) {
        const matches = content.match(/```(?:json)?([\s\S]*?)```/);
        if (matches && matches[1]) {
          content = matches[1].trim();
          console.log("After removing code blocks:", content);
        }
      }
      
      // Sanitize the JSON string to handle escape sequences and control characters
      content = content
        // Replace any sequence of backslashes with a single backslash
        .replace(/\\+/g, '\\')
        // Remove any control characters that might be present
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        // Fix any invalid escapes
        .replace(/\\([^"\\\/bfnrtu])/g, '$1');
      
      console.log("After sanitizing:", content);
      
      // Parse the sanitized JSON
      try {
        structuredData = JSON.parse(content);
      } catch (parseError) {
        console.log("First parsing attempt failed:", parseError.message);
        
        // Try an alternative approach as a fallback
        content = content.replace(/\\\\+/g, '\\\\'); // Fix multiple backslashes
        content = content.replace(/\n/g, '\\n'); // Replace literal newlines in strings
        structuredData = JSON.parse(content);
      }
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
        content: structuredData
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