import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api/auth";
import styles from "./LoginPage.module.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await loginUser(username, password);
      localStorage.setItem("dai_token", token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🛡️ d-ai</div>
        <p className={styles.sub}>AI Website Auditor</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.field}
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className={styles.field}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={`btn-red ${styles.submit}`} type="submit" disabled={loading}>
            {loading ? "Authenticating…" : "ВОЙТИ"}
          </button>
        </form>
      </div>
    </div>
  );
}
