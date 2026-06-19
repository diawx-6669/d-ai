import React, { useState } from "react";
import styles from "./AuditBar.module.css";

export default function AuditBar({ onAnalyze, loading }) {
  const [url, setUrl] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    onAnalyze(withProtocol);
  }

  return (
    <header className={styles.bar}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="text"
          placeholder="Enter website URL — e.g. example.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={loading}
        />
        <button className={`btn-red ${styles.btn}`} type="submit" disabled={loading}>
          {loading ? "…" : "АНАЛИЗ"}
        </button>
      </form>
    </header>
  );
}
