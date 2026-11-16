/** Insignia de logro (Task 9). `on` indica si está desbloqueada. */
export default function Badge({
  label,
  on,
  title,
}: {
  label: string;
  on: boolean;
  title?: string;
}) {
  return (
    <span className={`badge ${on ? "on" : "off"}`} title={title ?? (on ? "Desbloqueada" : "Bloqueada")}>
      <span aria-hidden="true">{on ? "★" : "☆"}</span>
      {label}
    </span>
  );
}