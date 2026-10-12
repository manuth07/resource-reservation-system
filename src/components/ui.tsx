import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "neutral" | "danger" }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="select-control"><select className={`field ${className}`} {...props} /><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-secondary" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></div>;
}

export function FormField({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="form-label">{label}{required && <span className="supporting-text"> (required)</span>}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="supporting-text">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function Card({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={`panel ${className}`}>{children}</section>;
}

export function PageHeader({ title, description, section, action }: { title: string; description?: string; section?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {section && <p className="section-label">{section}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";
export function StatusBadge({ children, tone = "neutral", subtle = false }: { children: ReactNode; tone?: StatusTone; subtle?: boolean }) {
  return <span className={`status-badge status-${tone}${subtle ? " status-subtle" : ""}`}>{children}</span>;
}

export function Feedback({ children, tone = "info", className = "" }: { children: ReactNode; tone?: "success" | "danger" | "warning" | "info"; className?: string }) {
  return <p role={tone === "danger" ? "alert" : "status"} className={`feedback-compact feedback-${tone} ${className}`}>{children}</p>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2 className="card-title">{title}</h2>
      <p className="mt-2 text-secondary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ message = "Loading workspace…" }: { message?: string }) {
  return <p role="status" aria-live="polite" className="p-8 text-secondary">{message}</p>;
}

export function DataTable({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className={`data-table ${className}`}><caption className="sr-only">{label}</caption>{children}</table>
    </div>
  );
}
