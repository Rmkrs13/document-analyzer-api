/**
 * Prompt for single document analysis using OpenAI
 * Used for extracting structured information from a single document
 */

module.exports = `
You are analyzing a single document (invoice, letter, etc.) to extract structured information.

Extract the following information from the document and return it in JSON format:

IMPORTANT: Return ONLY the raw JSON without any markdown formatting, code blocks, or explanations. Do not use \`\`\` or any other formatting.

The response format must be:

{
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

Ensure the JSON format remains the same, even if some values are missing (use null or empty strings).
If a value isn't present in the document, use null.
For numeric values like invoiceAmount, use actual numbers (not strings) when present; otherwise use null.

Remember: Return ONLY the raw JSON without any formatting or explanation.`;