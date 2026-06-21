"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ColumnImportance } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";

export function ImportanceChart({ importance }: { importance: ColumnImportance[] }) {
  const data = importance
    .slice(0, 8)
    .map((c) => ({ name: c.column, value: +(c.importance * 100).toFixed(1) }));

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-ink">What drives churn in your data</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Relative importance of each factor to the model&apos;s predictions.
      </p>
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ fontSize: 12, fill: "#52525b" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(99,102,241,0.06)" }}
              formatter={(v) => [`${v}%`, "Importance"]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e4e4e7",
                fontSize: 13,
              }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === 0 ? "#d0441f" : "#cabfb0"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
