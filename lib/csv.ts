// Thin wrapper around papaparse for parsing user CSVs and exporting results.

import Papa from "papaparse";
import type { RawRow } from "./ml/types";

export interface ParseResult {
  rows: RawRow[];
  headers: string[];
  errors: string[];
}

/** Parse a File (from a drop/upload) into rows. Runs on the main thread. */
export function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const headers = (result.meta.fields ?? []).filter(Boolean);
        resolve({
          rows: result.data,
          headers,
          errors: result.errors.slice(0, 5).map((e) => e.message),
        });
      },
      error: (err) => reject(err),
    });
  });
}

/** Parse an in-memory CSV string (used for the bundled sample dataset). */
export function parseCsvString(csv: string): ParseResult {
  const result = Papa.parse<RawRow>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });
  return {
    rows: result.data,
    headers: (result.meta.fields ?? []).filter(Boolean),
    errors: result.errors.slice(0, 5).map((e) => e.message),
  };
}

/** Build a CSV download of the at-risk customers (original columns + risk fields). */
export function atRiskToCsv(
  rows: RawRow[],
  atRisk: { rowIndex: number; probability: number; reasons: { text: string }[] }[],
): string {
  if (atRisk.length === 0) return "";
  const baseHeaders = Object.keys(rows[atRisk[0].rowIndex] ?? {});
  const headers = [...baseHeaders, "churn_probability", "primary_risk_factor"];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const c of atRisk) {
    const row = rows[c.rowIndex] ?? {};
    const values = baseHeaders.map((h) => escape(row[h]));
    values.push((c.probability * 100).toFixed(1) + "%");
    values.push(escape(c.reasons[0]?.text ?? ""));
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

/** Trigger a browser download of text content. */
export function downloadText(filename: string, content: string, mime = "text/csv"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
