"use client";

import { AnalysisProvider } from "@/lib/state/AnalysisProvider";
import { AuthProvider } from "@/lib/supabase/AuthProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AnalysisProvider>{children}</AnalysisProvider>
    </AuthProvider>
  );
}
