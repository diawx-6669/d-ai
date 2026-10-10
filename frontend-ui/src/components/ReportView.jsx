import ScoreRing from "./ScoreRing";
import styles from "./ReportView.module.css";

const CRITICAL = ["critical", "high"];
const WARNING = ["warning", "medium"];

function severityClass(severity = "") {
  const key = severity.toLowerCase();
  if (CRITICAL.includes(key)) return "badge badge-critical";
  if (WARNING.includes(key)) return "badge badge-warning";
  return "badge badge-info";
}

function countBy(issues, severities) {
  return issues.filter((i) => severities.includes((i.severity || "").toLowerCase())).length;
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function Metrics({ metrics }) {
  const items = [
    { label: "HTTP-статус", value: metrics.status_code || "—" },
    { label: "Время загрузки", value: metrics.load_time_ms ? `${Math.round(metrics.load_time_ms)} мс` : "—" },
    { label: "Размер HTML", value: formatBytes(metrics.page_size_bytes) },
    { label: "Заголовков h1", value: metrics.h1_count ?? 0 },
    { label: "Картинок без alt", value: metrics.images_without_alt ?? 0 },
    { label: "Inline-скриптов", value: metrics.inline_scripts ?? 0 },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Измерения</span>
      </div>
      <div className={styles.metrics}>
        {items.map(({ label, value }) => (
          <div key={label} className={styles.metric}>
            <div className={styles.metricLabel}>{label}</div>
            <div className={styles.metricValue}>{value}</div>
          </div>
        ))}
      </div>
      {metrics.title ? <div className={styles.note}>&lt;title&gt;: {metrics.title}</div> : null}
    </div>
  );
}

function Bullets({ title, items, muted }) {
  if (!items?.length) return null;
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{title}</span>
      </div>
      <ul className={styles.list}>
        {items.map((text, i) => (
          <li key={i} className={styles.listItem}>
            <span className={muted ? styles.bulletMuted : styles.bullet}>{muted ? "·" : "›"}</span>
            <span className={styles.listText}>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ReportView({ report }) {
  const issues = report.issues || [];

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreCard}>
        <ScoreRing score={report.score} />
        <div className={styles.scoreMeta}>
          <div className={styles.label}>Итоговая оценка</div>
          <div className={styles.scoreValue}>
            {report.score}
            <span className={styles.scoreOutOf}> / 100</span>
          </div>
          <div className={styles.badges}>
            <span className="badge badge-critical">{countBy(issues, CRITICAL)} critical</span>
            <span className="badge badge-warning">{countBy(issues, WARNING)} warnings</span>
            <span className="badge badge-info">{issues.length} всего</span>
          </div>
          {report.url ? (
            <div className={styles.target}>
              <a href={report.url} target="_blank" rel="noreferrer noopener">
                {report.url}
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {report.summary ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Вывод</span>
          </div>
          <p className={styles.summary}>{report.summary}</p>
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Проблемы</span>
          {issues.length > 0 ? <span className={styles.count}>{issues.length}</span> : null}
        </div>
        {issues.length === 0 ? (
          <p className={styles.clean}>Автоматические проверки не нашли проблем.</p>
        ) : (
          issues.map((issue, i) => (
            <div key={i} className={styles.row}>
              <span className={severityClass(issue.severity)}>{issue.severity}</span>
              <div className={styles.rowBody}>
                <span className={styles.rowCategory}>{issue.category}</span>
                <p className={styles.rowText}>
                  {issue.description}
                  {issue.line ? <span className={styles.rowCategory}> · строка {issue.line}</span> : null}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {report.metrics ? <Metrics metrics={report.metrics} /> : null}

      <Bullets title="Рекомендации" items={report.recommendations} />
      <Bullets title="Идеи" items={report.ideas} muted />

      {report.ai_available === false ? (
        <div className={styles.card}>
          <div className={styles.note}>
            AI-сервис недоступен, поэтому рекомендации сформированы по правилам, без модели.
          </div>
        </div>
      ) : null}
    </div>
  );
}
