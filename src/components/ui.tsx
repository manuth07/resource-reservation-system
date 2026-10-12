import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field ${className}`} {...props} />;
}

export function FormField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="form-label">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="supporting-text">{hint}</p>}
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

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
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

export function DataTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="data-table"><caption className="sr-only">{label}</caption>{children}</table>
    </div>
  );
}
