import { request } from "./client";

// POST /api/audit — starts an audit, returns the job (id + status "queued").
export function runAudit(url) {
  return request("/api/audit", { method: "POST", body: { url } });
}

// GET /api/audit/:id — status, plus the report once the status is "done".
export function getAuditStatus(id) {
  return request(`/api/audit/${encodeURIComponent(id)}`);
}

// GET /api/history — the current user's recent audits.
export async function getHistory() {
  const data = await request("/api/history");
  return data.history || [];
}
