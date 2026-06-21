// Client-side entry point for running an analysis. Prefers a Web Worker (keeps
// the UI responsive); falls back to the main thread if a worker can't start.

import * as Comlink from "comlink";
import type { ChurnWorkerApi } from "../worker/churnWorker";
import type {
  AnalysisResult,
  ColumnMapping,
  PipelineStage,
  RawRow,
} from "./ml/types";

export interface AnalyzeOptions {
  threshold?: number;
  onProgress?: (stage: PipelineStage) => void;
}

export async function analyze(
  rows: RawRow[],
  mapping: ColumnMapping,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const threshold = options.threshold ?? 0.5;
  const onProgress = options.onProgress ?? (() => {});

  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("../worker/churnWorker.ts", import.meta.url), {
        type: "module",
      });
      const api = Comlink.wrap<ChurnWorkerApi>(worker);
      try {
        const result = await api.runPipeline(
          rows,
          mapping,
          threshold,
          Comlink.proxy(onProgress),
        );
        return result;
      } finally {
        worker.terminate();
      }
    } catch {
      // Fall through to the main-thread path below.
    }
  }

  // Fallback: run on the main thread (dynamic import keeps ML out of the initial bundle).
  const { runPipeline } = await import("./ml/pipeline");
  return runPipeline(rows, mapping, { threshold, onProgress });
}
