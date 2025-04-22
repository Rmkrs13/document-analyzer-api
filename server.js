const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const fs = require("fs");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const secretKey = process.env.SECRET_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Enable CORS
app.use(cors({ origin: "*" }));

// Express JSON middleware
app.use(express.json());

// Middleware to check API key
app.use((req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader || authHeader !== `Bearer ${secretKey}`) {
        return res.status(403).json({ error: "Unauthorized access" });
    }
    next();
});

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Accept PDFs and common image formats
        if (file.mimetype === 'application/pdf' || 
            file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and image files are allowed'), false);
        }
    }
});

// Health check route
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK" });
});

// Document Processing Route
app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        let extractedText = "";
        let numPages = 1;
        const fileType = req.file.mimetype;

        if (fileType === "application/pdf") {
            // Process PDF
            const pdfData = await pdfParse(req.file.buffer);
            extractedText = pdfData.text;
            numPages = pdfData.numpages;
        } else if (fileType.startsWith("image/")) {
            // Process image using OpenAI Vision
            const base64Image = req.file.buffer.toString('base64');
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
            return res.status(400).json({ error: "Unsupported file type" });
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
            // Return the raw response for debugging
            return res.status(500).json({ 
                error: "Failed to parse analysis results",
                rawResponse: aiResponse.choices[0].message.content,
                errorMessage: error.message
            });
        }

        // Construct response
        res.json({
            success: true,
            fileType: fileType,
            numPages: numPages,
            content: structuredData
        });
    } catch (error) {
        console.error("Processing error:", error);
        res.status(500).json({ 
            error: "Failed to process file", 
            message: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: err.message || "Something went wrong",
    });
});

// Start Server (only when running directly, not when imported as a module)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}

// Export for serverless function use
module.exports = app;