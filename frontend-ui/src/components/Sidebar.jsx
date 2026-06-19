import React from "react";
import styles from "./Sidebar.module.css";

export default function Sidebar({ collapsed, onToggle, history, onSelectHistory }) {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      {/* Logo — always visible, never moves */}
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🛡️</span>
        {!collapsed && <span className={styles.logoText}>d-ai</span>}
      </div>

      {!collapsed && (
        <>
          <p className={styles.historyLabel}>Past Audits</p>
          <div className={styles.historyList}>
            {history.length === 0 && (
              <p className={styles.empty}>No audits yet.</p>
            )}
            {history.map(item => (
              <button
                key={item.id}
                className={styles.historyItem}
                onClick={() => onSelectHistory(item)}
                title={item.url}
              >
                <span className={styles.historyUrl}>{item.url}</span>
                <span className={styles.historyTs}>
                  {item.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <button className={styles.toggleBtn} onClick={onToggle}>
        {collapsed ? "›" : "‹ Collapse"}
      </button>
    </aside>
  );
}
