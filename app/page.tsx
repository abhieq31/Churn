"use client";

import Link from "next/link";
import { buildDefaultMapping } from "@/lib/ml/preprocess";
import { generateSampleData } from "@/lib/sampleData";
import { useAnalysis } from "@/lib/state/AnalysisProvider";
import { Badge, Button, Card, Eyebrow, LinkButton } from "@/components/ui/primitives";

function Icon({ path }: { path: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={path} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12h.01",
  why: "M12 16v-4 M12 8h.01 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  bulb: "M9 18h6 M10 21h4 M3 11a9 9 0 0 1 18 0c0 2.5-1.4 4-3 5l0 2-6 0 0-2c-1.6-1-3-2.5-3-5z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
};

function HeroPreview() {
  const rows = [
    { p: "97%", name: "Acme Corp", reason: "Support calls (6) — 3× the retained average" },
    { p: "91%", name: "Globex Ltd", reason: "On international plan — churns at 4.1× the base rate" },
    { p: "84%", name: "Initech", reason: "Heavy day usage, low engagement" },
  ];
  return (
    <div className="animate-rise mx-auto mt-16 max-w-2xl [animation-delay:200ms]">
      <Card className="overflow-hidden p-2">
        <div className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-sm font-medium text-ink">At-risk customers</span>
          </div>
          <span className="text-xs font-medium text-brand-700">42 flagged · $4.9k/mo at risk</span>
        </div>
        <ul className="divide-y divide-line px-1">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 px-3 py-3 text-left">
              <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-brand-600">
                {r.p}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{r.name}</span>
                <span className="block truncate text-xs text-ink/45">{r.reason}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="m-1 flex items-start gap-3 rounded-2xl bg-ink p-4 text-left">
          <span className="mt-0.5 text-brand-300">
            <Icon path={ICONS.bulb} />
          </span>
          <p className="text-sm leading-relaxed text-paper/90">
            <span className="font-medium text-paper">Do this first —</span> 23 at-risk customers
            contact support often; this group churns at 3.6× the base rate. Reach out before they
            cancel.
          </p>
        </div>
      </Card>
    </div>
  );
}

const OUTPUTS = [
  {
    icon: ICONS.target,
    title: "Who",
    body: "Every active customer scored 0–100% on churn probability, ranked so you act on the riskiest first.",
  },
  {
    icon: ICONS.why,
    title: "Why",
    body: "Each at-risk customer comes with the specific, human-readable factors driving their risk.",
  },
  {
    icon: ICONS.bulb,
    title: "What to do",
    body: "We cluster the at-risk into cohorts and tell you the one retention play that moves each one.",
  },
];

export default function Home() {
  const { runAnalysis } = useAnalysis();

  function trySample() {
    const rows = generateSampleData(4000);
    const mapping = buildDefaultMapping(rows);
    if (mapping) runAnalysis(rows, mapping, "Sample telecom data (4,000 customers)");
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-5 pb-10 pt-20 text-center sm:px-8 sm:pt-28">
          <div className="animate-fade-up flex justify-center">
            <Badge tone="zinc">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Built on peer-reviewed IEEE research
            </Badge>
          </div>
          <h1 className="display animate-fade-up mx-auto mt-7 max-w-4xl text-5xl font-semibold text-ink sm:text-7xl [animation-delay:60ms]">
            See who&apos;s leaving
            <br />
            before they&apos;re <span className="serif-accent text-brand-600">gone.</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-7 max-w-xl text-lg leading-relaxed text-ink/55 [animation-delay:120ms]">
            Drop in a CSV of your customers. In seconds, ChurnLens shows you who&apos;s about to
            churn, the reason behind each one, and exactly what to do — trained right in your
            browser.
          </p>
          <div className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-4 [animation-delay:180ms] sm:flex-row">
            <Button size="lg" onClick={trySample}>
              See it in action
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
            <Link href="/upload" className="text-sm font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline">
              or upload your own CSV
            </Link>
          </div>
          <p className="animate-fade-up mt-6 flex items-center justify-center gap-2 text-sm text-ink/40 [animation-delay:240ms]">
            <span className="text-emerald-600">
              <Icon path={ICONS.lock} />
            </span>
            Nothing is uploaded. The model runs entirely in your browser.
          </p>

          <HeroPreview />
        </div>
      </section>

      {/* The three questions */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Three questions, answered</Eyebrow>
          <h2 className="display mt-4 text-4xl font-semibold text-ink sm:text-5xl">
            Most tools stop at a score.
          </h2>
          <p className="mt-4 text-lg text-ink/55">
            A red dashboard tells you something is wrong. It doesn&apos;t tell you what, or what to
            do. ChurnLens answers all three.
          </p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
          {OUTPUTS.map((o, i) => (
            <div key={o.title} className="bg-white p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink/70">
                  <Icon path={o.icon} />
                </span>
                <span className="text-sm tabular-nums text-ink/30">0{i + 1}</span>
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{o.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/55">{o.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why different */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-16 px-5 py-24 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>The difference</Eyebrow>
            <h2 className="display mt-4 text-4xl font-semibold text-ink sm:text-5xl">
              Enterprise insight,
              <br />
              <span className="serif-accent text-ink/70">without the enterprise.</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink/55">
              The incumbents cost $1,000–$180,000 a year, need a dedicated success team, and take
              weeks to set up. ChurnLens gives a small team the same core insight in under a minute
              — and never sees your data.
            </p>
            <div className="mt-8 space-y-1">
              {[
                ["Private by design", "The model runs in your browser. Raw customer data never leaves it."],
                ["Explainable", "Every prediction carries the human-readable reasons behind it."],
                ["Actionable", "Cohort-level plays, not just risk scores."],
                ["Free to try", "No signup to run a full analysis."],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-4 border-t border-line py-4">
                  <span className="mt-0.5 text-brand-600">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <p className="text-[15px] text-ink/70">
                    <span className="font-semibold text-ink">{t}.</span> {d}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:pt-16">
            <Card className="p-8">
              <Eyebrow>The model, in plain terms</Eyebrow>
              <ol className="mt-6 space-y-7">
                {[
                  ["Balance the data", "Churners are rare, so we synthesise realistic examples (SMOTE) so the model learns them properly."],
                  ["Boost the trees", "Gradient boosting — the family that won our benchmark at 94% — finds the patterns."],
                  ["Score & explain", "Honest accuracy on held-out data, then a reason for every customer."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-5">
                    <span className="font-serif text-2xl italic text-brand-600">{i + 1}</span>
                    <div>
                      <p className="font-semibold text-ink">{t}</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-ink/55">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link
                href="/science"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-brand-600"
              >
                Read the science & the paper
                <span aria-hidden>→</span>
              </Link>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink px-8 py-20 text-center sm:px-16">
          <div className="bg-dots absolute inset-0 opacity-[0.15]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="display text-4xl font-semibold text-paper sm:text-6xl">
              Find your at-risk revenue
              <br />
              in <span className="serif-accent text-brand-400">sixty seconds.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-lg text-paper/60">
              One point of monthly churn reduction is worth ~$100k a year on a $10M ARR business.
              Start with the customers most likely to leave.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={trySample}
                className="bg-paper text-ink hover:bg-white"
              >
                See it in action
              </Button>
              <LinkButton href="/upload" variant="ghost" size="lg" className="text-paper/70 hover:text-paper">
                Upload your CSV
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
