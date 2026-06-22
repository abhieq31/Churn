import type { ColumnImportance } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";

export function ImportanceChart({ importance }: { importance: ColumnImportance[] }) {
  const data = importance.slice(0, 8).map((c) => ({
    name: c.column,
    pct: +(c.importance * 100).toFixed(1),
  }));
  const max = Math.max(...data.map((d) => d.pct), 1);

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-ink">What drives churn in your data</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Relative importance of each factor to the model&apos;s predictions.
      </p>
      <div className="mt-5 space-y-3">
        {data.map((d, i) => (
          <div key={d.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink/70">{d.name}</span>
              <span className="shrink-0 text-xs font-medium text-ink/45">{d.pct}%</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-paper">
              <div
                className={`h-full rounded-full ${i === 0 ? "bg-brand-600" : "bg-ink/15"}`}
                style={{ width: `${(d.pct / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
