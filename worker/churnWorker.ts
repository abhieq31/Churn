// Web Worker entry point. The heavy ML pipeline runs here so the UI never
// freezes. Exposed to the main thread via Comlink.

import * as Comlink from "comlink";
import { runPipeline } from "../lib/ml/pipeline";
import type { AnalysisResult, ColumnMapping, PipelineStage, RawRow } from "../lib/ml/types";

export interface ChurnWorkerApi {
  runPipeline(
    rows: RawRow[],
    mapping: ColumnMapping,
    threshold: number,
    onProgress: (stage: PipelineStage) => void,
  ): AnalysisResult;
}

const api: ChurnWorkerApi = {
  runPipeline(rows, mapping, threshold, onProgress) {
    return runPipeline(rows, mapping, {
      threshold,
      // onProgress is a Comlink proxy; calling it posts a message back. Fire-and-forget.
      onProgress: (stage) => {
        void onProgress(stage);
      },
    });
  },
};

Comlink.expose(api);
