import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

export type CategoryStyleClass =
  | "category-badge-room"
  | "category-badge-transport"
  | "category-badge-equipment"
  | "category-badge-training"
  | "category-badge-slate"
  | "category-badge-warm";

export function getCategoryBadgeClass(category: {
  name?: string | null;
  code?: string | null;
  isVehicle?: boolean | null;
}): CategoryStyleClass {
  if (category.isVehicle) return "category-badge-transport";
  const name = (category.name ?? "").toLowerCase();
  const code = (category.code ?? "").toUpperCase();

  if (
    code.includes("VAN") || code.includes("CAR") || code.includes("VEHICLE") || code.includes("TRANSPORT") ||
    name.includes("van") || name.includes("car") || name.includes("vehicle") || name.includes("transport")
  ) {
    return "category-badge-transport";
  }

  if (
    code.includes("ROOM") || code.includes("MEETING") || code.includes("CONF") || code.includes("BOARD") ||
    name.includes("room") || name.includes("meeting") || name.includes("conference") || name.includes("boardroom")
  ) {
    return "category-badge-room";
  }

  if (
    code.includes("PROJECTOR") || code.includes("EQUIP") || code.includes("DEVICE") || code.includes("AV") || code.includes("HARDWARE") ||
    name.includes("projector") || name.includes("equipment") || name.includes("device") || name.includes("hardware") || name.includes("audio") || name.includes("visual")
  ) {
    return "category-badge-equipment";
  }

  if (
    code.includes("TRAINING") || code.includes("LAB") || code.includes("FACILITY") || code.includes("WORKSHOP") ||
    name.includes("training") || name.includes("lab") || name.includes("facility") || name.includes("workshop") || name.includes("auditorium")
  ) {
    return "category-badge-training";
  }

  const key = (code || name || "default").trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const fallbacks: CategoryStyleClass[] = ["category-badge-slate", "category-badge-warm"];
  return fallbacks[Math.abs(hash) % fallbacks.length];
}

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "neutral" | "tertiary" | "danger" | "activate" | "deactivate";
  size?: "default" | "sm";
}) {
  const sizeClass = size === "sm" ? "button-sm" : "";
  return <button className={`button button-${variant} ${sizeClass} ${className}`.trim()} {...props} />;
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
        {description && <p className="mt-1 max-w-2xl text-secondary">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";
export function StatusBadge({ children, tone = "neutral", subtle = false }: { children: ReactNode; tone?: StatusTone; subtle?: boolean }) {
  return <span className={`status-badge status-${tone}${subtle ? " status-subtle" : ""}`}>{children}</span>;
}

export function CategoryBadge({
  category,
  children,
  subtle = true,
  className = "",
}: {
  category: { name?: string | null; code?: string | null; isVehicle?: boolean | null };
  children?: ReactNode;
  subtle?: boolean;
  className?: string;
}) {
  const styleClass = getCategoryBadgeClass(category);
  return (
    <span className={`status-badge ${subtle ? "status-subtle " : ""}category-badge ${styleClass} ${className}`.trim()}>
      {children ?? category.name}
    </span>
  );
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
