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

function ScoreRing({ score }) {
  const r = 36, circ = 2 * Math.PI * r;
  const fill = circ - (score / 100) * circ;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx="44" cy="44" r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x="44" y="48" textAnchor="middle"
        fill={scoreColor(score)} fontSize="18" fontWeight="700"
        fontFamily="var(--font-mono)">{score}</text>
    </svg>
  );
}

// Форматирует текст ошибки из SSE в понятное сообщение
function friendlyError(errText) {
  if (!errText) return "⚠️ Неизвестная ошибка.";
  if (errText.includes("quota") || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("exceeded"))
    return "⚠️ Превышен лимит Gemini API. Подождите минуту и попробуйте снова.";
  if (errText.includes("not found") || errText.includes("404"))
    return "⚠️ Модель AI недоступна. Обратитесь к администратору.";
  if (errText.includes("25 секунд") || errText.includes("timeout") || errText.includes("Таймаут"))
    return "⏱ AI-сервис не успел ответить. Попробуйте снова.";
  if (errText.includes("connection refused") || errText.includes("недоступен"))
    return "⚠️ AI-сервис временно недоступен. Попробуйте позже.";
  // Обрезаем длинные технические сообщения
  if (errText.length > 120) return "⚠️ Ошибка AI-сервиса. Попробуйте позже.";
  return `⚠️ ${errText}`;
}

