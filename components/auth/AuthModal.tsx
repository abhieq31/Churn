"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { Button } from "@/components/ui/primitives";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    if (mode === "sign-in") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
      else onClose();
    } else {
      const { error, needsConfirm } = await signUp(email, password);
      if (error) setError(error);
      else if (needsConfirm) setNotice("Check your email to confirm your account, then sign in.");
      else onClose();
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">
          {mode === "sign-in" ? "Sign in to ChurnLens" : "Create your account"}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Save analysis history and track churn over time. Your customer data still
          never leaves your browser.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-600">{notice}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-brand-600"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
