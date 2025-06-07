# Document Analyzer API

> **Academic Project Disclaimer**  
> This API was created as part of the bachelor's thesis/graduation assignment of **Kevin Malekera**, **Lars Raeymaekers** & **Jenna Van De Vyver** for their Digital Experience Design study at Thomas More University of Applied Sciences.
> 
> **Project Information:**
> - **Main Project**: [Loepos Platform](https://github.com/kevinmlk/loepos-platform)
> - **Live Demo**: [app.loepos.be](https://app.loepos.be)
> - **Landing Page**: [loepos.be](https://loepos.be)
> - **Description**: AI-driven Laravel platform for social services

A Netlify serverless API for analyzing documents using OpenAI's GPT-4 with vision capabilities. The API supports PDFs and images, extracting structured information from invoices, letters, and other documents.

## Authentication

All endpoints require bearer token authentication. Include the following header in your requests:

```
Authorization: Bearer YOUR_SECRET_KEY
```

## Endpoints

### 1. `/api/analyze` - Single Document Analysis

Analyzes a single document and extracts structured information.

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

**Supported Files:**
- PDF files (including scanned PDFs)
- Images (JPG, PNG, etc.)

**Request:**
```bash
curl -X POST https://your-domain.netlify.app/api/analyze \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -F "file=@document.pdf"
```

**Response:**
```json
{
  "success": true,
  "fileType": "application/pdf",
  "numPages": 2,
  "data": {
    "sender": {
      "name": "Acme Corporation",
      "address": "123 Business St, City, State 12345",
      "companyNumber": "12345678",
      "email": "billing@acme.com",
      "phone": "+1-555-0123"
    },
    "receiver": {
      "name": "John Doe",
      "address": "456 Customer Ave, City, State 67890"
    },
    "documentDetails": {
      "caseNumber": "INV-2024-001",
      "invoiceAmount": 1250.00,
      "dueDate": "2024-02-15",
      "dateCreated": "2024-01-15",
      "dateSent": "2024-01-16",
      "summary": "Invoice for consulting services rendered in January 2024",
      "documentType": "invoice"
    }
  }
}
```

### 2. `/api/page-splitter` - Document Boundary Detection

Identifies individual documents within a multi-document PDF and determines page boundaries.

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

**Supported Files:**
- PDF files (including scanned PDFs)
- Images (for single document analysis)

**Request:**
```bash
curl -X POST https://your-domain.netlify.app/api/page-splitter \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -F "file=@multi-document.pdf"
```

**Response:**
```json
{
  "totalPages": 6,
  "totalDocuments": 2,
  "documentBoundaries": [
    {
      "documentNumber": 1,
      "startPage": 1
    },
    {
      "documentNumber": 2,
      "startPage": 4
    }
  ]
}
```

### 3. `/api/process-document` - Multi-Document Analysis

Processes multi-document PDFs and extracts structured information from each document with page boundary information.

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

**Supported Files:**
- PDF files (including scanned PDFs)
- Images

**Request:**
```bash
curl -X POST https://your-domain.netlify.app/api/process-document \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -F "file=@multi-document.pdf"
```

**Response:**
```json
{
  "success": true,
  "fileType": "application/pdf",
  "numPages": 4,
  "content": {
    "totalPages": 4,
    "documents": [
      {
        "startPage": 1,
        "endPage": 2,
        "sender": {
          "name": "Company A",
          "address": "123 First St, City, State",
          "companyNumber": "111111",
          "email": "billing@companya.com",
          "phone": "+1-555-0001"
        },
        "receiver": {
          "name": "Client One",
          "address": "789 Client Ave, City, State"
        },
        "documentDetails": {
          "caseNumber": "INV-A-001",
          "invoiceAmount": 500.00,
          "dueDate": "2024-02-01",
          "dateCreated": "2024-01-01",
          "dateSent": "2024-01-02",
          "summary": "Invoice for services from Company A",
          "documentType": "invoice"
        }
      },
      {
        "startPage": 3,
        "endPage": 4,
        "sender": {
          "name": "Company B",
          "address": "456 Second St, City, State",
          "companyNumber": "222222",
          "email": "billing@companyb.com",
          "phone": "+1-555-0002"
        },
        "receiver": {
          "name": "Client Two",
          "address": "321 Customer Rd, City, State"
        },
        "documentDetails": {
          "caseNumber": "INV-B-001",
          "invoiceAmount": 750.00,
          "dueDate": "2024-02-15",
          "dateCreated": "2024-01-15",
          "dateSent": "2024-01-16",
          "summary": "Invoice for services from Company B",
          "documentType": "invoice"
        }
      }
    ]
  }
}
```

## Features

### Document Processing Capabilities
- **PDF Text Extraction**: Extracts text from regular PDFs
- **OCR for Scanned Documents**: Uses GPT-4 Vision for scanned PDFs and images
- **Image Processing**: Automatically compresses and optimizes images for better analysis
- **Multi-Document Support**: Identifies and processes multiple documents within a single PDF

### Data Extraction
- Sender and receiver information
- Document metadata (dates, case numbers, amounts)
- Document type identification
- Page boundary detection
- Structured JSON output

## Error Handling

All endpoints return appropriate HTTP status codes and error messages:

### Common Error Responses

**400 Bad Request**
```json
{
  "error": "No file found in the request"
}
```

**403 Unauthorized**
```json
{
  "error": "Unauthorized access"
}
```

**405 Method Not Allowed**
```json
{
  "error": "Method not allowed"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to process file",
  "message": "Detailed error message"
}
```

## Environment Variables

The following environment variables must be configured:

- `OPENAI_API_KEY`: Your OpenAI API key for GPT-4 access
- `SECRET_KEY`: Bearer token for API authentication

## Technical Details

### Dependencies
- OpenAI GPT-4 with vision capabilities
- PDF parsing with `pdf-parse`
- Image processing with `sharp`
- Multipart form data parsing

### File Size Limitations
- Images are automatically compressed and resized for optimal processing
- PDF files are processed as-is but large files may have longer processing times

### CORS Support
All endpoints include proper CORS headers for cross-origin requests.