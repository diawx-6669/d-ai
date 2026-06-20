// src/pages/DashboardPage.jsx
import { useState, useRef } from "react";
import { runAudit, getAuditStatus } from "../api/audit";

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState(null); // null | "queued" | "running" | "done" | "error"
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null); // useRef, не useState — иначе clearInterval не сработает при ре-рендере

  // Останавливаем поллинг
  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Один тик поллинга — запрашиваем статус у бэкенда
  const pollStatus = async (jobId) => {
    try {
      const data = await getAuditStatus(jobId); // GET /api/audit/:id
      setStatus(data.status);

      if (data.status === "done") {
        stopPolling();
        setReport(data.report); // показываем результат
      } else if (data.status === "error") {
        stopPolling();
        setError("Анализ завершился с ошибкой на сервере");
      }
      // "queued" / "running" — просто ждём следующего тика
    } catch (e) {
      stopPolling();
      setError(e.message);
    }
  };

  const handleSubmit = async () => {
    // Сброс предыдущего состояния
    setError(null);
    setReport(null);
    setStatus(null);
    stopPolling();

    try {
      // 1. POST — получаем queued job
      const job = await runAudit(url);
      setStatus(job.status); // "queued"

      // 2. Запускаем поллинг каждые 2 секунды
      intervalRef.current = setInterval(() => pollStatus(job.id), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const isPolling = !!intervalRef.current;

  return (
    <div>
      <h1>Аудит сайта</h1>

      <div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={isPolling}
        />
        <button onClick={handleSubmit} disabled={isPolling || !url}>
          {isPolling ? "Анализирую…" : "Запустить аудит"}
        </button>
      </div>

      {/* Статус во время ожидания */}
      {status && status !== "done" && (
        <p>
          Статус: <strong>{status}</strong>…
        </p>
      )}

      {/* Ошибка */}
      {error && <p style={{ color: "red" }}>Ошибка: {error}</p>}

      {/* Результат */}
      {report && (
        <div>
          <h2>Результат — оценка: {report.score} / 100</h2>

          {report.issues?.length > 0 && (
            <>
              <h3>Проблемы</h3>
              <ul>
                {report.issues.map((issue, i) => (
                  <li key={i}>
                    <strong>[{issue.severity}]</strong> {issue.category}:{" "}
                    {issue.description}
                    {issue.line ? ` (строка ${issue.line})` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.recommendations?.length > 0 && (
            <>
              <h3>Рекомендации</h3>
              <ul>
                {report.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {report.ideas?.length > 0 && (
            <>
              <h3>Идеи</h3>
              <ul>
                {report.ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
