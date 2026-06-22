// src/pages/DashboardPage.jsx
import { useState, useRef } from "react";
import { runAudit, getAuditStatus } from "../api/audit";

const severityClass = (s) => {
  if (!s) return "";
  const key = s.toLowerCase();
  if (key === "critical" || key === "high") return "badge badge-critical";
  if (key === "warning" || key === "medium") return "badge badge-warning";
  return "badge badge-info";
};

function scoreColor(score) {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#faad14";
  return "var(--red)";
}

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const pollStatus = async (jobId) => {
    try {
      const data = await getAuditStatus(jobId);
      setStatus(data.status);
      if (data.status === "done") {
        stopPolling();
        setReport(data.report);
      } else if (data.status === "error") {
        stopPolling();
        setError("Анализ завершился с ошибкой на сервере");
      }
    } catch (e) {
      stopPolling();
      setError(e.message);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setReport(null);
    setStatus(null);
    stopPolling();
    try {
      const job = await runAudit(url);
      setStatus(job.status);
      intervalRef.current = setInterval(() => pollStatus(job.id), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const isPolling = !!intervalRef.current;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          d-ai / audit
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          Аудит сайта
        </h1>
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={isPolling}
          onKeyDown={(e) => e.key === "Enter" && !isPolling && url && handleSubmit()}
          style={{ flex: 1, padding: "10px 14px", fontSize: 15 }}
        />
        <button
          className="btn-red"
          onClick={handleSubmit}
          disabled={isPolling || !url}
          style={{ opacity: isPolling || !url ? 0.45 : 1, cursor: isPolling || !url ? "not-allowed" : "pointer" }}
        >
          {isPolling ? "Анализирую…" : "Запустить"}
        </button>
      </div>

      {/* Status */}
      {status && status !== "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, color: "var(--text-secondary)", fontSize: 14 }}>
          <span className="pulse-dot" />
          Статус: <strong style={{ color: "var(--text-primary)" }}>{status}</strong>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px",
          background: "var(--red-dim)",
          border: "1px solid var(--border-focus)",
          borderRadius: "var(--radius-sm)",
          color: "var(--red)",
          fontSize: 14,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Report */}
      {report && (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 28,
          marginTop: 8,
        }}>
          {/* Score */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 48, fontWeight: 800, color: scoreColor(report.score), letterSpacing: "-0.04em", lineHeight: 1 }}>
              {report.score}
            </span>
            <span style={{ fontSize: 18, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>/100</span>
            <span style={{ marginLeft: "auto", color: "var(--text-secondary)", fontSize: 13 }}>итоговая оценка</span>
          </div>

          {/* Issues */}
          {report.issues?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Проблемы
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.issues.map((issue, i) => (
                  <div key={i} style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}>
                    <span className={severityClass(issue.severity)} style={{ flexShrink: 0, marginTop: 2 }}>
                      {issue.severity}
                    </span>
                    <div>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{issue.category}</span>
                      <p style={{ color: "var(--text-primary)", fontSize: 14, marginTop: 2 }}>
                        {issue.description}
                        {issue.line && <span style={{ color: "var(--text-muted)", fontSize: 12 }}> · строка {issue.line}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {report.recommendations?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Рекомендации
              </h3>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {report.recommendations.map((r, i) => (
                  <li key={i} style={{ color: "var(--text-secondary)", fontSize: 14, display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--red)", flexShrink: 0 }}>›</span>
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Ideas */}
          {report.ideas?.length > 0 && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Идеи
              </h3>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {report.ideas.map((idea, i) => (
                  <li key={i} style={{ color: "var(--text-secondary)", fontSize: 14, display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>·</span>
                    {idea}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