export default function DashboardPage() {
  const [url, setUrl]             = useState("");
  const [status, setStatus]       = useState(null);
  const [report, setReport]       = useState(null);
  const [error, setError]         = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "Привет! Запустите аудит сайта, и я помогу разобрать результаты." }
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let assistantIdx = null;

    const appendChunk = (chunk) => {
      setChatMessages(m => {
        if (assistantIdx === null) {
          assistantIdx = m.length;
          return [...m, { role: "assistant", text: chunk }];
        }
        return m.map((msg, i) =>
          i === assistantIdx ? { ...msg, text: msg.text + chunk } : msg
        );
      });
    };

    try {
      const BASE  = import.meta?.env?.VITE_API_BASE || "";
      const token = localStorage.getItem("dai_token") || "";

      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, report }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `Сервер вернул ${res.status}`;
        try {
          const json = await res.json();
          if (json?.error) detail = friendlyError(json.error);
        } catch (_) {}
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") break;

          try {
            const parsed = JSON.parse(raw);
            if (parsed?.error) {
              appendChunk(friendlyError(parsed.error));
              return;
            }
            // Поддерживаем форматы: { chunk }, { delta }, { text }, { reply }, { message }
            const text = parsed?.chunk ?? parsed?.delta ?? parsed?.text ?? parsed?.reply ?? parsed?.message;
            if (text) appendChunk(text);
          } catch (_) {
            // Нераспарсенный чанк — пропускаем, не показываем мусор
          }
        }
      }

      if (assistantIdx === null) {
        appendChunk("(пустой ответ от AI-сервиса)");
      }
    } catch (err) {
      const isTimeout = err.name === "AbortError";
      const text = isTimeout
        ? "⏱ AI-сервис не ответил за 30 секунд. Попробуйте позже."
        : friendlyError(err.message);

      if (assistantIdx !== null) {
        setChatMessages(m =>
          m.map((msg, i) => i === assistantIdx ? { ...msg, text: msg.text + `\n\n${text}` } : msg)
        );
      } else {
        appendChunk(text);
      }
    } finally {
      clearTimeout(timeoutId);
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const isPolling = !!intervalRef.current;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-base)" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 200 : 52,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.25s ease",
        overflow: "hidden",
      }}>
        <div style={{ padding: "18px 14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🛡️</span>
          {sidebarOpen && <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 15 }}>d-ai</span>}
        </div>

        <nav style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {[
            { label: "Новый аудит", icon: "＋", active: true },
            { label: "Все аудиты",  icon: "≡", active: false },
          ].map(({ label, icon, active }) => (
            <div key={label} title={!sidebarOpen ? label : undefined} style={{
              padding: sidebarOpen ? "8px 12px" : "8px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              cursor: "pointer",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              background: active ? "var(--bg-card)" : "transparent",
              display: "flex", alignItems: "center", gap: 10,
              whiteSpace: "nowrap",
              transition: "background var(--transition)",
            }}>
              <span style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: "center" }}>{icon}</span>
              {sidebarOpen && label}
            </div>
          ))}
        </nav>

        <button onClick={() => setSidebarOpen(o => !o)} style={{
          margin: "0 8px 12px",
          padding: "7px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {sidebarOpen ? "◂" : "▸"}
        </button>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <header style={{
          padding: "0 24px",
          height: 56,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--bg-surface)",
          flexShrink: 0,
        }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="https://example.com"
            style={{ flex: 1, maxWidth: 480, padding: "7px 12px", fontSize: 13 }}
          />
          <button
            className="btn-red"
            onClick={handleSubmit}
            disabled={!url || isPolling}
            style={{ opacity: !url || isPolling ? 0.5 : 1 }}
          >
            {isPolling ? "Анализирую…" : "Запустить аудит"}
          </button>
        </header>

        <main style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
          {!report && !status && !error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40 }}>🛡️</div>
              <p style={{ fontSize: 14 }}>Введите URL и нажмите «Запустить аудит»</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {CATEGORIES.map(c => (
                  <span key={c} style={{ padding: "4px 14px", borderRadius: 99, border: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {status && status !== "done" && !report && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
              <span className="pulse-dot" />
              Статус: <strong style={{ color: "var(--text-primary)" }}>{status}</strong>
            </div>
          )}

          {error && (
            <div style={{ padding: "12px 16px", background: "var(--red-dim)", border: "1px solid var(--border-focus)", borderRadius: "var(--radius-sm)", color: "var(--red)", fontSize: 14 }}>
              {error}
            </div>
          )}

          {report && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
                <ScoreRing score={report.score} />
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Итоговая оценка</div>
                  <div style={{ color: "var(--text-primary)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>{report.score}<span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 400 }}> / 100</span></div>
                  {report.issues?.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <span className="badge badge-critical">{report.issues.filter(i => ["critical","high"].includes(i.severity?.toLowerCase())).length} critical</span>
                      <span className="badge badge-warning">{report.issues.filter(i => ["warning","medium"].includes(i.severity?.toLowerCase())).length} warnings</span>
                    </div>
                  )}
                </div>
              </div>

              {report.issues?.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Проблемы</span>
                    <span style={{ marginLeft: "auto", background: "var(--red-dim)", color: "var(--red)", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99 }}>{report.issues.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {report.issues.map((issue, i) => (
                      <div key={i} style={{ padding: "12px 20px", borderBottom: i < report.issues.length - 1 ? "1px solid var(--border)" : "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span className={severityClass(issue.severity)} style={{ flexShrink: 0, marginTop: 2 }}>{issue.severity}</span>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{issue.category}</span>
                          <p style={{ color: "var(--text-primary)", fontSize: 13, marginTop: 2, lineHeight: 1.5, wordBreak: "break-word" }}>
                            {issue.description}
                            {issue.line && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> · строка {issue.line}</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.recommendations?.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Рекомендации</span>
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: "8px 0" }}>
                    {report.recommendations.map((r, i) => (
                      <li key={i} style={{ padding: "10px 20px", display: "flex", gap: 10, borderBottom: i < report.recommendations.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ color: "var(--red)", fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>›</span>
                        <span style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.ideas?.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Идеи</span>
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: "8px 0" }}>
                    {report.ideas.map((idea, i) => (
                      <li key={i} style={{ padding: "10px 20px", display: "flex", gap: 10, borderBottom: i < report.ideas.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0, lineHeight: 1.4 }}>·</span>
                        <span style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>{idea}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Chat panel ── */}
      <aside style={{
        width: 300,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red)", flexShrink: 0, animation: "pulse-dot 1.6s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>AI-ассистент</span>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                /* FIX: текст не выходит за рамки */
                maxWidth: "85%",
                minWidth: 0,
                padding: "8px 12px",
                borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                background: msg.role === "user" ? "var(--red)" : "var(--bg-card)",
                border: msg.role === "user" ? "none" : "1px solid var(--border)",
                color: "var(--text-primary)",
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "break-word",
              }}>
                {msg.text}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: "flex", gap: 5, padding: "6px 4px" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: `pulse-dot 1.2s ${i * 0.18}s infinite` }} />
              ))}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChat()}
            placeholder="Спросите об аудите…"
            style={{ flex: 1, minWidth: 0, padding: "8px 12px", fontSize: 13 }}
          />
          <button
            className="btn-red"
            onClick={handleChat}
            disabled={!chatInput.trim() || chatLoading}
            style={{ padding: "8px 13px", fontSize: 15, flexShrink: 0, opacity: !chatInput.trim() || chatLoading ? 0.4 : 1, cursor: !chatInput.trim() || chatLoading ? "not-allowed" : "pointer" }}
          >
            →
          </button>
        </div>
      </aside>
    </div>
  );
}
