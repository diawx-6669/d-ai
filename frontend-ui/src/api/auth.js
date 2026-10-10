import { clearSession, request, setSession } from "./client";

export async function loginUser(username, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username, password },
  });
  setSession(data.token, data.username || username);
  return data;
}

export async function registerUser(username, password) {
  const data = await request("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { username, password },
  });
  setSession(data.token, data.username || username);
  return data;
}

export function logout() {
  clearSession();
}
