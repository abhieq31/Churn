// Saved-analysis history. We persist ONLY aggregate results (summary, counts,
// recommendations, feature importance) — never the raw customer rows or the
// per-customer at-risk list. Customer PII never leaves the browser.

import type { AnalysisResult } from "../ml/types";
import { getSupabaseBrowser } from "./client";

export interface SavedAnalysis {
  id: string;
  name: string;
  total_customers: number;
  at_risk_count: number;
  churn_rate: number;
  revenue_at_risk: number | null;
  model_f1: number;
  summary: AnalysisResult["summary"];
  recommendations: AnalysisResult["recommendations"];
  global_importance: AnalysisResult["globalImportance"];
  created_at: string;
}

export async function saveAnalysis(
  result: AnalysisResult,
  name: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return { error: "Accounts are not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to save analyses." };

  const { error } = await supabase.from("analyses").insert({
    user_id: user.id,
    name,
    total_customers: result.summary.totalCustomers,
    at_risk_count: result.summary.atRiskCount,
    churn_rate: result.summary.historicalChurnRate,
    revenue_at_risk: result.summary.revenueAtRisk,
    model_f1: result.summary.modelF1,
    summary: result.summary,
    recommendations: result.recommendations,
    global_importance: result.globalImportance,
  });

  return { error: error?.message ?? null };
}

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as SavedAnalysis[];
}

export async function deleteAnalysis(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return { error: "Accounts are not configured." };
  const { error } = await supabase.from("analyses").delete().eq("id", id);
  return { error: error?.message ?? null };
}
