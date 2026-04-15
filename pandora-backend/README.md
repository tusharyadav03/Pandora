# Pandora AI Risk Scanner — Backend

A minimal Node.js + Express backend that exposes a single endpoint to "scan" content and return a risk report.

## Folder structure

```
pandora-backend/
├── routes/
│   └── scan.js         # POST /scan handler
├── server.js           # Express app entry point
├── package.json
├── .gitignore
└── README.md
```

## Setup

1. Move into the project folder:

   ```bash
   cd pandora-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

   (Or install them individually:)

   ```bash
   npm install express cors
   npm install --save-dev nodemon
   ```

## Run the server

Production mode:

```bash
npm start
```

Development mode (auto-restart on file changes):

```bash
npm run dev
```

The server runs on `http://localhost:5000`.

## API

### POST /scan

Request:

```json
{ "content": "Some text to scan" }
```

Response:

```json
{
  "risk": "Medium",
  "issues": ["Example issue"],
  "suggestion": "Example fix"
}
```

### Test with curl

```bash
curl -X POST http://localhost:5000/scan \
  -H "Content-Type: application/json" \
  -d '{"content":"hello world"}'
```
