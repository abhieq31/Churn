// Small shared UI primitives. The design language: solid-ink authority, warm
// hairline borders, generous radius, restraint with colour.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/90 border border-transparent",
  secondary: "bg-white text-ink border border-line hover:bg-paper",
  ghost: "bg-transparent text-ink/55 hover:text-ink border border-transparent",
  danger: "bg-white text-brand-700 hover:bg-brand-50 border border-line",
};

const sizeStyles = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-[15px]",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 active:scale-[0.98]";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof sizeStyles }) {
  return (
    <button
      className={cx(base, buttonStyles[variant], sizeStyles[size], className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  href,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizeStyles;
}) {
  return (
    <Link
      href={href}
      className={cx(base, buttonStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-3xl border border-line bg-white shadow-[0_1px_3px_rgba(26,23,20,0.04),0_12px_40px_-12px_rgba(26,23,20,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A small uppercase eyebrow label — the editorial section marker. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cx(
        "text-xs font-medium uppercase tracking-[0.2em] text-brand-600",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Badge({
  children,
  tone = "brand",
  className,
}: {
  children: ReactNode;
  tone?: "brand" | "rose" | "emerald" | "amber" | "zinc";
  className?: string;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700 ring-brand-600/10",
    rose: "bg-brand-50 text-brand-700 ring-brand-600/10",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/10",
    zinc: "bg-ink/[0.04] text-ink/60 ring-ink/10",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export { cx };
