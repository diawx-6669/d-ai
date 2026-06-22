// src/pages/DashboardPage.jsx
import { useState, useRef } from "react";
import { runAudit, getAuditStatus } from "../api/audit";

const CATEGORIES = ["SEO", "Производительность", "Безопасность", "Доступность"];

const severityClass = (s = "") => {
  const k = s.toLowerCase();
  if (k === "critical" || k === "high") return "badge badge-critical";
  if (k === "warning"  || k === "medium") return "badge badge-warning";
  return "badge badge-info";
};

function scoreColor(score) {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#faad14";
  return "var(--red)";
}

export default function DashboardPage() {
  const [url, setUrl]       = useState("");
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError]   = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "Привет! Запустите аудит, и я помогу разобрать результаты." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const intervalRef = useRef(null);
  const chatEndRef  = useRef(null);

  const stopPolling = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const pollStatus = async (jobId) => {
    try {
      const data = await getAuditStatus(jobId);
      setStatus(data.status);
      if (data.status === "done")  { stopPolling(); setReport(data.report); }
      if (data.status === "error") { stopPolling(); setError("Анализ завершился с ошибкой на сервере"); }
    } catch (e) { stopPolling(); setError(e.message); }
  };

  const handleSubmit = async () => {
    if (!url) return;
    setError(null); setReport(null); setStatus(null); stopPolling();
    try {
      const job = await runAudit(url);
      setStatus(job.status);
      intervalRef.current = setInterval(() => pollStatus(job.id), 2000);
    } catch (e) { setError(e.message); }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(m => [...m, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const BASE = import.meta?.env?.VITE_API_BASE || "";
      const token = localStorage.getItem("dai_token") || "";
      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, report }),
      });
      const data = await res.json();
      setChatMessages(m => [...m, { role: "assistant", text: data.reply || data.message || "…" }]);
    } catch (e) {
      setChatMessages(m => [...m, { role: "assistant", text: "Ошибка соединения с AI-сервисом." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const isPolling = !!intervalRef.current;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-base)" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 200, flexShrink: 0,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        padding: "20px 0",
      }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 20 }}>🛡️</div>
          <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 15, marginTop: 4 }}>d-ai</div>
        </div>
        <nav style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { label: "Новый аудит",  active: true },
            { label: "Все аудиты",  active: false },
          ].map(({ label, active }) => (
            <div key={label} style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              cursor: "pointer",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              background: active ? "var(--bg-card)" : "transparent",
              transition: "background var(--transition)",
            }}>{label}</div>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>© d-ai</div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <header style={{
          height: 56, flexShrink: 0,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center",
          padding: "0 20px", gap: 12,
        }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !isPolling && handleSubmit()}
            placeholder="https://example.com"
            disabled={isPolling}
            style={{ flex: 1, padding: "8px 14px", fontSize: 14, maxWidth: 520 }}
          />
          <button
            className="btn-red"
            onClick={handleSubmit}
            disabled={isPolling || !url}
            style={{ opacity: isPolling || !url ? 0.45 : 1, cursor: isPolling || !url ? "not-allowed" : "pointer", fontSize: 12, letterSpacing: "0.1em" }}
          >
            {isPolling ? "АНАЛИЗ…" : "АНАЛИЗ"}
          </button>
          {isPolling && <span className="pulse-dot" />}
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: "auto", padding: 28 }}>

          {/* Idle state */}
          {!report && !error && !status && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, color: "var(--text-secondary)", textAlign: "center" }}>
              <div style={{ fontSize: 40 }}>🛡️</div>
              <div>
                <p style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Готов к аудиту</p>
                <p style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.6 }}>
                  Введите URL сайта и нажмите <span style={{ color: "var(--red)", fontWeight: 600 }}>АНАЛИЗ</span>.<br />
                  ИИ проверит его на ключевые параметры.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {CATEGORIES.map(c => (
                  <span key={c} style={{
                    padding: "4px 12px", borderRadius: 99,
                    border: "1px solid var(--border)",
                    fontSize: 12, color: "var(--text-muted)",
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Running status */}
          {status && status !== "done" && !report && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", fontSize: 14 }}>
              <span className="pulse-dot" />
              Статус: <strong style={{ color: "var(--text-primary)" }}>{status}</strong>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: "12px 16px", background: "var(--red-dim)", border: "1px solid var(--border-focus)", borderRadius: "var(--radius-sm)", color: "var(--red)", fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Report */}
          {report && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Score */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 52, fontWeight: 800, color: scoreColor(report.score), letterSpacing: "-0.04em", lineHeight: 1 }}>{report.score}</span>
                <div>
                  <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Итоговая оценка</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>/100 баллов</div>
                </div>
              </div>

              {/* Issues */}
              {report.issues?.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Проблемы</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.issues.map((issue, i) => (
                      <div key={i} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span className={severityClass(issue.severity)} style={{ flexShrink: 0, marginTop: 1 }}>{issue.severity}</span>
                        <div>
                          <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{issue.category}</span>
                          <p style={{ color: "var(--text-primary)", fontSize: 13, marginTop: 2 }}>
                            {issue.description}
                            {issue.line && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> · строка {issue.line}</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {report.recommendations?.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Рекомендации</h3>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.recommendations.map((r, i) => (
                      <li key={i} style={{ color: "var(--text-secondary)", fontSize: 13, display: "flex", gap: 8 }}>
                        <span style={{ color: "var(--red)", flexShrink: 0 }}>›</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ideas */}
              {report.ideas?.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Идеи</h3>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.ideas.map((idea, i) => (
                      <li key={i} style={{ color: "var(--text-secondary)", fontSize: 13, display: "flex", gap: 8 }}>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>·</span>{idea}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Chat sidebar ── */}
      <aside style={{
        width: 300, flexShrink: 0,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          AI-ассистент
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: msg.role === "user" ? "var(--red)" : "var(--bg-card)",
                border: msg.role === "user" ? "none" : "1px solid var(--border)",
                color: "var(--text-primary)",
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                {msg.text}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: `pulse-dot 1.2s ${i*0.2}s infinite` }} />
              ))}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleChat()}
            placeholder="Спросите об аудите…"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
          />
          <button
            className="btn-red"
            onClick={handleChat}
            disabled={!chatInput.trim() || chatLoading}
            style={{ padding: "8px 14px", fontSize: 13, opacity: !chatInput.trim() || chatLoading ? 0.45 : 1, cursor: !chatInput.trim() || chatLoading ? "not-allowed" : "pointer" }}
          >
            →
          </button>
        </div>
      </aside>
    </div>
  );
}
