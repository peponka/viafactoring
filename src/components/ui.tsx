import Link from "next/link";
import { type ReactNode } from "react";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={`font-display font-bold tracking-tight ${size === "lg" ? "text-2xl" : "text-xl"}`}
    >
      Via<span className="text-accent">Factoring</span>
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface border border-line rounded-3xl p-6 shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="uppercase tracking-[0.14em] text-[.72rem] font-bold text-accent mb-2">
      {children}
    </p>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-semibold text-[.95rem] min-h-11 px-5 py-2.5 rounded-full border transition active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

const buttonStyles = {
  primary:
    "bg-accent text-accent-ink border-transparent hover:bg-accent-strong shadow-[0_6px_16px_rgb(11_110_79_/_0.22)]",
  ghost: "bg-surface text-ink border-line-strong hover:border-ink-soft",
  danger: "bg-critical text-white border-transparent hover:opacity-90",
  dark: "bg-ink text-white border-transparent hover:opacity-90",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger" | "dark";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${buttonBase} ${buttonStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost" | "dark";
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonBase} ${buttonStyles[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full min-h-12 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[.95rem] text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-accent focus:ring-4 focus:ring-accent-soft";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea {...props} className={`${inputBase} ${props.className ?? ""}`} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "critical" | "gold";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-slate-soft text-slate-ink",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    critical: "bg-critical-soft text-critical",
    gold: "bg-gold-soft text-gold",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[.75rem] font-semibold px-2.5 py-1 rounded-full ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Dato chico con etiqueta, para fichas de facturas. */
export function Stat({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface-2 rounded-2xl px-3.5 py-3 flex flex-col gap-0.5 ${className}`}>
      <span className="text-xs text-ink-soft">{label}</span>
      <span className="font-semibold text-[.98rem]">{children}</span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
      <div>
        <h1 className="text-[1.75rem] md:text-3xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-ink-soft text-[.95rem] mt-1.5 max-w-[60ch]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center py-14 px-6 flex flex-col items-center gap-3">
      <span className="w-14 h-14 rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
        </svg>
      </span>
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="text-ink-soft max-w-[46ch]">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-sm text-critical bg-critical-soft rounded-xl px-3.5 py-2.5">
      {children}
    </p>
  );
}
