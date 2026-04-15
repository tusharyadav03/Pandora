// services/aiService.js — OpenAI integration for explanations & fix suggestions
const OpenAI = require("openai");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Lazily build the client so the server still boots without a key.
let client = null;
function getClient() {
  if (!OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: OPENAI_API_KEY });
  return client;
}

/**
 * Build a compact prompt for the model. We trim very long content so
 * we don't blow up token usage.
 */
function buildPrompt(content, issues, beginnerMode = false) {
  const trimmedContent =
    content.length > 4000 ? content.slice(0, 4000) + "\n...[truncated]" : content;

  const issueList =
    issues.length === 0
      ? "None detected by static scan."
      : issues
          .map(
            (i, idx) =>
              `${idx + 1}. [${i.severity.toUpperCase()}] ${i.type} — ${i.message} (match: ${i.match})`
          )
          .join("\n");

  const tone = beginnerMode
    ? "Explain like the reader is a complete beginner. Avoid jargon, use short sentences, and use everyday analogies (e.g. 'a password in code is like leaving your house key under the doormat')."
    : "Explain risks and suggest fixes in simple, professional terms.";

  return `Analyze the following code and security issues: ${trimmedContent}
Detected issues: ${issueList}
${tone}

Respond ONLY with valid JSON in this exact shape:
{
  "explanation": "plain-language explanation of the risks",
  "fixes": "concrete, simple fix suggestions"
}`;
}

/**
 * Ask OpenAI to explain the issues and suggest fixes.
 * Returns { explanation, fixes }. Falls back to a static message
 * if the API key is missing or the call fails.
 */
async function explainAndSuggest(content, issues, beginnerMode = false) {
  const openai = getClient();

  if (!openai) {
    return {
      explanation:
        "AI explanation unavailable (OPENAI_API_KEY not configured on the server).",
      fixes:
        issues.length === 0
          ? "No issues detected — nothing to fix."
          : "Set OPENAI_API_KEY in your environment to receive AI-generated fix suggestions.",
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a senior application security engineer. Be concise, accurate, and use plain language. Always respond with valid JSON.",
        },
        { role: "user", content: buildPrompt(content, issues, beginnerMode) },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    return {
      explanation:
        typeof parsed.explanation === "string"
          ? parsed.explanation
          : "No explanation returned by AI.",
      fixes:
        typeof parsed.fixes === "string"
          ? parsed.fixes
          : "No fix suggestions returned by AI.",
    };
  } catch (err) {
    console.error("OpenAI request failed:", err.message);
    return {
      explanation:
        "AI explanation unavailable due to an error contacting OpenAI.",
      fixes:
        "Please review the detected issues manually and rotate any exposed secrets.",
    };
  }
}

module.exports = { explainAndSuggest };
