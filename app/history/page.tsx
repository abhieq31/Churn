"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/ml/explain";
import {
  deleteAnalysis,
  listAnalyses,
  type SavedAnalysis,
} from "@/lib/supabase/analyses";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { Badge, Button, Card, LinkButton } from "@/components/ui/primitives";

export default function HistoryPage() {
  const { configured, user, loading } = useAuth();
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!user) return;
    listAnalyses().then((data) => {
      setItems(data);
      setBusy(false);
    });
  }, [user]);

  async function remove(id: string) {
    await deleteAnalysis(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (!configured) {
    return (
      <Wrapper>
        <p className="text-zinc-600">
          Saved history requires a Supabase connection, which isn&apos;t configured on this
          deployment.
        </p>
      </Wrapper>
    );
  }

  if (loading) {
    return (
      <Wrapper>
        <p className="text-zinc-500">Loading…</p>
      </Wrapper>
    );
  }

  if (!user) {
    return (
      <Wrapper>
        <p className="text-zinc-600">Sign in to view your saved analyses.</p>
      </Wrapper>
    );
  }

  if (busy) {
    return (
      <Wrapper>
        <p className="text-zinc-500">Loading…</p>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-zinc-600">No saved analyses yet.</p>
          <LinkButton href="/upload" className="mt-4">
            Run your first analysis
          </LinkButton>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id} className="flex items-center justify-between p-5">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{a.name}</p>
                  <Badge tone="zinc">{new Date(a.created_at).toLocaleDateString()}</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {a.at_risk_count.toLocaleString()} at-risk ·{" "}
                  {(a.churn_rate * 100).toFixed(1)}% churn rate · F1{" "}
                  {(a.model_f1 * 100).toFixed(0)}%
                  {a.revenue_at_risk
                    ? ` · ${formatCurrency(a.revenue_at_risk)}/mo at risk`
                    : ""}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => remove(a.id)}>
                Delete
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Saved analyses</h1>
      <p className="mt-2 text-zinc-600">
        Aggregate results you&apos;ve saved. Raw customer data is never stored.
      </p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
