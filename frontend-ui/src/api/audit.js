// src/api/audit.js
const BASE = import.meta.env.VITE_API_BASE || "";
const REQUEST_TIMEOUT_MS = 30_000; // 30 секунд

function token() {
  return localStorage.getItem("dai_token") || "";
}

// Создаёт AbortController с автоматической отменой через timeout мс
function withTimeout(ms) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), ms);
  // Возвращаем cleanup, чтобы не утекал таймер при успешном ответе
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timerId),
  };
}

// POST /api/audit — запускает новый аудит, возвращает AuditJob со статусом "queued"
export async function runAudit(url) {
  const { signal, clear } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ url }),
      signal,
    });
    if (!res.ok) throw new Error("Не удалось запустить аудит");
    return res.json();
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Сервер не ответил за 30 секунд. Попробуйте позже.");
    }
    throw e;
  } finally {
    clear();
  }
}

// GET /api/audit/:id — возвращает статус и отчёт (если done)
export async function getAuditStatus(id) {
  const { signal, clear } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/audit/${id}`, {
      headers: {
        Authorization: `Bearer ${token()}`,
      },
      signal,
    });
    if (!res.ok) throw new Error("Не удалось получить статус аудита");
    return res.json();
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Превышено время ожидания статуса аудита.");
    }
    throw e;
  } finally {
    clear();
  }
}
