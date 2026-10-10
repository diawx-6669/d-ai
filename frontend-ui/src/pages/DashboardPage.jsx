import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuditStatus, getHistory, runAudit } from "../api/audit";
import { logout } from "../api/auth";
import { USERNAME_KEY } from "../api/client";
import ChatDock from "../components/ChatDock";
import HistoryList from "../components/HistoryList";
import ReportView from "../components/ReportView";
import styles from "./DashboardPage.module.css";

const CATEGORIES = ["SEO", "Производительность", "Безопасность", "Доступность"];
const POLL_INTERVAL_MS = 2000;
const STATUS_TEXT = {
  queued: "в очереди",
  running: "анализирую страницу",
};

function storedUsername() {
  try {
    return localStorage.getItem(USERNAME_KEY) || "";
  } catch {
    return "";
  }
}

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  // Mirrors the latest job id so the polling effect can tell whether a
  // response that arrives late still belongs to the audit on screen.
  const activeJobId = job?.id ?? null;
  const pending = job != null && job.status !== "done" && job.status !== "error";

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getHistory());
    } catch {
      // History is a convenience; a failure here must not break the page.
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Poll until the job reaches a terminal state. Using an effect with a
  // cleanup (rather than an interval stored in a ref) means a cancelled or
  // replaced audit can never keep polling in the background, and unmounting
  // the page stops the requests.
  useEffect(() => {
    if (!activeJobId || !pending) return undefined;

    let cancelled = false;
    let timer;

    const tick = async () => {
      try {
        const data = await getAuditStatus(activeJobId);
        if (cancelled) return;

        setJob(data);
        if (data.status === "done") {
          setReport(data.report || null);
          refreshHistory();
          return;
        }
        if (data.status === "error") {
          setError(data.error || "Анализ завершился с ошибкой на сервере");
          refreshHistory();
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err.message);
        setJob((current) => (current ? { ...current, status: "error" } : current));
      }
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeJobId, pending, navigate, refreshHistory]);

  async function startAudit() {
    const target = url.trim();
    if (!target || pending) return;

    setError(null);
    setReport(null);
    setJob(null);

    try {
      const created = await runAudit(target);
      setJob(created);
      refreshHistory();
    } catch (err) {
      if (err.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message);
    }
  }

  async function openJob(selected) {
    setError(null);
    setUrl(selected.url);

    if (selected.status === "error") {
      setJob(selected);
      setReport(null);
      setError(selected.error || "Этот аудит завершился с ошибкой");
      return;
    }

    try {
      const data = await getAuditStatus(selected.id);
      setJob(data);
      setReport(data.status === "done" ? data.report || null : null);
      if (data.status === "error") setError(data.error || "Этот аудит завершился с ошибкой");
    } catch (err) {
      setError(err.message);
    }
  }

  function newAudit() {
    setJob(null);
    setReport(null);
    setError(null);
    setUrl("");
  }

  function signOut() {
    logout();
    navigate("/login", { replace: true });
  }

  const username = storedUsername();

  return (
    <div className={styles.layout}>
      <aside className={sidebarOpen ? styles.sidebar : styles.sidebarCollapsed}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>🛡️</span>
          {sidebarOpen ? <span className={styles.brandName}>d-ai</span> : null}
        </div>

        <div className={styles.sidebarBody}>
          <button
            type="button"
            className={styles.newAudit}
            onClick={newAudit}
            title={sidebarOpen ? undefined : "Новый аудит"}
          >
            <span>＋</span>
            {sidebarOpen ? "Новый аудит" : null}
          </button>

          {sidebarOpen ? (
            <HistoryList items={history} activeId={activeJobId} onSelect={openJob} />
          ) : null}
        </div>

        <div className={styles.sidebarFooter}>
          {sidebarOpen && username ? <div className={styles.user}>{username}</div> : null}
          {sidebarOpen ? (
            <button type="button" className={styles.ghostButton} onClick={signOut}>
              Выйти
            </button>
          ) : null}
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Свернуть панель" : "Развернуть панель"}
          >
            {sidebarOpen ? "◂" : "▸"}
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <input
            className={styles.urlInput}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startAudit()}
            placeholder="example.com"
            aria-label="Адрес сайта для аудита"
          />
          <button
            type="button"
            className="btn-red"
            onClick={startAudit}
            disabled={!url.trim() || pending}
            style={{ opacity: !url.trim() || pending ? 0.5 : 1 }}
          >
            {pending ? "Анализирую…" : "Запустить аудит"}
          </button>
        </header>

        <main className={styles.workspace}>
          {error ? <div className={styles.error}>{error}</div> : null}

          {pending ? (
            <div className={styles.progress}>
              <span className="pulse-dot" />
              <span>
                Статус:{" "}
                <span className={styles.progressStatus}>
                  {STATUS_TEXT[job.status] || job.status}
                </span>
              </span>
            </div>
          ) : null}

          {report ? <ReportView report={report} /> : null}

          {!report && !pending && !error ? (
            <div className={styles.placeholder}>
              <div className={styles.placeholderMark}>🛡️</div>
              <p>Введите адрес сайта и нажмите «Запустить аудит»</p>
              <div className={styles.chips}>
                {CATEGORIES.map((category) => (
                  <span key={category} className={styles.chip}>
                    {category}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <ChatDock report={report} />
    </div>
  );
}
