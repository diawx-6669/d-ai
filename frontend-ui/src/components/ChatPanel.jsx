import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./ChatPanel.module.css";
import { streamChat } from "../api/chat";

export default function ChatPanel({ auditData }) {
  const [messages, setMessages]   = useState([
    { role: "assistant", content: "Сайт проанализирован. Задайте вопрос — объясню любую проблему, покажу пример кода или предложу идеи." }
  ]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef                 = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsg = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantMsg]);
    setStreaming(true);

    const history = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [m.content],
    }));

    await streamChat(history, text, (chunk) => {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + chunk };
        return copy;
      });
    });

    setStreaming(false);
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className="pulse-dot" />
        <span>AI Консультант</span>
      </div>

      <div className={styles.messages}>
        {messages.map((m, i) => (
          <div key={i} className={`${styles.msg} ${m.role === "user" ? styles.user : styles.ai}`}>
            <ReactMarkdown>{m.content || "▋"}</ReactMarkdown>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          className={styles.input}
          rows={2}
          placeholder="Спросите об ошибке, попросите код…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={streaming}
        />
        <button className={`btn-red ${styles.sendBtn}`} onClick={send} disabled={streaming}>
          {streaming ? "…" : "→"}
        </button>
      </div>
    </aside>
  );
}
