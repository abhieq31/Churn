// Shared types for the ChurnLens client-side ML pipeline.

/** A single parsed CSV row. Values arrive as strings (or numbers from papaparse dynamicTyping). */
export type RawRow = Record<string, string | number | boolean | null | undefined>;

export type ColumnType = "numeric" | "boolean" | "categorical" | "identifier";

/** Result of analysing one CSV column so the UI can offer sensible mapping defaults. */
export interface ColumnInfo {
  name: string;
  type: ColumnType;
  distinctValues: number;
  missingCount: number;
  /** A few example values for display in the mapping UI. */
  sampleValues: string[];
  /** Distinct values, only populated for boolean/categorical columns of low cardinality. */
  values: string[];
}

/** User-confirmed (auto-detected) description of what each column means. */
export interface ColumnMapping {
  churnColumn: string;
  /** The value in churnColumn that means "this customer churned" (e.g. "Yes", "True", "Cancelled"). */
  churnPositiveValue: string;
  /** Optional column holding monthly revenue / MRR / price, used for "revenue at risk". */
  revenueColumn: string | null;
  /** Optional column that identifies the customer (name / id / email) for display + export. */
  idColumn: string | null;
  /** Columns fed to the model as predictive features. */
  featureColumns: string[];
}

/** One column of the encoded numeric feature matrix. */
export interface EncodedFeature {
  /** Display name, e.g. "Total day minutes" or "International plan = Yes". */
  name: string;
  /** Original CSV column this came from. */
  sourceColumn: string;
  kind: "numeric" | "onehot";
  /** For one-hot features, the category value this column represents. */
  category?: string;
}

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

export interface Metrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  /** ROC area under curve. */
  auc: number;
  confusion: ConfusionMatrix;
  /** Number of rows in the held-out test set the metrics were computed on. */
  testSize: number;
}

/** Importance of an original CSV column (aggregated from its encoded features). */
export interface ColumnImportance {
  column: string;
  importance: number;
}

/** A single plain-English reason a specific customer is flagged at risk. */
export interface RiskReason {
  column: string;
  label: string;
  /** Normalised magnitude used for sorting/clustering (higher = more notable). */
  magnitude: number;
  /** Stable key grouping customers who share this risk factor, e.g. "service_calls:high". */
  tag: string;
  /** Human-readable explanation, e.g. "Customer service calls (5) — more than double the retained-customer average (2.1)." */
  text: string;
}

export interface AtRiskCustomer {
  /** Index into the original uploaded rows. */
  rowIndex: number;
  /** Display label (from idColumn if present, else "Customer #N"). */
  label: string;
  /** Predicted probability of churn in [0,1]. */
  probability: number;
  /** Optional revenue value for this customer. */
  revenue: number | null;
  /** Ranked reasons this customer is at risk (most notable first). */
  reasons: RiskReason[];
}

export interface Recommendation {
  /** Tag shared by the customer cohort this recommendation targets. */
  tag: string;
  /** Headline, e.g. "31 active customers contact support frequently". */
  title: string;
  /** Full plain-English recommendation with the suggested action. */
  body: string;
  /** Number of at-risk customers in this cohort. */
  cohortSize: number;
  /** How much more this cohort churns vs the overall base rate (e.g. 3.2 => 3.2x). */
  churnMultiplier: number;
  /** Revenue at risk within this cohort, if a revenue column is present. */
  revenueAtRisk: number | null;
}

export interface AnalysisSummary {
  totalCustomers: number;
  /** Customers historically marked as churned in the uploaded data. */
  historicalChurnCount: number;
  historicalChurnRate: number;
  /** Currently-active customers the model predicts will churn. */
  atRiskCount: number;
  /** Revenue at risk across the at-risk customers (null if no revenue column). */
  revenueAtRisk: number | null;
  modelAccuracy: number;
  modelPrecision: number;
  modelRecall: number;
  modelF1: number;
  modelAuc: number;
  /** Which model was automatically selected (e.g. "Gradient Boosting"). */
  modelName: string;
}

export interface AnalysisResult {
  summary: AnalysisSummary;
  metrics: Metrics;
  atRiskCustomers: AtRiskCustomer[];
  recommendations: Recommendation[];
  globalImportance: ColumnImportance[];
  mapping: ColumnMapping;
  /** Decision threshold used to flag a customer as at-risk. */
  threshold: number;
  generatedAt: string;
}

export type PipelineStage =
  | "preprocessing"
  | "balancing-classes"
  | "training-model"
  | "evaluating"
  | "scoring-customers"
  | "generating-explanations"
  | "complete";

export type ProgressCallback = (stage: PipelineStage) => void;
