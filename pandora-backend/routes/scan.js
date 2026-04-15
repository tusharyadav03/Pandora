// routes/scan.js — Controller for POST /scan
const express = require("express");
const router = express.Router();
const { scanContent } = require("../services/scanService");
const { explainAndSuggest } = require("../services/aiService");

// POST /scan
// Body:     { content: "string" }
// Response: { risk, issues, explanation, fixes }
router.post("/", async (req, res) => {
  const { content, beginnerMode } = req.body;

  // ---------- Input validation ----------
  if (typeof content !== "string") {
    return res.status(400).json({
      error: "Invalid input. Please provide 'content' as a string.",
    });
  }
  if (content.trim().length === 0) {
    return res.status(400).json({
      error: "Empty input. 'content' cannot be blank.",
    });
  }
  if (content.length > 100_000) {
    return res.status(413).json({
      error: "Payload too large. Limit content to 100,000 characters.",
    });
  }

  // ---------- Run scan + AI analysis ----------
  try {
    const report = scanContent(content);
    const { explanation, fixes } = await explainAndSuggest(
      content,
      report.issues,
      Boolean(beginnerMode)
    );

    // Map internal "none|low|medium|high" to capitalized risk label
    const riskLabel =
      report.risk.charAt(0).toUpperCase() + report.risk.slice(1);

    return res.status(200).json({
      risk: riskLabel,
      issues: report.issues,
      explanation,
      fixes,
      summary: report.summary,
    });
  } catch (err) {
    console.error("Scan error:", err);
    return res.status(500).json({ error: "Failed to scan content." });
  }
});

module.exports = router;
