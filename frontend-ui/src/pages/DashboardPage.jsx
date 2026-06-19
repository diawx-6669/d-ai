import React, { useState, useCallback } from "react";
import Sidebar from "../components/Sidebar";
import AuditBar from "../components/AuditBar";
import ResultsPanel from "../components/ResultsPanel";
import ChatPanel from "../components/ChatPanel";
import WelcomePlaceholder from "../components/WelcomePlaceholder";
import styles from "./DashboardPage.module.css";
import { runAudit } from "../api/audit";

export default function DashboardPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory]                   = useState([]);
  const [auditData, setAuditData]               = useState(null);
  const [loading, setLoading]                   = useState(false);
  const [activeTab, setActiveTab]               = useState("issues");

  const handleAnalyze = useCallback(async (url) => {
    setLoading(true);
    setAuditData(null);
    try {
      const data = await runAudit(url);
      setAuditData(data);
      setHistory(prev => [{ id: data.job_id, url, ts: new Date() }, ...prev].slice(0, 30));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className={styles.layout}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        history={history}
        onSelectHistory={item => handleAnalyze(item.url)}
      />

      <div className={styles.main}>
        <AuditBar onAnalyze={handleAnalyze} loading={loading} />

        {!auditData && !loading && <WelcomePlaceholder />}

        {loading && (
          <div className={styles.loadingState}>
            <div className="pulse-dot" />
            <span>Scanning site…</span>
          </div>
        )}

        {auditData && (
          <div className={styles.workspace}>
            <ResultsPanel data={auditData} activeTab={activeTab} onTabChange={setActiveTab} />
            <ChatPanel auditData={auditData} />
          </div>
        )}
      </div>
    </div>
  );
}
