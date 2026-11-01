import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, FileQuestion, Search, X } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Toast, ToastDescription, ToastClose, ToastProvider, ToastViewport } from "./ui/toast";

export const adminModules = [
  { href: "/admin", title: "Overview", description: "Your content workspace at a glance." },
  {
    href: "/admin/topics",
    title: "Topics",
    description: "Organize the curriculum and manage visibility.",
  },
  {
    href: "/admin/questions",
    title: "Questions",
    description: "Write, review and manage the question bank.",
  },
  {
    href: "/admin/taxonomy",
    title: "Taxonomy",
    description: "Manage canonical book chapters and CCNA domains.",
  },
  {
    href: "/admin/import",
    title: "Bulk import",
    description: "Preview CSV or Excel files before creating drafts.",
  },
  {
    href: "/admin/lessons",
    title: "Lessons",
    description: "Author, preview and publish chapter lessons.",
  },
] as const;
export function AdminButton({ className = "", variant = "default", ...props }: ButtonProps) {
  return (
    <Button
      variant={variant}
      className={`admin-button admin-button-${variant} ${className}`}
      {...props}
    />
  );
}
export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <span className="admin-eyebrow">Content administration</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function AdminNavigation() {
  const [location] = useLocation(),
    path = location.split("?")[0];
  return (
    <nav className="admin-module-nav" aria-label="Administration modules">
      {adminModules.map((m) => (
        <Link key={m.href} href={m.href} aria-current={path === m.href ? "page" : undefined}>
          {m.title}
        </Link>
      ))}
    </nav>
  );
}
export function AdminPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-panel ${className}`}>
      {(title || action) && (
        <header className="admin-panel-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="admin-panel-body">{children}</div>
    </section>
  );
}
export function StatusIndicator({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ACTIVE: "Active",
    DRAFT: "Draft",
    DISABLED: "Disabled",
    RETIRED: "Retired",
    accepted: "Ready",
    rejected: "Needs attention",
    duplicate: "Duplicate",
  };
  return (
    <span className={`admin-status status-${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {labels[status] ?? status}
    </span>
  );
}
export function AdminLoading({ label = "Loading content" }: { label?: string }) {
  return (
    <div className="admin-loading" role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      {[1, 2, 3].map((i) => (
        <Skeleton aria-hidden="true" className="admin-skeleton-row" key={i} />
      ))}
    </div>
  );
}
export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty">
      <FileQuestion aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function AdminNotice({
  children,
  tone = "success",
  onDismiss,
}: {
  children: ReactNode;
  tone?: "success" | "error";
  onDismiss?: () => void;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      className={`admin-notice admin-notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" />
      <div>{children}</div>
      {onDismiss && (
        <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>
          <X aria-hidden="true" size={16} />
        </button>
      )}
    </div>
  );
}
// Owned by the page/session boundary, so account switches remove private notices.
export function AdminToast({ message, onDismiss, tone = "success" }: { message: string; onDismiss: () => void; tone?: "success" | "error" | "warning" | "info" }) {
  const Icon=tone === "success" ? CheckCircle2 : tone === "info" ? Info : tone === "warning" ? TriangleAlert : AlertCircle;
  return (
    <ToastProvider duration={7000}>
      <Toast
        open
        onOpenChange={(open) => {
          if (!open) onDismiss();
        }}
        className={`admin-local-toast admin-notice-${tone}`}
      >
        <Icon size={20} aria-hidden="true" />
        <ToastDescription>{message}</ToastDescription>
        <ToastClose aria-label="Dismiss notification" />
      </Toast>
      <ToastViewport className="admin-toast-viewport" />
    </ToastProvider>
  );
}
export function AdminSearch({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="admin-search">
      <Search aria-hidden="true" size={18} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
      />
    </label>
  );
}
