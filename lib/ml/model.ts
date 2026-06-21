// A from-scratch CART decision tree + bagged Random Forest, written for the
// browser (no native deps). The forest exposes Gini-based feature importance,
// which the explanation engine builds on.

import { Rng } from "./random";

/** Common interface so the pipeline can train, compare and swap models freely. */
export interface ChurnModel {
  readonly name: string;
  train(X: number[][], y: number[]): void;
  predictProba(x: number[]): number;
  predictProbaBatch(X: number[][]): number[];
  featureImportances(): number[];
}

export interface ForestOptions {
  nTrees: number;
  maxDepth: number;
  minSamplesLeaf: number;
  /** Fraction of features considered at each split (default sqrt). */
  featureFraction?: number;
  seed?: number;
}

export const DEFAULT_FOREST_OPTIONS: ForestOptions = {
  nTrees: 80,
  maxDepth: 16,
  minSamplesLeaf: 2,
  seed: 1234,
};

type TreeNode =
  | { kind: "leaf"; prob: number }
  | { kind: "split"; feature: number; threshold: number; left: TreeNode; right: TreeNode };

function gini(n0: number, n1: number): number {
  const total = n0 + n1;
  if (total === 0) return 0;
  const p0 = n0 / total;
  const p1 = n1 / total;
  return 1 - (p0 * p0 + p1 * p1);
}

interface BestSplit {
  feature: number;
  threshold: number;
  gain: number;
}

class DecisionTree {
  root: TreeNode;
  private importance: number[];

  constructor(
    X: number[][],
    y: number[],
    sampleIdx: number[],
    nFeatures: number,
    private opts: ForestOptions,
    private rng: Rng,
    importance: number[],
  ) {
    this.importance = importance;
    this.root = this.build(X, y, sampleIdx, nFeatures, 0);
  }

  private leaf(y: number[], idx: number[]): TreeNode {
    let n1 = 0;
    for (const i of idx) n1 += y[i];
    // Laplace-smoothed probability of churn.
    const prob = (n1 + 1) / (idx.length + 2);
    return { kind: "leaf", prob };
  }

  private build(
    X: number[][],
    y: number[],
    idx: number[],
    nFeatures: number,
    depth: number,
  ): TreeNode {
    let n1 = 0;
    for (const i of idx) n1 += y[i];
    const n0 = idx.length - n1;

    if (
      depth >= this.opts.maxDepth ||
      idx.length < 2 * this.opts.minSamplesLeaf ||
      n0 === 0 ||
      n1 === 0
    ) {
      return this.leaf(y, idx);
    }

    const parentGini = gini(n0, n1);
    const featureSubset = this.pickFeatures(nFeatures);
    let best: BestSplit | null = null;

    for (const f of featureSubset) {
      const candidate = this.bestSplitForFeature(X, y, idx, f, parentGini);
      if (candidate && (best === null || candidate.gain > best.gain)) best = candidate;
    }

    if (best === null || best.gain <= 1e-9) {
      return this.leaf(y, idx);
    }

    // Record importance (Gini decrease weighted by node size).
    this.importance[best.feature] += idx.length * best.gain;

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
      left: this.build(X, y, leftIdx, nFeatures, depth + 1),
      right: this.build(X, y, rightIdx, nFeatures, depth + 1),
    };
  }

  private pickFeatures(nFeatures: number): number[] {
    const frac = this.opts.featureFraction;
    const k = frac
      ? Math.max(1, Math.round(frac * nFeatures))
      : Math.max(1, Math.round(Math.sqrt(nFeatures)));
    const all = Array.from({ length: nFeatures }, (_, i) => i);
    this.rng.shuffle(all);
    return all.slice(0, k);
  }

  /** Find the best threshold for one feature via a single sorted sweep. */
  private bestSplitForFeature(
    X: number[][],
    y: number[],
    idx: number[],
    feature: number,
    parentGini: number,
  ): BestSplit | null {
    const pairs = idx.map((i) => ({ v: X[i][feature], y: y[i] }));
    pairs.sort((a, b) => a.v - b.v);

    let total1 = 0;
    for (const p of pairs) total1 += p.y;
    const total0 = pairs.length - total1;

    let left0 = 0;
    let left1 = 0;
    const minLeaf = this.opts.minSamplesLeaf;
    let best: BestSplit | null = null;

    for (let i = 0; i < pairs.length - 1; i++) {
      if (pairs[i].y === 1) left1++;
      else left0++;
      const leftSize = i + 1;
      const rightSize = pairs.length - leftSize;
      if (leftSize < minLeaf || rightSize < minLeaf) continue;
      if (pairs[i].v === pairs[i + 1].v) continue; // can't split between equal values

      const right0 = total0 - left0;
      const right1 = total1 - left1;
      const weighted =
        (leftSize * gini(left0, left1) + rightSize * gini(right0, right1)) / pairs.length;
      const gain = parentGini - weighted;
      if (best === null || gain > best.gain) {
        best = { feature, threshold: (pairs[i].v + pairs[i + 1].v) / 2, gain };
      }
    }
    return best;
  }

  predictProba(x: number[]): number {
    let node = this.root;
    while (node.kind === "split") {
      node = x[node.feature] <= node.threshold ? node.left : node.right;
    }
    return node.prob;
  }
}

export class RandomForest implements ChurnModel {
  readonly name = "Random Forest";
  private trees: DecisionTree[] = [];
  private rawImportance: number[] = [];
  nFeatures = 0;

  constructor(private opts: ForestOptions = DEFAULT_FOREST_OPTIONS) {}

  train(X: number[][], y: number[]): void {
    if (X.length === 0) throw new Error("Cannot train on an empty dataset");
    this.nFeatures = X[0].length;
    this.rawImportance = new Array(this.nFeatures).fill(0);
    const rng = new Rng(this.opts.seed ?? 1234);
    const n = X.length;

    for (let t = 0; t < this.opts.nTrees; t++) {
      // Bootstrap sample (with replacement).
      const sampleIdx: number[] = new Array(n);
      for (let i = 0; i < n; i++) sampleIdx[i] = rng.int(n);
      const tree = new DecisionTree(
        X,
        y,
        sampleIdx,
        this.nFeatures,
        this.opts,
        rng,
        this.rawImportance,
      );
      this.trees.push(tree);
    }
  }

  predictProba(x: number[]): number {
    if (this.trees.length === 0) throw new Error("Forest is not trained");
    let sum = 0;
    for (const tree of this.trees) sum += tree.predictProba(x);
    return sum / this.trees.length;
  }

  predictProbaBatch(X: number[][]): number[] {
    return X.map((x) => this.predictProba(x));
  }

  /** Feature importances normalised to sum to 1. */
  featureImportances(): number[] {
    const total = this.rawImportance.reduce((a, b) => a + b, 0);
    if (total === 0) return this.rawImportance.map(() => 0);
    return this.rawImportance.map((v) => v / total);
  }
}
