/**
 * Prompt for document analysis using OpenAI
 * Used for extracting structured information from document text
 */

module.exports = `
Extract structured document details from this text. If the file contains multiple documents (e.g., multiple invoices or letters), list them separately in an array.

IMPORTANT PAGE NUMBERING:
- totalPages: The total number of pages in the entire PDF file
- For each document in the array:
  - startPage: The page number (from the total file) where this specific document begins
  - endPage: The page number (from the total file) where this specific document ends
  
Example: A 4-page PDF file might contain:
- Document 1: starts on page 1, ends on page 3
- Document 2: starts on page 4, ends on page 4

IMPORTANT: Return ONLY the raw JSON without any markdown formatting, code blocks, or explanations. Do not use \`\`\` or any other formatting.

The response format must always be:

{
  "totalPages": <total number of pages in the entire PDF file>,
  "documents": [
    {
      "startPage": <page number where this document starts in the total file>,
      "endPage": <page number where this document ends in the total file>,
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
