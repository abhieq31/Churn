"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { AuthModal } from "@/components/auth/AuthModal";
import { Button, cx } from "@/components/ui/primitives";

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink text-paper transition-transform duration-200 group-hover:-rotate-6">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="11" cy="11" r="2" fill="var(--color-brand-500)" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-ink">ChurnLens</span>
    </Link>
  );
}

const links = [{ href: "/science", label: "The Science" }];

export function Nav() {
  const { user, configured, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />

        <nav className="hidden items-center gap-7 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "text-sm transition-colors",
                pathname === l.href ? "text-ink" : "text-ink/55 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
          {configured && user && (
            <Link
              href="/history"
              className={cx(
                "text-sm transition-colors",
                pathname === "/history" ? "text-ink" : "text-ink/55 hover:text-ink",
              )}
            >
              History
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {configured &&
            (user ? (
              <button
                onClick={() => signOut()}
                className="hidden text-sm text-ink/55 transition-colors hover:text-ink sm:block"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="hidden text-sm text-ink/55 transition-colors hover:text-ink sm:block"
              >
                Sign in
              </button>
            ))}
          <Button size="sm" onClick={() => (window.location.href = "/upload")}>
            Analyze churn
          </Button>
        </div>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </header>
  );
}
