// Shared fetch helpers.
//
// VITE_API_BASE is intentionally empty by default: in production nginx serves
// the frontend and proxies /api to the Go backend on the same origin, and in
// development Vite proxies /api to localhost:8080. Hardcoding a host here is
// what broke the chat in production previously.
const BASE = (import.meta.env?.VITE_API_BASE || "").replace(/\/$/, "");

export const TOKEN_KEY = "dai_token";
export const USERNAME_KEY = "dai_username";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setSession(token, username) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (username) localStorage.setItem(USERNAME_KEY, username);
  } catch {
    /* private mode / storage disabled — the session just won't persist */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

export function apiUrl(path) {
  return `${BASE}${path}`;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * JSON request with a timeout and uniform error handling.
 * A 401 clears the stored session so the app falls back to the login screen
 * instead of looping on requests that can never succeed.
 */
export async function request(path, { method = "GET", body, auth = true, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${getToken()}`;

  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      if (res.status === 401) clearSession();
      throw new ApiError(data?.error || httpMessage(res.status), res.status);
    }
    return data ?? {};
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError("Сервер не ответил вовремя. Попробуйте позже.", 0);
    }
    if (err instanceof ApiError) throw err;
    // fetch() only rejects on network-level failures.
    throw new ApiError("Сервер недоступен. Проверьте соединение.", 0);
  } finally {
    clearTimeout(timer);
  }
}

function httpMessage(status) {
  if (status === 404) return "Не найдено";
  if (status === 502 || status === 503) return "Сервис временно недоступен";
  if (status === 504) return "Сервис не ответил вовремя";
  return `Ошибка сервера (${status})`;
}
