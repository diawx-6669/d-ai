import React from "react";
import styles from "./ResultsPanel.module.css";

const TABS = [
  { id: "issues",          label: "❌ Минусы" },
  { id: "recommendations", label: "🛠 Рекомендации" },
  { id: "ideas",           label: "💡 Идеи" },
];

export default function ResultsPanel({ data, activeTab, onTabChange }) {
  const content = {
    issues:          data?.issues          ?? [],
    recommendations: data?.recommendations ?? [],
    ideas:           data?.ideas           ?? [],
  };

  return (
    <section className={styles.panel}>
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.active : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {activeTab === "issues" && content.issues.map((issue, i) => (
          <IssueCard key={i} issue={issue} />
        ))}

        {activeTab === "recommendations" && content.recommendations.map((rec, i) => (
          <div key={i} className={styles.listItem}>
            <span className={styles.bullet}>→</span>
            <span>{rec}</span>
          </div>
        ))}

        {activeTab === "ideas" && content.ideas.map((idea, i) => (
          <div key={i} className={styles.listItem}>
            <span className={styles.bullet}>✦</span>
            <span>{idea}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function IssueCard({ issue }) {
  const sev = issue.severity ?? "info";
  return (
    <div className={`${styles.issueCard} ${styles[`sev_${sev}`]}`}>
      <div className={styles.issueHeader}>
        <span className={`badge badge-${sev}`}>{sev}</span>
        <span className={styles.issueCategory}>{issue.category}</span>
      </div>
      <p className={styles.issueDesc}>{issue.description}</p>
    </div>
  );
}
