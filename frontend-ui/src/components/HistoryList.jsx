import styles from "./HistoryList.module.css";

const STATUS_LABEL = {
  queued: "в очереди",
  running: "идёт",
  done: "готово",
  error: "ошибка",
};

function statusClass(status) {
  if (status === "done") return styles.done;
  if (status === "error") return styles.failed;
  return styles.status;
}

function shortTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function HistoryList({ items, activeId, onSelect }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>История</div>
      {items.length === 0 ? (
        <p className={styles.empty}>Пока ничего нет</p>
      ) : (
        items.map((job) => (
          <button
            key={job.id}
            type="button"
            className={job.id === activeId ? styles.active : styles.item}
            onClick={() => onSelect(job)}
            title={job.url}
          >
            <span className={styles.url}>{hostOf(job.url)}</span>
            <span className={styles.meta}>
              <span className={statusClass(job.status)}>
                {STATUS_LABEL[job.status] || job.status}
              </span>
              <span>·</span>
              <span>{shortTime(job.created_at)}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
