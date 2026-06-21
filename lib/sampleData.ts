// Procedurally generated synthetic telecom dataset used for the "Try sample data"
// demo. It reproduces the headline findings from the published research paper
// (A. Patel & A. G. Kumar, R10-HTC 2023):
//   - ~14.6% overall churn rate
//   - International-plan customers churn far more often
//   - Churn risk jumps sharply once a customer makes 4+ service calls
//
// The churn label is drawn FIRST, then every feature is drawn conditionally on
// it — this is what makes the correlations show up the way the paper describes.
// It flows through the exact same pipeline as a real upload (no special casing).

import { Rng } from "./ml/random";
import type { RawRow } from "./ml/types";

const STATES = [
  "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA",
  "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS",
  "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
];
const AREA_CODES = [408, 415, 510];

const CHURN_RATE = 0.146;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function generateSampleData(n = 4000, seed = 7): RawRow[] {
  const rng = new Rng(seed);
  const rows: RawRow[] = [];

  for (let i = 0; i < n; i++) {
    const churned = rng.next() < CHURN_RATE;

    // International plan: much more common among churners (paper's key finding).
    const intlPlan = rng.next() < (churned ? 0.42 : 0.05);

    // Voicemail plan + messages (mild protective effect — engaged customers stay).
    const voiceMailPlan = rng.next() < (churned ? 0.17 : 0.29);
    const numVmailMessages = voiceMailPlan ? clamp(rng.poisson(8), 0, 50) : 0;

    // Customer service calls: churners are a mixture, so a meaningful share land
    // at 4+ calls where churn rate spikes; most retained customers sit at 0-2.
    let serviceCalls: number;
    if (churned) {
      serviceCalls = rng.next() < 0.62 ? rng.poisson(5.4) : rng.poisson(1.9);
    } else {
      serviceCalls = rng.poisson(1.4);
    }
    serviceCalls = clamp(serviceCalls, 0, 9);

    // Daytime usage: churners trend toward heavier day usage.
    const dayMinutes = clamp(rng.normal(churned ? 228 : 174, 50), 0, 400);
    const eveMinutes = clamp(rng.normal(200, 51), 0, 400);
    const nightMinutes = clamp(rng.normal(200, 51), 0, 400);
    const intlMinutes = clamp(rng.normal(10.2, 2.8), 0, 20);

    // Charges derived from minutes (realistic billing correlation) + tiny noise.
    const dayCharge = +(dayMinutes * 0.17 + rng.normal(0, 0.3)).toFixed(2);
    const eveCharge = +(eveMinutes * 0.085 + rng.normal(0, 0.2)).toFixed(2);
    const nightCharge = +(nightMinutes * 0.045 + rng.normal(0, 0.1)).toFixed(2);
    const intlCharge = +(intlMinutes * 0.27 + rng.normal(0, 0.05)).toFixed(2);

    const dayCalls = clamp(Math.round(rng.normal(100, 20)), 0, 200);
    const eveCalls = clamp(Math.round(rng.normal(100, 20)), 0, 200);
    const nightCalls = clamp(Math.round(rng.normal(100, 20)), 0, 200);
    const intlCalls = clamp(Math.round(rng.normal(4.5, 2.4)), 0, 20);

    const accountLength = clamp(Math.round(rng.normal(101, 39)), 1, 243);

    // Monthly revenue proxy so "revenue at risk" has something to work with.
    const monthlyCharge = +(
      dayCharge + eveCharge + nightCharge + intlCharge + (intlPlan ? 6 : 0) + (voiceMailPlan ? 4 : 0)
    ).toFixed(2);

    rows.push({
      "Customer ID": `CUST-${(10000 + i).toString()}`,
      State: rng.pick(STATES),
      "Account length": accountLength,
      "Area code": rng.pick(AREA_CODES),
      "International plan": intlPlan ? "Yes" : "No",
      "Voice mail plan": voiceMailPlan ? "Yes" : "No",
      "Number vmail messages": numVmailMessages,
      "Total day minutes": +dayMinutes.toFixed(1),
      "Total day calls": dayCalls,
      "Total day charge": dayCharge,
      "Total eve minutes": +eveMinutes.toFixed(1),
      "Total eve calls": eveCalls,
      "Total eve charge": eveCharge,
      "Total night minutes": +nightMinutes.toFixed(1),
      "Total night calls": nightCalls,
      "Total night charge": nightCharge,
      "Total intl minutes": +intlMinutes.toFixed(1),
      "Total intl calls": intlCalls,
      "Total intl charge": intlCharge,
      "Customer service calls": serviceCalls,
      "Monthly charge": monthlyCharge,
      Churn: churned ? "Yes" : "No",
    });
  }

  return rows;
}

/** Serialize sample rows to a CSV string (used for the downloadable sample file). */
export function sampleDataToCsv(rows: RawRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}
