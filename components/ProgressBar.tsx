/** Barra de progreso (Task 9). `value`/`max` en la misma unidad. */
export default function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      {label ? (
        <div className="muted" style={{ fontSize: "0.82rem", display: "flex", justifyContent: "space-between" }}>
          <span>{label}</span>
          <span>
            {value} / {max}
          </span>
        </div>
      ) : null}
      <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}