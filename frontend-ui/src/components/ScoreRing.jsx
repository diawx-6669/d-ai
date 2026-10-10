const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function scoreColor(score) {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#faad14";
  return "var(--red)";
}

export default function ScoreRing({ score = 0, size = 88 }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      role="img"
      aria-label={`Оценка ${clamped} из 100`}
    >
      <circle cx="44" cy="44" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx="44"
        cy="44"
        r={RADIUS}
        fill="none"
        stroke={scoreColor(clamped)}
        strokeWidth="6"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text
        x="44"
        y="49"
        textAnchor="middle"
        fill={scoreColor(clamped)}
        fontSize="19"
        fontWeight="700"
        fontFamily="var(--font-mono)"
      >
        {clamped}
      </text>
    </svg>
  );
}
