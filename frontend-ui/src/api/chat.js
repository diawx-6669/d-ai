const AI_BASE = import.meta.env.VITE_AI_BASE || "http://localhost:5002";

const CHAT_TIMEOUT_MS = 30_000; // 30 seconds

export async function streamChat(history, message, onChunk, onError) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const res = await fetch(`${AI_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, message }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error("Chat request failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            onError?.(parsed.error);
            return;
          }
          if (parsed.chunk) onChunk(parsed.chunk);
        } catch {}
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      onError?.("Запрос превысил 30 секунд. Попробуйте ещё раз или сократите вопрос.");
    } else {
      onError?.(err.message ?? "Неизвестная ошибка");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
