"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { analyze } from "../analyze";
import type { AnalysisResult, ColumnMapping, PipelineStage, RawRow } from "../ml/types";
import { ProgressOverlay } from "@/components/upload/ProgressOverlay";

interface AnalysisContextValue {
  rows: RawRow[] | null;
  result: AnalysisResult | null;
  datasetName: string | null;
  stage: PipelineStage | null;
  error: string | null;
  /** Stage a parsed/generated dataset before analysis (used by the upload step). */
  setDataset(rows: RawRow[], name: string): void;
  /** Run the full pipeline and navigate to the dashboard. The heavy lifting
   *  happens in a Web Worker; this just orchestrates progress + navigation. */
  runAnalysis(rows: RawRow[], mapping: ColumnMapping, name: string): Promise<void>;
  clear(): void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

/**
 * Holds the current dataset + analysis result in memory (never in storage, so
 * customer PII stays only in RAM). Lives in the root layout so state survives
 * client-side navigation between pages.
 */
export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [result, setResultState] = useState<AnalysisResult | null>(null);
  const [datasetName, setDatasetName] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo<AnalysisContextValue>(
    () => ({
      rows,
      result,
      datasetName,
      stage,
      error,
      setDataset(newRows, name) {
        setRows(newRows);
        setDatasetName(name);
        setResultState(null);
      },
      async runAnalysis(newRows, mapping, name) {
        setRows(newRows);
        setDatasetName(name);
        setResultState(null);
        setError(null);
        setStage("preprocessing");
        try {
          const r = await analyze(newRows, mapping, {
            onProgress: (s) => setStage(s),
          });
          setResultState(r);
          setStage(null);
          router.push("/results");
        } catch (e) {
          setStage(null);
          setError(e instanceof Error ? e.message : "Analysis failed. Please check your data.");
        }
      },
      clear() {
        setRows(null);
        setResultState(null);
        setDatasetName(null);
        setError(null);
      },
    }),
    [rows, result, datasetName, stage, error, router],
  );

  return (
    <AnalysisContext.Provider value={value}>
      {children}
      {stage && stage !== "complete" && <ProgressOverlay stage={stage} />}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within AnalysisProvider");
  return ctx;
}
