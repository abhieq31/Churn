"use client";

import type { PipelineStage } from "@/lib/ml/types";

// A little informatic animation for each pipeline stage — so the wait actually
// shows you the method working, not just a spinner. All hand-rolled SVG + CSS
// (keyframes live in globals.css, prefixed `ld-`), no animation library.

const V = "#d0441f"; // brand vermillion
const VS = "#e05a3c";
const GREEN = "#059669";
const AMBER = "#d97706";
const GREY = "#d8d2c8";

const box = { viewBox: "0 0 280 150", className: "ld-scene h-40 w-full" } as const;

/* 1 · Reading & encoding — a data table materialising cell by cell */
function Encoding() {
  const cols = 8;
  const rows = 4;
  const glyphs = ["#", "✓", "Aa", "#", "✓", "Aa", "#", "ID"];
  return (
    <svg {...box}>
      {glyphs.map((g, c) => (
        <text key={c} x={20 + c * 32} y={18} fontSize="9" fill="#a8a29e" textAnchor="middle">
          {g}
        </text>
      ))}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <rect
            key={`${r}-${c}`}
            x={8 + c * 32}
            y={28 + r * 26}
            width={26}
            height={18}
            rx={3}
            fill={c === cols - 1 ? VS : V}
            style={{ animation: "ld-cell 1.8s ease-in-out infinite", animationDelay: `${c * 0.12 + r * 0.06}s` }}
          />
        )),
      )}
    </svg>
  );
}

