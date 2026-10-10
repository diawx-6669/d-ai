import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { streamChat } from "../api/chat";
import styles from "./ChatDock.module.css";

const GREETING = {
  role: "assistant",
  content: "Привет! Запустите аудит сайта, и я помогу разобрать результаты.",
};

export default function ChatDock({ report }) {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    // The history sent upstream is the conversation *before* this message.
    const history = messages
      .filter((m) => m !== GREETING && !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);

    let started = false;
    const appendChunk = (chunk) => {
      setMessages((prev) => {
        if (!started) {
          started = true;
          return [...prev, { role: "assistant", content: chunk }];
        }
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, content: last.content + chunk };
        return copy;
      });
    };

    await streamChat({
      message: text,
      history,
      report,
      onChunk: appendChunk,
      onError: (message) =>
        setMessages((prev) => [...prev, { role: "assistant", content: message, isError: true }]),
    });

    setBusy(false);
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className="pulse-dot" />
        <span className={styles.headerTitle}>AI-ассистент</span>
      </div>

      <div className={styles.messages}>
        {messages.map((message, i) => (
          <div
            key={i}
            className={message.role === "user" ? styles.rowUser : styles.rowAssistant}
          >
            <div
              className={
                message.role === "user"
                  ? styles.bubbleUser
                  : message.isError
                    ? styles.error
                    : styles.bubbleAssistant
              }
            >
              {message.role === "user" ? (
                message.content
              ) : (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {busy ? (
          <div className={styles.typing}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={styles.dot} style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          className={styles.input}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Спросите об аудите…"
          aria-label="Сообщение AI-ассистенту"
        />
        <button
          type="button"
          className={`btn-red ${styles.send}`}
          onClick={send}
          disabled={!input.trim() || busy}
          aria-label="Отправить"
        >
          →
        </button>
      </div>
    </aside>
  );
}
