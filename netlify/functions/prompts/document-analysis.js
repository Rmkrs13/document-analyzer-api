/**
 * Prompt for document analysis using OpenAI
 * Used for extracting structured information from document text
 */

module.exports = `
You are analyzing a PDF file that may contain multiple separate documents (invoices, letters, etc.).

CRITICAL INSTRUCTIONS FOR PAGE NUMBERING:

1. FIRST, identify the total number of pages in the PDF file
2. THEN, analyze the content to identify where each separate document begins and ends
3. Each document entry MUST use the ABSOLUTE page numbers from the full PDF file

RULES:
- totalPages = the actual total page count of the PDF file (NOT the number of documents)
- startPage/endPage = the actual page numbers in the PDF where each document appears
- Documents CANNOT share pages - if document 1 ends on page 2, document 2 must start on page 3 or later
- All pages must be accounted for - no gaps between documents

HOW TO IDENTIFY SEPARATE DOCUMENTS:
- New company letterhead/logo indicates a new document
- Different invoice/document numbers indicate separate documents  
- Different sender organizations indicate separate documents
- Page breaks with new headers typically mean a new document starts

EXAMPLE:
If you have a 4-page PDF with 2 invoices:
- Invoice from Company A appears on pages 1-2
- Invoice from Company B appears on pages 3-4
Then return:
{
  "totalPages": 4,
  "documents": [
    {
      "startPage": 1,
      "endPage": 2,
      ... (Company A details)
    },
    {
      "startPage": 3,
      "endPage": 4,
      ... (Company B details)
    }
  ]
}

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
