const BASE = import.meta.env.VITE_API_BASE || "";

function token() {
  return localStorage.getItem("dai_token") || "";
}

export async function runAudit(url) {
  const res = await fetch(`${BASE}/api/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("Audit failed");
  return res.json();
}
