import { apiUrl, clearSession, getToken } from "./client";

const CHAT_TIMEOUT_MS = 90_000;

/**
 * Turns a technical error string into something worth showing a user.
 * Exported so the UI can reuse it for non-streaming failures.
 */
export function friendlyError(text) {
  if (!text) return "Неизвестная ошибка.";
  const t = String(text);
  if (/quota|RESOURCE_EXHAUSTED|rate limit|429/i.test(t))
    return "Превышен лимит запросов к AI. Подождите минуту и попробуйте снова.";
  if (/GROQ_API_KEY|не настроен/i.test(t))
    return "AI-чат не настроен: на сервере нет ключа API. Аудит при этом работает.";
  if (/timeout|таймаут|не ответил|не успел/i.test(t))
    return "AI-сервис не ответил вовремя. Попробуйте снова.";
  if (/unavailable|недоступен|connection refused|bad gateway/i.test(t))
    return "AI-сервис временно недоступен. Попробуйте позже.";
  if (/model|модель/i.test(t) && /not found|404/i.test(t))
    return "Выбранная модель AI недоступна. Обратитесь к администратору.";
  if (t.length > 160) return "Ошибка AI-сервиса. Попробуйте позже.";
  return t;
}

/**
 * Streams a chat reply from POST /api/chat (Server-Sent Events).
 *
 * Calls onChunk for every piece of text and onError once if something goes
 * wrong. Resolves when the stream ends either way, so callers can simply
 * await it and then re-enable their input.
 */
export async function streamChat({ message, history = [], report = null, onChunk, onError }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const res = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ message, history, report }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) clearSession();
      let detail = `Сервер вернул ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) detail = data.error;
      } catch {
        /* non-JSON error body */
      }
      onError?.(friendlyError(detail));
      return;
    }
    if (!res.body) {
      onError?.("Браузер не поддерживает потоковые ответы.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line, but the AI service sends
      // one "data:" line per frame, so splitting on newlines is enough as
      // long as the trailing partial line is kept for the next read.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") return;

        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) {
            onError?.(friendlyError(parsed.error));
            return;
          }
          const text = parsed?.chunk ?? parsed?.delta ?? parsed?.text ?? parsed?.reply;
          if (text) onChunk?.(text);
        } catch {
          /* a frame we can't parse is not worth showing as garbage */
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      onError?.("AI-сервис не ответил за 90 секунд. Попробуйте позже.");
    } else {
      onError?.(friendlyError(err.message));
    }
  } finally {
    clearTimeout(timer);
  }
}
