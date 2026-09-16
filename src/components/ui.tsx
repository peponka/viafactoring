import Link from "next/link";
import { type ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface border border-line rounded-2xl p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-2">
      {children}
    </p>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold text-[.95rem] px-5 py-3 rounded-lg border transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-accent text-accent-ink border-transparent hover:opacity-90",
    ghost: "bg-transparent text-ink border-line hover:border-accent",
    danger: "bg-critical text-white border-transparent hover:opacity-90",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${styles[variant]} ${className}`}
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
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold text-[.95rem] px-5 py-3 rounded-lg border transition";
  const styles = {
    primary: "bg-accent text-accent-ink border-transparent hover:opacity-90",
    ghost: "bg-transparent text-ink border-line hover:border-accent",
  };
  return (
    <Link href={href} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[.95rem] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

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
    neutral: "bg-surface-2 text-ink-soft",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    critical: "bg-critical-soft text-critical",
    gold: "bg-gold-soft text-gold",
  };
  return (
    <span
      className={`inline-block text-[.72rem] font-semibold px-2.5 py-1 rounded-full ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-sm text-critical bg-critical-soft rounded-lg px-3.5 py-2.5">
      {children}
    </p>
  );
}
