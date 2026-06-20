// src/api/audit.js
const BASE = import.meta.env.VITE_API_BASE || "";

function token() {
  return localStorage.getItem("dai_token") || "";
}

// POST /api/audit — запускает новый аудит, возвращает AuditJob со статусом "queued"
export async function runAudit(url) {
  const res = await fetch(`${BASE}/api/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("Не удалось запустить аудит");
  return res.json();
}

// GET /api/audit/:id — возвращает статус и отчёт (если done)
export async function getAuditStatus(id) {
  const res = await fetch(`${BASE}/api/audit/${id}`, {
    headers: {
      Authorization: `Bearer ${token()}`,
    },
  });
  if (!res.ok) throw new Error("Не удалось получить статус аудита");
  return res.json();
}
