import type { ReactNode } from "react";

/**
 * Shell compartido (Task 9): header sticky + contenido. Da la estructura
 * "app-like" de Astra AI (topbar + área central) sin depender de un layout
 * de cliente, para que cada página (chat, dashboard, etc.) lo use igual.
 */
export default function AppShell({
  children,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Astra Study</span>
        </div>
        {right ? <div className="topbar-right">{right}</div> : null}
      </header>
      {title ? (
        <div className="page-head">
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}