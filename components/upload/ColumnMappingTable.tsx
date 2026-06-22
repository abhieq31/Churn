"use client";

import { useMemo } from "react";
import { analyzeColumns } from "@/lib/ml/preprocess";
import type { ColumnMapping, RawRow } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";

const TYPE_LABELS: Record<string, string> = {
  numeric: "Number",
  boolean: "Yes / No",
  categorical: "Category",
  identifier: "ID / text",
};

function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="ml-2 text-xs text-zinc-400">{hint}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColumnMappingTable({
  rows,
  mapping,
  onChange,
}: {
  rows: RawRow[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  const info = useMemo(() => analyzeColumns(rows), [rows]);
  const allColumns = info.map((c) => c.name);
  const numericColumns = info.filter((c) => c.type === "numeric").map((c) => c.name);

  const churnValues = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = r[mapping.churnColumn];
      if (v !== null && v !== undefined && String(v).trim() !== "") set.add(String(v).trim());
      if (set.size > 30) break;
    }
    return [...set];
  }, [rows, mapping.churnColumn]);

  const featureSet = new Set(mapping.featureColumns);

  function toggleFeature(name: string) {
    const next = new Set(featureSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...mapping, featureColumns: [...next] });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-semibold text-ink">Confirm your columns</h3>
        <p className="mt-1 text-sm text-zinc-500">
          We auto-detected these. Adjust if anything looks off — the churn column is the
          most important.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Select
            label="Churn column"
            hint="who left vs stayed"
            value={mapping.churnColumn}
            onChange={(v) =>
              onChange({
                ...mapping,
                churnColumn: v,
                featureColumns: mapping.featureColumns.filter((c) => c !== v),
              })
            }
            options={[
              ...(mapping.churnColumn ? [] : [{ value: "", label: "— choose a column —" }]),
              ...allColumns.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            label="“Churned” value"
            hint="which value means they left"
            value={mapping.churnPositiveValue}
            onChange={(v) => onChange({ ...mapping, churnPositiveValue: v })}
            options={
              churnValues.length > 0
                ? churnValues.map((c) => ({ value: c, label: c }))
                : [{ value: "", label: "— pick a churn column first —" }]
            }
          />
          <Select
            label="Revenue / MRR column"
            hint="optional"
            value={mapping.revenueColumn ?? ""}
            onChange={(v) => onChange({ ...mapping, revenueColumn: v || null })}
            options={[
              { value: "", label: "— none —" },
              ...numericColumns.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            label="Customer ID / name column"
            hint="optional"
            value={mapping.idColumn ?? ""}
            onChange={(v) =>
              onChange({
                ...mapping,
                idColumn: v || null,
                featureColumns: mapping.featureColumns.filter((c) => c !== v),
              })
            }
            options={[
              { value: "", label: "— none —" },
              ...allColumns.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-ink">Features used by the model</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {featureSet.size} of {allColumns.length} columns selected. Toggle any off to
              exclude them.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {info
            .filter((c) => c.name !== mapping.churnColumn && c.name !== mapping.idColumn)
            .map((c) => {
              const on = featureSet.has(c.name);
              const isId = c.type === "identifier";
              return (
                <button
                  key={c.name}
                  onClick={() => toggleFeature(c.name)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    on
                      ? "border-brand-200 bg-brand-50"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{c.name}</span>
                    <span className="text-xs text-zinc-400">
                      {TYPE_LABELS[c.type]}
                      {isId ? " · usually excluded" : ""}
                    </span>
                  </span>
                  <span
                    className={`ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      on ? "bg-brand-600 text-white" : "bg-zinc-200 text-transparent"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
