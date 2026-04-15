// server.js — Entry point for Pandora AI Risk Scanner backend
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const scanRoute = require("./routes/scan");

const app = express();
const PORT = process.env.PORT || 5050;

// ---------- Middleware ----------
app.use(cors());                       // Allow cross-origin requests (frontend can call API)
app.use(express.json());               // Parse JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Simple request logger (helpful while developing)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------- Routes ----------
app.get("/", (_req, res) => {
  res.json({ message: "Pandora AI Risk Scanner API is running" });
});

app.use("/scan", scanRoute);

// ---------- 404 Handler ----------
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ---------- Error Handler ----------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Pandora backend running at http://localhost:${PORT}`);
});
