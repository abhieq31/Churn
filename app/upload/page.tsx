"use client";

import { useMemo, useState } from "react";
import { buildDefaultMapping, analyzeColumns } from "@/lib/ml/preprocess";
import type { ColumnMapping, RawRow } from "@/lib/ml/types";
import { useAnalysis } from "@/lib/state/AnalysisProvider";
import { Dropzone } from "@/components/upload/Dropzone";
import { ColumnMappingTable } from "@/components/upload/ColumnMappingTable";
import { Button, Card, Eyebrow } from "@/components/ui/primitives";

function fallbackMapping(rows: RawRow[]): ColumnMapping {
  const info = analyzeColumns(rows);
  const cols = info.map((c) => c.name);
  const churnColumn = cols[cols.length - 1] ?? "";
  const first = rows.find((r) => String(r[churnColumn] ?? "").trim() !== "");
  return {
    churnColumn,
    churnPositiveValue: first ? String(first[churnColumn]).trim() : "",
    revenueColumn: null,
    idColumn: info.find((c) => c.type === "identifier")?.name ?? null,
    featureColumns: cols.filter((c) => c !== churnColumn),
  };
}

export default function UploadPage() {
  const { rows, datasetName, setDataset, runAnalysis, clear, error } = useAnalysis();
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [seededFor, setSeededFor] = useState<RawRow[] | null>(null);

  // Seed the mapping from auto-detection whenever a new dataset arrives. Done
  // during render (guarded) rather than in an effect, per React guidance.
  if (rows && rows.length > 0 && rows !== seededFor) {
    setSeededFor(rows);
    setMapping(buildDefaultMapping(rows) ?? fallbackMapping(rows));
  } else if (!rows && seededFor) {
    setSeededFor(null);
    setMapping(null);
  }

  const churnOutcomes = useMemo(() => {
    if (!rows || !mapping) return 0;
    const positive = mapping.churnPositiveValue.toLowerCase();
    let pos = 0;
    let neg = 0;
    for (const r of rows) {
      const v = String(r[mapping.churnColumn] ?? "").trim().toLowerCase();
      if (v === "") continue;
      if (v === positive) pos++;
      else neg++;
      if (pos > 0 && neg > 0) break;
    }
    return pos > 0 && neg > 0 ? 2 : 1;
  }, [rows, mapping]);

  const canRun =
    rows && mapping && mapping.featureColumns.length > 0 && churnOutcomes === 2;

  function run() {
    if (!rows || !mapping) return;
    runAnalysis(rows, mapping, datasetName ?? "Your dataset");
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Step {rows ? "2 of 2" : "1 of 2"}</Eyebrow>
          <h1 className="display mt-3 text-4xl font-semibold text-ink sm:text-5xl">
            {rows ? "Confirm & analyze" : "Upload your customers"}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink/55">
            {rows
              ? datasetName
                ? `Loaded ${rows.length.toLocaleString()} rows from ${datasetName}.`
                : `${rows.length.toLocaleString()} rows ready.`
              : "A CSV export of your customers — Stripe, your database, or a CRM. One row per customer."}
          </p>
        </div>
        {rows && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMapping(null);
              clear();
            }}
          >
            Start over
          </Button>
        )}
      </div>

      <div className="mt-8">
        {!rows ? (
          <Dropzone onParsed={(r, name) => setDataset(r, name)} />
        ) : mapping ? (
          <>
            <ColumnMappingTable rows={rows} mapping={mapping} onChange={setMapping} />
            {churnOutcomes === 1 && (
              <p className="mt-4 text-sm text-amber-700">
                The selected churn column / value has only one outcome in your data. Pick the
                column (and value) that distinguishes churned from retained customers.
              </p>
            )}
            {error && (
              <Card className="mt-4 border-rose-200 bg-rose-50 p-4">
                <p className="text-sm text-rose-700">{error}</p>
              </Card>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button size="lg" onClick={run} disabled={!canRun}>
                Analyze churn →
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
