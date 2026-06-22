// Gradient-boosted decision trees with a second-order (Newton) objective — the
// same algorithm family as XGBoost, which topped our IEEE paper's benchmark at
// 94%. Written from scratch in TypeScript, no dependencies.
//
// Each round fits a regression tree to the gradients/hessians of the log-loss,
// using the XGBoost split-gain objective:
//   gain = 0.5 * [ G_L^2/(H_L+λ) + G_R^2/(H_R+λ) - (G_L+G_R)^2/(H_L+H_R+λ) ] - γ
// and leaf weight w = -G / (H + λ).

import { Rng } from "./random";
import type { ChurnModel } from "./types";

export interface GBMOptions {
  rounds: number;
  learningRate: number;
  maxDepth: number;
  lambda: number; // L2 regularisation on leaf weights
  gamma: number; // minimum split gain
  minChildWeight: number; // minimum sum of hessians in a child
  featureFraction: number;
  seed: number;
}

export const DEFAULT_GBM_OPTIONS: GBMOptions = {
  rounds: 120,
  learningRate: 0.13,
  maxDepth: 4,
  lambda: 1,
  gamma: 0,
  minChildWeight: 3,
  featureFraction: 0.6,
  seed: 99,
};

function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

type GNode =
  | { kind: "leaf"; weight: number }
  | { kind: "split"; feature: number; threshold: number; left: GNode; right: GNode };

interface Best {
  feature: number;
  threshold: number;
  gain: number;
}

export class GradientBoosting implements ChurnModel {
  readonly name = "Gradient Boosting";
  private trees: GNode[] = [];
  private base = 0;
  private rawImportance: number[] = [];
  nFeatures = 0;

  constructor(private opts: GBMOptions = DEFAULT_GBM_OPTIONS) {}

  train(X: number[][], y: number[]): void {
    if (X.length === 0) throw new Error("Cannot train on empty data");
    this.nFeatures = X[0].length;
    this.rawImportance = new Array(this.nFeatures).fill(0);
    const rng = new Rng(this.opts.seed);
    const n = X.length;

    const meanY = y.reduce((a, b) => a + b, 0) / n;
    const clamped = Math.min(Math.max(meanY, 1e-6), 1 - 1e-6);
    this.base = Math.log(clamped / (1 - clamped));
    const F = new Array(n).fill(this.base);

    for (let m = 0; m < this.opts.rounds; m++) {
      const g = new Array(n);
      const h = new Array(n);
      for (let i = 0; i < n; i++) {
        const p = sigmoid(F[i]);
        g[i] = p - y[i]; // gradient of log-loss wrt F
        h[i] = Math.max(p * (1 - p), 1e-6); // hessian
      }
      const idx = Array.from({ length: n }, (_, i) => i);
      const tree = this.buildTree(X, g, h, idx, 0, rng);
      this.trees.push(tree);
      // Apply this tree's predictions to the running score.
      for (let i = 0; i < n; i++) {
        F[i] += this.opts.learningRate * this.evalTree(tree, X[i]);
      }
    }
  }

  private leafWeight(g: number[], h: number[], idx: number[]): number {
    let G = 0;
    let H = 0;
    for (const i of idx) {
      G += g[i];
      H += h[i];
    }
    return -G / (H + this.opts.lambda);
  }

  private buildTree(
    X: number[][],
    g: number[],
    h: number[],
    idx: number[],
    depth: number,
    rng: Rng,
  ): GNode {
    if (depth >= this.opts.maxDepth || idx.length < 2) {
      return { kind: "leaf", weight: this.leafWeight(g, h, idx) };
    }

    let G = 0;
    let H = 0;
    for (const i of idx) {
      G += g[i];
      H += h[i];
    }

    const k = Math.max(1, Math.round(this.opts.featureFraction * this.nFeatures));
    const features = Array.from({ length: this.nFeatures }, (_, i) => i);
    rng.shuffle(features);
    const subset = features.slice(0, k);

    let best: Best | null = null;
    const { lambda, gamma, minChildWeight } = this.opts;
    const parentScore = (G * G) / (H + lambda);

    for (const f of subset) {
      const pairs = idx.map((i) => ({ g: g[i], h: h[i], v: X[i][f] }));
      pairs.sort((a, b) => a.v - b.v);
      let GL = 0;
      let HL = 0;
      for (let i = 0; i < pairs.length - 1; i++) {
        GL += pairs[i].g;
        HL += pairs[i].h;
        const HR = H - HL;
        if (HL < minChildWeight || HR < minChildWeight) continue;
        if (pairs[i].v === pairs[i + 1].v) continue;
        const GR = G - GL;
        const gain =
          0.5 * ((GL * GL) / (HL + lambda) + (GR * GR) / (HR + lambda) - parentScore) - gamma;
        if (best === null || gain > best.gain) {
          best = { feature: f, threshold: (pairs[i].v + pairs[i + 1].v) / 2, gain };
        }
      }
    }

    if (best === null || best.gain <= 1e-9) {
      return { kind: "leaf", weight: this.leafWeight(g, h, idx) };
    }

    this.rawImportance[best.feature] += best.gain;
    const leftIdx: number[] = [];
    const rightIdx: number[] = [];
    for (const i of idx) {
      if (X[i][best.feature] <= best.threshold) leftIdx.push(i);
      else rightIdx.push(i);
    }

    return {
      kind: "split",
      feature: best.feature,
      threshold: best.threshold,
      left: this.buildTree(X, g, h, leftIdx, depth + 1, rng),
      right: this.buildTree(X, g, h, rightIdx, depth + 1, rng),
    };
  }

  private evalTree(node: GNode, x: number[]): number {
    let n = node;
    while (n.kind === "split") {
      n = x[n.feature] <= n.threshold ? n.left : n.right;
    }
    return n.weight;
  }

  predictProba(x: number[]): number {
    let F = this.base;
    for (const tree of this.trees) F += this.opts.learningRate * this.evalTree(tree, x);
    return sigmoid(F);
  }

  predictProbaBatch(X: number[][]): number[] {
    return X.map((x) => this.predictProba(x));
  }

  featureImportances(): number[] {
    const total = this.rawImportance.reduce((a, b) => a + b, 0);
    if (total === 0) return this.rawImportance.map(() => 0);
    return this.rawImportance.map((v) => v / total);
  }
}
