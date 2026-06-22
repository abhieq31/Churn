"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { analyze } from "../analyze";
import type { AnalysisResult, ColumnMapping, PipelineStage, RawRow } from "../ml/types";
import { ProgressOverlay, STAGES } from "@/components/upload/ProgressOverlay";

const STAGE_ORDER = STAGES.map((s) => s.key);
// The real pipeline often finishes every stage within milliseconds on small
// datasets, which would make the progress list flash by unseen. Pace the
// *displayed* stage on a fixed cadence, capped at whatever has actually
// happened, so the user can always see the work happen without ever showing
// a stage before it's really done.
const MIN_STAGE_MS = 320;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

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

        let realIndex = 0;
        let displayIndex = 0;
        setStage(STAGE_ORDER[0]);

        const ticker = setInterval(() => {
          if (displayIndex < realIndex) {
            displayIndex++;
            setStage(STAGE_ORDER[displayIndex]);
          }
        }, MIN_STAGE_MS);

        try {
          const r = await analyze(newRows, mapping, {
            onProgress: (s) => {
              const idx = STAGE_ORDER.indexOf(s);
              realIndex = idx >= 0 ? idx : STAGE_ORDER.length - 1;
            },
          });
          clearInterval(ticker);
          while (displayIndex < STAGE_ORDER.length - 1) {
            await sleep(MIN_STAGE_MS);
            displayIndex++;
            setStage(STAGE_ORDER[displayIndex]);
          }
          setResultState(r);
          setStage(null);
          router.push("/results");
        } catch (e) {
          clearInterval(ticker);
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
