"use client";

import { useState } from "react";
import { saveAnalysis } from "@/lib/supabase/analyses";
import { useAuth } from "@/lib/supabase/AuthProvider";
import type { AnalysisResult } from "@/lib/ml/types";
import { AuthModal } from "@/components/auth/AuthModal";
import { Button } from "@/components/ui/primitives";

export function SaveAnalysis({
  result,
  defaultName,
}: {
  result: AnalysisResult;
  defaultName: string;
}) {
  const { configured, user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) return null;

  async function save() {
    setSaving(true);
    setError(null);
    const { error } = await saveAnalysis(result, defaultName || "Untitled analysis");
    setSaving(false);
    if (error) setError(error);
    else setSaved(true);
  }

  if (!user) {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setShowAuth(true)}>
          Sign in to save
        </Button>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-rose-600">{error}</span>}
      <Button variant={saved ? "secondary" : "primary"} size="sm" onClick={save} disabled={saving || saved}>
        {saved ? "✓ Saved to history" : saving ? "Saving…" : "Save analysis"}
      </Button>
    </div>
  );
}
