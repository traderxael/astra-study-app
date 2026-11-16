import type { ReactNode } from "react";

/** Tarjeta de estadística (Task 9): etiqueta + valor + sufijo opcional. */
export default function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">
        {icon ? <span className="stat-icon">{icon}</span> : null}
        {value}
      </div>
      {hint ? <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>{hint}</div> : null}
    </div>
  );
}