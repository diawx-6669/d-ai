import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../api/auth";
import styles from "./LoginPage.module.css"; // the register card reuses the login layout

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }

    setLoading(true);
    try {
      await registerUser(username.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🛡️ d-ai</div>
        <p className={styles.sub}>Создание аккаунта</p>

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
            autoComplete="new-password"
            required
          />
          <input
            className={styles.field}
            type="password"
            placeholder="Повторите пароль"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            className={`btn-red ${styles.submit}`}
            type="submit"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? "Создаю аккаунт…" : "ЗАРЕГИСТРИРОВАТЬСЯ"}
          </button>
        </form>

        <p className={styles.altAction}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
