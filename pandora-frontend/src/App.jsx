import { useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/scan";

const riskStyles = {
  None: "bg-slate-100 text-slate-700 border-slate-200",
  Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  High: "bg-red-50 text-red-700 border-red-200",
};

// Visual risk meter config: color, fill %, and label
const riskMeter = {
  None:   { bar: "bg-emerald-500", track: "bg-emerald-100", pct: 5,   emoji: "✅", label: "Looks Clean" },
  Low:    { bar: "bg-lime-500",    track: "bg-lime-100",    pct: 30,  emoji: "🟢", label: "Low Risk" },
  Medium: { bar: "bg-amber-400",   track: "bg-amber-100",   pct: 65,  emoji: "🟡", label: "Medium Risk" },
  High:   { bar: "bg-red-500",     track: "bg-red-100",     pct: 95,  emoji: "🔴", label: "High Risk" },
};

export default function App() {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [beginnerMode, setBeginnerMode] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setContent(String(ev.target?.result || ""));
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsText(file);
  };

  const handleScan = async (asBeginner = beginnerMode) => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Please enter some content or upload a file before scanning.");
      return;
    }

    setError("");
    setResult(null);
    setLoading(true);

    try {
      const { data } = await axios.post(API_URL, {
        content: trimmed,
        beginnerMode: asBeginner,
      });
      setResult(data);
      setBeginnerMode(asBeginner);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.message ||
        "Something went wrong while scanning.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setContent("");
    setFileName("");
    setResult(null);
    setError("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Pandora <span className="text-indigo-600">AI Risk Scanner</span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Paste content or upload a file to detect risks, get an AI
            explanation, and suggested fixes.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="content"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Content to scan
          </label>
          <textarea
            id="content"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste code, text, or data to analyze..."
            className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="file"
                accept=".txt,.md,.json,.js,.ts,.py,.html,.css,.csv,.log"
                onChange={handleFileUpload}
                className="hidden"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" />
              </svg>
              {fileName ? "Replace file" : "Upload file (optional)"}
            </label>
            {fileName && (
              <span className="text-xs text-slate-500">
                Loaded: <span className="font-medium">{fileName}</span>
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearAll}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleScan(false)}
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
              >
                {loading ? "Scanning..." : "Scan"}
              </button>
              <button
                type="button"
                onClick={() => handleScan(true)}
                disabled={loading || !content.trim()}
                title="Re-explain results in absolute beginner terms"
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                🧒 Explain like I'm a beginner
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>

        {result && <ResultsPanel result={result} beginnerMode={beginnerMode} />}
      </div>
    </div>
  );
}

function ResultsPanel({ result, beginnerMode }) {
  const { risk, issues = [], explanation, fixes = [], summary } = result;
  const riskClass = riskStyles[risk] || riskStyles.None;
  const meter = riskMeter[risk] || riskMeter.None;
  const [copied, setCopied] = useState(false);

  // `fixes` may come as a string (current backend) or an array — normalize for copy.
  const fixesText = Array.isArray(fixes)
    ? fixes
        .map((f) => (typeof f === "string" ? f : f.suggestion || JSON.stringify(f)))
        .join("\n• ")
    : String(fixes || "");

  const copyFixes = async () => {
    if (!fixesText.trim()) return;
    try {
      await navigator.clipboard.writeText(fixesText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently ignore – clipboard may be blocked
    }
  };

  return (
    <section className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Scan Results</h2>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${riskClass}`}
        >
          Risk: {risk}
        </span>
      </div>

      {/* ---------- Visual Risk Score (traffic-light meter) ---------- */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Risk Score
          </div>
          <div className="text-sm font-semibold text-slate-700">
            {meter.emoji} {meter.label}
          </div>
        </div>
        <div className={`h-3 w-full overflow-hidden rounded-full ${meter.track}`}>
          <div
            className={`${meter.bar} h-full rounded-full transition-all duration-700 ease-out`}
            style={{ width: `${meter.pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
          <span>SAFE</span>
          <span>CAUTION</span>
          <span>DANGER</span>
        </div>
      </div>

      {summary && typeof summary === "string" && (
        <p className="text-sm text-slate-600">{summary}</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Issues ({issues.length})
        </h3>
        {issues.length === 0 ? (
          <p className="text-sm text-slate-500">No issues detected.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((issue, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
              >
                {typeof issue === "string" ? (
                  issue
                ) : (
                  <div>
                    <div className="font-medium text-slate-800">
                      {issue.type || issue.title || "Issue"}
                    </div>
                    {issue.description && (
                      <div className="mt-1 text-slate-600">
                        {issue.description}
                      </div>
                    )}
                    {issue.severity && (
                      <div className="mt-1 text-xs uppercase text-slate-500">
                        Severity: {issue.severity}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {explanation && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              AI Explanation
            </h3>
            {beginnerMode && (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                Beginner mode
              </span>
            )}
          </div>
          <div className="whitespace-pre-wrap rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-slate-800">
            {explanation}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Suggested Fixes
          </h3>
          <button
            type="button"
            onClick={copyFixes}
            disabled={!fixesText.trim()}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            } disabled:opacity-50`}
          >
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
        </div>
        {Array.isArray(fixes) ? (
          fixes.length === 0 ? (
            <p className="text-sm text-slate-500">No fixes suggested.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {fixes.map((fix, idx) => (
                <li key={idx}>
                  {typeof fix === "string"
                    ? fix
                    : fix.suggestion || JSON.stringify(fix)}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {fixesText || "No fixes suggested."}
          </div>
        )}
      </div>
    </section>
  );
}
