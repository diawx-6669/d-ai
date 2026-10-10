import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser } from "../api/auth";
import styles from "./LoginPage.module.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      // loginUser stores the token; the page only has to navigate.
      await loginUser(username.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🛡️ d-ai</div>
        <p className={styles.sub}>AI-аудит сайтов</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.field}
            type="text"
            placeholder="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <input
            className={styles.field}
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            className={`btn-red ${styles.submit}`}
            type="submit"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? "Проверяю…" : "ВОЙТИ"}
          </button>
        </form>

        <p className={styles.altAction}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}
