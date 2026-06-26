// Exact path-dependent TreeSHAP (Lundberg et al., "Consistent Individualized
// Feature Attribution for Tree Ensembles", Algorithm 2).
//
// This is the SAME algorithm scikit-learn's `shap.TreeExplainer(model,
// feature_perturbation="tree_path_dependent")` runs. We port it so the browser
// can produce real SHAP values — not a heuristic — for any gradient-boosted
// ensemble: the canonical telecom model (validated against the Python `shap`
// package to < 1e-6 in scripts/parity.test.ts) and the model trained live on a
// user's upload.
//
// For a feature i, the SHAP value is its contribution to the raw margin
// (log-odds), and base_value + Σ φ_i == margin exactly. Calibration then maps
// the margin to a probability — so the per-feature signs are "pushed risk
// up/down" on the scale the model actually reasons on.

/** A single regression tree in flat-array form (scikit-learn's layout). */
export interface ShapTree {
  childrenLeft: number[]; // -1 at a leaf
  childrenRight: number[];
  feature: number[];
  threshold: number[];
  value: number[]; // raw leaf value (pre learning-rate)
  cover: number[]; // training samples reaching each node (node_sample_weight)
}

interface PathElement {
  d: number; // feature index split on (-1 for the root sentinel)
  z: number; // fraction of "zero" paths (feature absent)
  o: number; // fraction of "one" paths (feature present)
  w: number; // permutation weight
}

// EXTEND: grow the subset path by one feature (Lundberg Algorithm 2).
function extend(path: PathElement[], pz: number, po: number, pi: number): PathElement[] {
  const l = path.length;
  const next = path.map((e) => ({ ...e }));
  next.push({ d: pi, z: pz, o: po, w: l === 0 ? 1 : 0 });
  for (let i = l - 1; i >= 0; i--) {
    next[i + 1].w += po * next[i].w * (i + 1) / (l + 1);
    next[i].w = pz * next[i].w * (l - i) / (l + 1);
  }
  return next;
}

// UNWIND: undo a previous extend for the element at index i, returning a copy
// one element shorter (used both to remove repeated features and to compute the
// leaf weight sum).
function unwind(path: PathElement[], i: number): PathElement[] {
  const l = path.length - 1;
  const m = path.map((e) => ({ ...e }));
  let n = m[l].w;
  for (let j = l - 1; j >= 0; j--) {
    if (m[i].o !== 0) {
      const t = m[j].w;
      m[j].w = (n * (l + 1)) / ((j + 1) * m[i].o);
      n = t - m[j].w * m[i].z * (l - j) / (l + 1);
    } else {
      m[j].w = (m[j].w * (l + 1)) / (m[i].z * (l - j));
    }
  }
  for (let j = i; j < l; j++) {
    m[j].d = m[j + 1].d;
    m[j].z = m[j + 1].z;
    m[j].o = m[j + 1].o;
  }
  m.pop();
  return m;
}

function unwoundSum(path: PathElement[], i: number): number {
  return unwind(path, i).reduce((acc, e) => acc + e.w, 0);
}

/** Per-feature SHAP contributions for one tree at point x (Σ == treeOut − E[tree]). */
function treeShapSingle(tree: ShapTree, x: number[], phi: number[]): void {
  const { childrenLeft: L, childrenRight: R, feature: F, threshold: T, value: V, cover: C } = tree;

  function recurse(
    node: number,
    path: PathElement[],
    pz: number,
    po: number,
    pi: number,
  ): void {
    let p = extend(path, pz, po, pi);
    if (L[node] === -1) {
      for (let i = 1; i < p.length; i++) {
        const w = unwoundSum(p, i);
        phi[p[i].d] += w * (p[i].o - p[i].z) * V[node];
      }
      return;
    }
    const hot = x[F[node]] <= T[node] ? L[node] : R[node];
    const cold = hot === L[node] ? R[node] : L[node];
    let incomingZero = 1;
    let incomingOne = 1;
    // If this feature is already on the path, unwind it first.
    let k = -1;
    for (let i = 1; i < p.length; i++) {
      if (p[i].d === F[node]) {
        k = i;
        break;
      }
    }
    if (k !== -1) {
      incomingZero = p[k].z;
      incomingOne = p[k].o;
      p = unwind(p, k);
    }
    recurse(hot, p, (incomingZero * C[hot]) / C[node], incomingOne, F[node]);
    recurse(cold, p, (incomingZero * C[cold]) / C[node], 0, F[node]);
  }

  recurse(0, [], 1, 1, -1);
}

/**
 * SHAP values for a gradient-boosted ensemble at point x, on the raw-margin
 * scale. Returns one contribution per feature; learningRate scales each tree's
 * contribution exactly as the ensemble's prediction does, so
 *   baseMargin + learningRate·Σ_tree E[tree] + Σ_i shap[i] == margin(x).
 */
export function ensembleShap(
  trees: ShapTree[],
  x: number[],
  nFeatures: number,
  learningRate: number,
): number[] {
  const phi = new Array(nFeatures).fill(0);
  for (const tree of trees) {
    const treePhi = new Array(nFeatures).fill(0);
    treeShapSingle(tree, x, treePhi);
    for (let i = 0; i < nFeatures; i++) phi[i] += learningRate * treePhi[i];
  }
  return phi;
}

/** Raw-margin prediction of the ensemble (matches sklearn decision_function). */
export function ensembleMargin(
  trees: ShapTree[],
  x: number[],
  baseMargin: number,
  learningRate: number,
): number {
  let m = baseMargin;
  for (const tree of trees) {
    let node = 0;
    while (tree.childrenLeft[node] !== -1) {
      node =
        x[tree.feature[node]] <= tree.threshold[node]
          ? tree.childrenLeft[node]
          : tree.childrenRight[node];
    }
    m += learningRate * tree.value[node];
  }
  return m;
}
