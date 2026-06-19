import React from "react";
import styles from "./WelcomePlaceholder.module.css";

export default function WelcomePlaceholder() {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>🛡️</div>
      <h2 className={styles.title}>Готов к аудиту</h2>
      <p className={styles.sub}>
        Введите URL сайта выше и нажмите <strong>АНАЛИЗ</strong>.<br />
        ИИ найдёт уязвимости, предложит улучшения и ответит на вопросы.
      </p>
      <div className={styles.chips}>
        {["SEO", "Производительность", "Безопасность", "Доступность"].map(c => (
          <span key={c} className={styles.chip}>{c}</span>
        ))}
      </div>
    </div>
  );
}
