import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../api/auth";
import styles from "./LoginPage.module.css"; // reuse the same styles

export default function RegisterPage() {
  const [username, setUsername]           = useState("");
  const [password, setPassword]           = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const { token } = await registerUser(username, password);
      localStorage.setItem("dai_token", token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🛡️ d-ai</div>
        <p className={styles.sub}>Create your account</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.field}
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
          />
          <input
            className={styles.field}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <input
            className={styles.field}
            type="password"
            placeholder="Repeat password"
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={`btn-red ${styles.submit}`} type="submit" disabled={loading}>
            {loading ? "Creating account…" : "ЗАРЕГИСТРИРОВАТЬСЯ"}
          </button>
        </form>

        <p style={{ marginTop: "1rem", fontSize: "0.85rem", textAlign: "center" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "inherit", textDecoration: "underline" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
