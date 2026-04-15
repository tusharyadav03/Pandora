# Pandora — AI Risk Scanner (Frontend)

Minimal Vite + React + Tailwind UI for the Pandora AI Risk Scanner.

## Setup

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173`. The dev server proxies
`POST /scan` to `http://localhost:3000` (the pandora-backend default).

## Configure backend URL

To point at a different backend, create a `.env.local`:

```
VITE_API_URL=https://your-backend.example.com/scan
```

## Backend contract

`POST /scan`

Request body:

```json
{ "content": "string to analyze" }
```

Response body:

```json
{
  "risk": "Low | Medium | High",
  "issues": [...],
  "explanation": "AI explanation text",
  "fixes": ["fix one", "fix two"],
  "summary": "optional summary"
}
```