/* 2 · Cross-validating — 5 folds, a rotating held-out slice + SMOTE points */
function CrossVal() {
  const folds = 5;
  const x0 = 44;
  const w = 224;
  const seg = w / folds;
  return (
    <svg {...box}>
      {Array.from({ length: folds }).map((_, i) => {
        const y = 12 + i * 26;
        return (
          <g key={i} style={{ animation: "ld-soft 4s ease-in-out infinite", animationDelay: `${i * 0.8}s` }}>
            <text x={8} y={y + 13} fontSize="9" fill="#a8a29e">
              F{i + 1}
            </text>
            <rect x={x0} y={y} width={w} height={17} rx={3} fill="#efe9e0" />
            {/* held-out validation slice for this fold */}
            <rect x={x0 + i * seg} y={y} width={seg} height={17} rx={3} fill={V} opacity={0.85} />
            {/* SMOTE: synthetic points appearing in the training region */}
            {[0.2, 0.45, 0.7, 0.9].map((f, k) => {
              const cx = x0 + ((i + 0.5 + f * 4) % folds) * seg;
              return (
                <circle
                  key={k}
                  cx={cx}
                  cy={y + 8.5}
                  r={2.2}
                  fill={GREEN}
                  style={{ animation: "ld-pop 1.6s ease-out infinite", animationDelay: `${0.3 + k * 0.25}s` }}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* 3 · Calibrating — a curve bending toward the diagonal; Platt vs isotonic */
function Calibrating() {
  const o = { x: 20, y: 130, s: 110 }; // origin + size
  return (
    <svg {...box}>
      <rect x={o.x} y={o.y - o.s} width={o.s} height={o.s} rx={6} fill="#faf7f2" />
      <line x1={o.x} y1={o.y} x2={o.x + o.s} y2={o.y - o.s} stroke={GREY} strokeWidth={1.5} strokeDasharray="4 4" />
      <path
        d={`M ${o.x} ${o.y} C ${o.x + 40} ${o.y - 6}, ${o.x + 55} ${o.y - 95}, ${o.x + o.s} ${o.y - o.s}`}
        fill="none"
        stroke={V}
        strokeWidth={2.5}
        strokeDasharray="200"
        style={{ ["--len" as string]: "200", animation: "ld-draw 2.2s ease-in-out infinite alternate" }}
      />
      {[
        { label: "Platt", y: 40, on: true },
        { label: "isotonic", y: 70, on: true },
      ].map((p, i) => (
        <g key={p.label} style={{ animation: "ld-soft 2.4s ease-in-out infinite", animationDelay: `${i * 1.2}s` }}>
          <rect x={170} y={p.y} width={92} height={22} rx={11} fill="#fff" stroke={V} strokeWidth={1.2} />
          <text x={216} y={p.y + 15} fontSize="11" fill={V} textAnchor="middle" fontWeight={600}>
            {p.label}
          </text>
        </g>
      ))}
      <text x={216} y={104} fontSize="9" fill="#a8a29e" textAnchor="middle">
        lower Brier wins
      </text>
    </svg>
  );
}

/* 4 · Training — gradient-boosted trees sprouting one after another */
function Training() {
  const n = 9;
  return (
    <svg {...box}>
      {/* running score line */}
      <polyline
        points="14,118 44,108 74,96 104,88 134,74 164,66 194,52 224,46 254,36"
        fill="none"
        stroke={GREY}
        strokeWidth={1.5}
        strokeDasharray="300"
        style={{ ["--len" as string]: "300", animation: "ld-draw 2.6s ease-out infinite alternate" }}
      />
      {Array.from({ length: n }).map((_, i) => {
        const x = 22 + i * 28;
        return (
          <g
            key={i}
            style={{ animation: "ld-sprout 1.8s ease-out infinite", animationDelay: `${i * 0.16}s`, transformBox: "fill-box", transformOrigin: "center bottom" }}
          >
            <rect x={x - 1.5} y={128} width={3} height={10} fill={VS} rx={1} />
            <path d={`M ${x} 110 L ${x - 9} 130 L ${x + 9} 130 Z`} fill={i % 2 ? V : VS} />
            <path d={`M ${x} 118 L ${x - 6} 130 L ${x + 6} 130 Z`} fill="#fff" opacity={0.25} />
          </g>
        );
      })}
    </svg>
  );
}

/* 5 · Evaluating — an ROC curve draws while a threshold marker sweeps */
function Evaluating() {
  const roc = "M 22 130 C 60 130, 70 40, 150 30 C 200 24, 230 22, 250 20";
  return (
    <svg {...box}>
      <rect x={22} y={20} width={228} height={110} rx={6} fill="#faf7f2" />
      <line x1={22} y1={130} x2={250} y2={20} stroke={GREY} strokeWidth={1} strokeDasharray="4 4" />
      <path d={`${roc} L 250 130 L 22 130 Z`} fill={V} opacity={0.08} />
      <path
        d={roc}
        fill="none"
        stroke={V}
        strokeWidth={2.5}
        strokeDasharray="320"
        style={{ ["--len" as string]: "320", animation: "ld-draw 2.4s ease-in-out infinite alternate" }}
      />
      <g style={{ animation: "ld-slide 3s ease-in-out infinite" }}>
        <line x1={22} y1={20} x2={22} y2={130} stroke={VS} strokeWidth={1.5} strokeDasharray="3 3" />
        <circle cx={22} cy={24} r={3} fill={VS} />
      </g>
    </svg>
  );
}

/* 6 · Scoring — customers stream through the model, emerging risk-coloured */
function Scoring() {
  const colors = [GREEN, GREEN, AMBER, V, GREEN, AMBER, V, GREEN];
  return (
    <svg {...box}>
      <rect x={116} y={40} width={44} height={70} rx={8} fill={V} opacity={0.12} stroke={V} strokeWidth={1.2} />
      <text x={138} y={79} fontSize="9" fill={V} textAnchor="middle" fontWeight={600}>
        model
      </text>
      {colors.map((c, i) => (
        <g key={i} style={{ animation: "ld-flow 2.6s linear infinite", animationDelay: `${i * 0.3}s` }}>
          <circle cx={24} cy={48 + (i % 6) * 11} r={4} fill={c} />
        </g>
      ))}
    </svg>
  );
}

/* 7 · SHAP — diverging contributions grow out from the centre line */
function Shap() {
  const feats = [
    { w: 64, up: true },
    { w: 40, up: false },
    { w: 30, up: false },
    { w: 24, up: true },
    { w: 18, up: false },
    { w: 12, up: true },
  ];
  const cx = 150;
  return (
    <svg {...box}>
      <line x1={cx} y1={8} x2={cx} y2={142} stroke={GREY} strokeWidth={1.5} />
      <text x={86} y={146} fontSize="8.5" fill={GREEN} textAnchor="middle">
        ← lowers
      </text>
      <text x={214} y={146} fontSize="8.5" fill={V} textAnchor="middle">
        raises →
      </text>
      {feats.map((f, i) => {
        const y = 12 + i * 21;
        return (
          <g key={i}>
            <line x1={20} y1={y + 6} x2={70} y2={y + 6} stroke="#e7e1d7" strokeWidth={6} strokeLinecap="round" />
            <rect
              x={f.up ? cx : cx - f.w}
              y={y}
              width={f.w}
              height={12}
              rx={2}
              fill={f.up ? V : GREEN}
              style={{
                animation: "ld-growx 2s ease-in-out infinite alternate",
                animationDelay: `${i * 0.18}s`,
                transformBox: "fill-box",
                transformOrigin: f.up ? "left center" : "right center",
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

const SCENES: Record<PipelineStage, () => React.ReactNode> = {
  preprocessing: Encoding,
  "cross-validating": CrossVal,
  "balancing-classes": CrossVal,
  calibrating: Calibrating,
  "training-model": Training,
  evaluating: Evaluating,
  "scoring-customers": Scoring,
  "generating-explanations": Shap,
  complete: Shap,
};

export function StageScene({ stage }: { stage: PipelineStage }) {
  const Scene = SCENES[stage] ?? Encoding;
  // key forces the fade-up to replay when the stage changes
  return (
    <div key={stage} className="flex items-center justify-center">
      <Scene />
    </div>
  );
}
