import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { DetentionStatus } from "../api/types";
import { STATUS_LABEL } from "../api/types";

export function Button({
  variant = "primary",
  block,
  type = "button",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "warn" | "danger"; block?: boolean }) {
  const classes = ["btn", `btn-${variant}`, block ? "btn-block" : "", className].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}

export function Ltr({ children }: { children: ReactNode }) {
  return <bdi className="ltr">{children}</bdi>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Banner({ tone = "ok", children }: { tone?: "ok" | "warn" | "danger"; children: ReactNode }) {
  const cls = tone === "warn" ? "banner banner-warn" : tone === "danger" ? "banner banner-danger" : "banner";
  return <div className={cls}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function StatusPill({ status }: { status: DetentionStatus }) {
  const cls = status === "pending" ? "badge badge-wait" : status === "completed" ? "badge badge-done" : "badge badge-off";
  return <span className={cls}>{STATUS_LABEL[status]}</span>;
}

export function studentName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}
