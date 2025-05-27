/**
 * Prompt for document analysis using OpenAI
 * Used for extracting structured information from document text
 */

module.exports = `
Extract structured document details from this text. If the file contains multiple documents (e.g., multiple invoices or letters), list them separately in an array.

CRITICAL PAGE NUMBERING RULES:
1. totalPages: Must equal the ACTUAL total number of pages in the entire PDF file
2. Each document MUST have accurate page boundaries:
   - startPage: The exact page number where this document begins
   - endPage: The exact page number where this document ends
   - Documents CANNOT overlap pages
   - Every page must belong to exactly one document

3. How to identify document boundaries:
   - A new document typically starts with a new header/letterhead
   - Look for clear visual breaks between documents
   - Invoice numbers, dates, or document IDs that change indicate a new document
   - Each complete invoice, letter, or document is a separate entry

Example for a 4-page PDF:
- If pages 1-2 contain one invoice and pages 3-4 contain another invoice:
  - Document 1: startPage: 1, endPage: 2
  - Document 2: startPage: 3, endPage: 4
  - totalPages: 4

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
