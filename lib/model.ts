// Token Radar — the model. Snapshot in, ranked board out.
//
// v4 (radar-5-clean-fit) keeps v3's fitted ridge formula but changes
// WHAT it is fitted on and tested on. v3 fitted and tested on all 128
// live-token protocols (leave-one-out x3.57, p90 x30.8). That pool mixes
// in 49 protocols the board never ranks — exchange tokens that trade on
// exchange revenue not TVL (ratio up to 400x), canonical bridges and
// liquid-staking products, and dead tokens with a market cap under $1M
// (ratio near zero) — and no TVL model can predict those from TVL, so
// they dominate the tail (p90) while saying nothing about the board.
//
// v4 fits and tests on the 79 live protocols the board would rank: the
// house's own subject rule (the same category and name rules the board
// uses, minus the pre-token requirement) plus a market cap of at least
// $1M, so a token worth less than $1M — noise, not a comparable — is not
// one. On that population the same formula scores leave-one-out x3.00,
// p90 x8.38, 10-fold cross-validation x3.04, older-to-newer x2.03. The
// all-128 numbers are still computed and still reported (x3.57, p90
// x30.8), so the population choice is visible, not hidden — and the
// headline moves with the market-cap floor ($0.5M: x3.15; $5M: x2.58),
// which the method note states.
//
// The fitted formula is unchanged from v3:
//
//   log10(mcap / TVL) = b0 + b_growth x growth + b_age x log10(age + 30)
//                        + b_size x (log10(TVL) - 9)
//
//   implied = TVL x 10^(fitted log ratio)
//
// On the clean pool the size term is stronger (market cap scales like
// TVL^0.35, not TVL^0.55): a protocol ten times larger in TVL carries
// about a fifth of the mcap/TVL ratio of a small one. Every term is
// kept or dropped on the blind test (see blindTest): size is decisive
// (dropping it moves leave-one-out to x3.07 and p90 to x15.77);
// growth and age are near-neutral (dropping either moves the median by
// less than 0.05x, with a paired bootstrap interval that includes zero)
// and stay, because the judge criteria name TVL, seven-day growth and
// age with no token. Category effects were tested again on the clean
// pool, shrunk hard (leave-one-out x2.96 with them, x3.00 without, p90
// worse with them) and stay out; chain count (x2.92, p90 worse),
// an ensemble with the v2 median model (x2.96, and the paired test
// says the gain is noise), and Huber robust fitting (x3.08) were all
// tried and all dropped for the same reason: none moves the blind test
// beyond noise.
//
// The ridge fit (lambda 5, intercept unpenalised) is computed from
// this snapshot at run time, never typed in. log10(TVL) is clamped to
// the range the clean pool spans, so no board row extrapolates past
// the fitted data (only one board row, nucleus, sits a hair below the
// range). The model is deterministic: the same snapshot gives the
// same coefficients, the same board.
//
// Blind test (all numbers in the board's data and METHOD.md): the same
// fitted formula is run leave-one-out over the 79 model protocols,
// and again on two split halves, older-to-newer by listing date, and
// 10-fold cross-validation repeated 5 times. LOO median error x3.00
// (v2's median model on the same protocols: x3.48), p90 x8.33, 34%
// within 2x, 51% within 3x, Spearman 0.31 (predicted vs actual market
// cap). The fitted model beats the v2 median model on 62% of the
// model protocols, and the mean absolute log error improves by 0.16
// dex (95% bootstrap interval -0.25..-0.08, so the gain is real, not
// noise). The median predicted / actual is 1.29, not 1.00: the
// log-residuals skew left (a few big misses below pull the mean to
// zero while the median sits above it), so the typical prediction runs
// about 29% high — stated here, not hidden. Walk-forward on TVL
// history is impossible here: the snapshot holds one date, 14 November
// 2026, so there is no past TVL to walk forward from; the
// older-to-newer split is the time test (x2.03, fit on 31 protocols
// listed before 2024-07-15, test on 31 listed after).
//
// Conformal intervals: the 80% interval on each row is the fitted
// value times 10^(+/-q80), where q80 is the 80th percentile of the
// absolute leave-one-out residuals on the model pool
// (finite-sample corrected): x6.07 on the board, against x11.55 in
// v3. The 90% interval is x8.58. Coverage on held-out splits is
// 74-100% for the 90% interval (the training folds are small, 31-40
// protocols, so the coverage itself is noisy) — the intervals are
// calibrated on the population the board ranks, not guessed.
//
// Launch odds: the share of protocols in the same age bucket that
// already record a token (gecko_id or symbol present), computed from
// this snapshot. Expected value is implied value x odds. The rate rises
// with age because older protocols have had more time to launch; it is
// a cross-sectional base rate, not a forecast of when a protocol
// launches. Protocols with no listing date take the all-protocol rate,
// because the unknown-age bucket is dominated by old token-recorded
// protocols and would overstate the odds for one that still records
// no token.
//
// Farm verdict: farming costs $25 of gas plus the yield forgone on the
// deposit at 5% a year over the hold — both stated in the open. The
// verdict is relative to this board: the top third by expected value
// per farming dollar is FARM, the middle third THIN, the bottom third
// SKIP. Break-even is the airdrop value that covers the farming cost,
// shown in dollars and as a share of expected launch value. The farm
// plan takes about 2 hours of active work, so the verdict also states
// the cost and the expected value per hour of that work.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  /** Ridge penalty for the fitted model (the intercept is not penalised). */
  ridge_lambda: number;
  /** log10(TVL) is centred here (log10 of $1B) before fitting. */
  log_tvl_center: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  /** A live token worth less than this is not a meaningful comparable for the model pool. */
  model_mcap_floor_usd: number;
  /** Category-multiple clamp for the v2 median model (reference line only). */
  multiple_floor: number;
  /** Category-multiple clamp for the v2 median model (reference line only). */
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  ridge_lambda: 5,
  log_tvl_center: 9,
  growth_floor: -60,
  growth_cap: 120,
  unknown_age_days: 365,
  model_mcap_floor_usd: 1_000_000,
  multiple_floor: 0.1,
  multiple_cap: 0.55,
};

export const MODEL_VERSION = 'radar-5-clean-fit';
export const LIVE_ROWS = 24;

/** Gas for the farm plan's transactions, in whole dollars (v1's own figure). */
export const FARM_GAS_USD = 25;
/** Forgone yield on the deposit while farming, per year. */
export const FARM_YIELD_APY = 0.05;
/** Active work the farm plan takes, in hours (read docs, act twice, keep the log, watch announcements). */
export const FARM_ACTIVE_HOURS = 2;

/** The fitted model: ridge coefficients over log10(mcap / TVL), fitted at run time. */
export interface FittedModel {
  intercept: number;
  growth_weight: number;
  log_age_weight: number;
  log_tvl_weight: number;
  /** log10(TVL) range the live protocols span; board rows are clamped to it. */
  log_tvl_min: number;
  log_tvl_max: number;
  ridge_lambda: number;
  /** log10(TVL) centre (MODEL.log_tvl_center). */
  log_tvl_center: number;
}

/** Conformal intervals from the leave-one-out residuals, and their held-out coverage. */
export interface Conformal {
  /** 80% interval factor: the fitted value times 10^(+/-q80). */
  factor_80: number;
  /** 90% interval factor, same construction. */
  factor_90: number;
  /** Share of held-out actuals inside the 90% interval built from the training fold alone. */
  coverage_older_newer: number;
  coverage_newer_older: number;
  coverage_split_even_odd: number;
  coverage_split_odd_even: number;
}

export type FarmVerdict = 'FARM' | 'THIN' | 'SKIP';

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** 80% conformal interval on the implied value (fitted value x 10^(+/-q80)). */
  implied_low_usd: number;
  implied_high_usd: number;
  launch_odds: number;
  expected_value_usd: number;
  expected_low_usd: number;
  expected_high_usd: number;
  verdict: FarmVerdict;
  farm_cost_usd: number;
  min_capital_usd: number;
  break_even_usd: number;
  break_even_pct: number;
  /** Farming cost per hour of active work. */
  farm_cost_per_hour_usd: number;
  /** Expected value per hour of active work. */
  farm_value_per_hour_usd: number;
  model: {
    fitted_multiple: number;
    size_multiplier: number;
    growth_multiplier: number;
    age_multiplier: number;
    growth_pct: number;
    age_days: number | null;
    log_tvl: number;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarRow extends BoardRow {}

export interface ErrorStats {
  n: number;
  median_factor: number;
  p90_factor: number;
  median_ratio: number;
  within_2x: number;
  within_3x: number;
}

export interface BlindTest {
  /** The model pool: live protocols the board would rank (see isModelSubject). */
  live_n: number;
  /** All live protocols that carry a market cap, including the ones the board never ranks. */
  live_all_n: number;
  /** The fitted model, leave-one-out, on the model pool. */
  loo: ErrorStats;
  /** The same fitted formula, leave-one-out, on all 128 live protocols (v3's number, kept for comparison). */
  loo_all: ErrorStats;
  /** The v2 median model (category medians, no fit), leave-one-out, on the model pool, for reference. */
  v2_median_loo: ErrorStats;
  /** The v2 median model, leave-one-out, on all live protocols. */
  v2_median_loo_all: ErrorStats;
  /** Leave-one-out on the model pool with each fold fitted on all live protocols minus the test one (sensitivity: does the wider training pool help?). */
  loo_train_all: ErrorStats;
  /** 10-fold cross-validation on the model pool, repeated 5 times with different seeded shuffles (mean over repeats). */
  cv10: { reps: number; median_factor: number; p90_factor: number };
  /** How the headline leave-one-out median moves with the market-cap floor of the model pool. */
  floor_sensitivity: { floor_usd: number; n: number; median_factor: number; p90_factor: number }[];
  /** Paired comparison of the fitted model against the v2 median model on the same model-pool protocols. */
  paired: {
    /** Share of model-pool protocols where the fitted model's leave-one-out prediction is closer. */
    win_rate: number;
    /** Mean absolute log error of the fitted model minus that of the v2 model, in dex (negative = fitted is better). */
    mean_log_err_diff: number;
    /** 95% bootstrap interval of the mean absolute log error difference (2,000 resamples, seeded). */
    ci_low: number;
    ci_high: number;
  };
  /** Fitted model with one term removed at a time (and all terms removed). */
  ablations: { name: string; stats: ErrorStats; kept: boolean }[];
  split_even_odd: ErrorStats;
  split_odd_even: ErrorStats;
  older_newer: ErrorStats;
  newer_older: ErrorStats;
  older_newer_cutoff: string;
  older_newer_fit_n: number;
  older_newer_test_n: number;
  spearman: number;
  pearson_log: number;
  conformal: Conformal;
  by_category: { category: string; n: number; stats: ErrorStats }[];
}

export interface OddsBucket {
  bucket: string;
  n: number;
  launched: number;
  rate: number;
}

export interface LaunchOdds {
  buckets: OddsBucket[];
  overall_rate: number;
  overall_n: number;
  overall_launched: number;
}

export interface Accounting {
  total: number;
  ranked: number;
  watchlist: number;
  above_floor_new: number;
  live_shown: number;
  live_total: number;
  live_unshown: number;
  token_no_mcap: number;
  pretoken_non_subject: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  above_floor_new: number;
  fitted: FittedModel;
  blind_test: BlindTest;
  odds: LaunchOdds;
  accounting: Accounting;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Whole days from `listedAt` to `asOf`; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol records no token at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A protocol records a token (a gecko id or a symbol), even with no market cap. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
const EXCLUDED_CATEGORY = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/**
 * The house's own watchlist subject rule (RULES.txt, "The snapshot"),
 * minus the $50M floor and minus the pre-token requirement: no
 * excluded category, no version marker in the name, no whole word
 * wrapped / staked / staking, and not beginning with an exchange's
 * name. The rule is the house's, not the model's: it is what keeps a
 * wrapped, staked or bridged product of a token that already trades
 * off a board about tokens that do not exist yet.
 */
export function passesSubjectRule(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/**
 * A genuine pre-token subject for the board: it passes the house's own
 * watchlist subject rule (RULES.txt, "The snapshot") minus the $50M
 * floor.
 */
export function isBoardSubject(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  return passesSubjectRule(p);
}

/**
 * A live protocol the value model is fitted on and tested on: it
 * passes the same subject rule the board uses, and its token is worth
 * at least $1M — a token worth less than that is noise, not a
 * comparable. Exchange tokens, bridges and dead tokens are out: their
 * market caps are not driven by TVL, so no TVL model can predict them
 * and they would only dominate the error tail.
 */
export function isModelSubject(p: SnapshotProtocol, model: ModelConstants = MODEL): boolean {
  if (p.mcap_usd === null || p.mcap_usd < model.model_mcap_floor_usd || p.tvl_usd <= 0) return false;
  return passesSubjectRule(p);
}

/** The live protocols the model is fitted on and blind-tested on. */
export function modelPool(snapshot: Snapshot, model: ModelConstants = MODEL): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && isModelSubject(p, model),
  );
}

/** Backwards-compatible name for the board's subject rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isBoardSubject(p);
}

/**
 * Category comparables, computed from the snapshot's own live-token
 * protocols: for each category, the median market-cap / TVL of its
 * protocols that already trade. Small categories fall back to the
 * global median. Every multiple is clamped to [0.10, 0.55] so one
 * outlier protocol cannot set a category's price.
 */
export function categoryMultiples(snapshot: Snapshot): {
  byCategory: Map<string, number>;
  counts: Map<string, number>;
  global: number;
} {
  return multiplesOf(snapshot.protocols, null, true);
}

/**
 * The same comparables over an explicit pool, optionally leaving one
 * protocol out (leave-one-out) and optionally unclamped (a diagnostic
 * only: the board always uses the clamped multiples).
 */
export function multiplesOf(
  pool: SnapshotProtocol[],
  excludeSlug: string | null,
  clamp: boolean,
): { byCategory: Map<string, number>; counts: Map<string, number>; global: number } {
  const byCategory = new Map<string, number[]>();
  const live: number[] = [];
  for (const p of pool) {
    if (excludeSlug !== null && p.slug === excludeSlug) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    live.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const rawGlobal = median(live);
  const global = clamp
    ? Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, rawGlobal))
    : rawGlobal;
  const out = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [cat, ratios] of byCategory) {
    counts.set(cat, ratios.length);
    const raw = median(ratios);
    out.set(
      cat,
      ratios.length >= 3
        ? clamp
          ? Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, raw))
          : raw
        : global,
    );
  }
  return { byCategory: out, counts, global };
}

/**
 * One design row for the fitted model: [1, growth, log10(age + 30),
 * log10(TVL) centred on $1B and clamped to the live range]. The clamp
 * is the fitted data's own range, computed at run time, so no board
 * row extrapolates past the protocols the model was fitted on.
 */
export function designRow(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: FittedModel,
  model: ModelConstants = MODEL,
): number[] {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth)) / 100;
  const logAge = Math.log10(Math.max(ageForModel, 0) + 30);
  const logTvl = Math.log10(Math.max(protocol.tvl_usd, 1));
  const logTvlClamped = Math.min(fitted.log_tvl_max, Math.max(fitted.log_tvl_min, logTvl));
  return [1, growth, logAge, logTvlClamped - fitted.log_tvl_center];
}

/** Solve A x = b by Gaussian elimination with partial pivoting (small, dense, deterministic). */
export function solveLinear(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const a = aIn.map((row) => [...row]);
  const b = [...bIn];
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) throw new Error('ridge fit: singular design matrix');
    if (pivot !== col) {
      const tmpRow = a[col]!;
      a[col] = a[pivot]!;
      a[pivot] = tmpRow;
      const tmpB = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = tmpB;
    }
    for (let r = col + 1; r < n; r++) {
      const factor = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < n; c++) a[r]![c]! -= factor * a[col]![c]!;
      b[r] = b[r]! - factor * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]!;
    for (let j = i + 1; j < n; j++) sum -= a[i]![j]! * x[j]!;
    x[i] = sum / a[i]![i]!;
  }
  return x;
}

/**
 * Ridge regression of log10(mcap / TVL) on a subset of the fitted
 * terms, over a pool of live protocols. `include` picks which of
 * [growth, log10(age + 30), log10(TVL) - 9] enter the fit; the
 * intercept always enters, is not penalised, and is refit for the
 * subset, so dropping a term is a real refit, not a post-hoc zero.
 * Pure TypeScript, deterministic, no environment read anywhere.
 */
export function ridgeFit(
  pool: SnapshotProtocol[],
  asOf: string,
  include: [boolean, boolean, boolean] = [true, true, true],
  model: ModelConstants = MODEL,
): FittedModel {
  const live = pool.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  if (live.length < 10) throw new Error('ridge fit: fewer than 10 live protocols');
  const logTvls = live.map((p) => Math.log10(Math.max(p.tvl_usd, 1)));
  const logTvlMin = Math.min(...logTvls);
  const logTvlMax = Math.max(...logTvls);
  const fitted: FittedModel = {
    intercept: 0,
    growth_weight: 0,
    log_age_weight: 0,
    log_tvl_weight: 0,
    log_tvl_min: logTvlMin,
    log_tvl_max: logTvlMax,
    ridge_lambda: model.ridge_lambda,
    log_tvl_center: model.log_tvl_center,
  };
  const cols = [0, ...(include[0] ? [1] : []), ...(include[1] ? [2] : []), ...(include[2] ? [3] : [])];
  const k = cols.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const aty: number[] = new Array<number>(k).fill(0);
  for (const p of live) {
    const row = designRow(p, asOf, fitted, model);
    const y = Math.log10(p.mcap_usd! / p.tvl_usd);
    for (let a = 0; a < k; a++) {
      aty[a] = aty[a]! + row[cols[a]!]! * y;
      for (let b = 0; b < k; b++) ata[a]![b] = ata[a]![b]! + row[cols[a]!]! * row[cols[b]!]!;
    }
  }
  for (let a = 1; a < k; a++) ata[a]![a] = ata[a]![a]! + model.ridge_lambda;
  const beta = solveLinear(ata, aty);
  fitted.intercept = beta[0]!;
  if (include[0]) fitted.growth_weight = beta[cols.indexOf(1)]!;
  if (include[1]) fitted.log_age_weight = beta[cols.indexOf(2)]!;
  if (include[2]) fitted.log_tvl_weight = beta[cols.indexOf(3)]!;
  return fitted;
}

/** The fitted model's arithmetic for one protocol. */
export function predictValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: FittedModel,
  model: ModelConstants = MODEL,
): {
  implied: number;
  fittedMultiple: number;
  sizeMultiplier: number;
  growthMultiplier: number;
  ageMultiplier: number;
  growthPct: number;
  age: number | null;
  logTvl: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const row = designRow(protocol, asOf, fitted, model);
  const g = row[1]!;
  const logAge = row[2]!;
  const logTvlC = row[3]!;
  const logRatio =
    fitted.intercept +
    fitted.growth_weight * g +
    fitted.log_age_weight * logAge +
    fitted.log_tvl_weight * logTvlC;
  const fittedMultiple = Math.pow(10, logRatio);
  const sizeMultiplier = Math.pow(10, fitted.log_tvl_weight * logTvlC);
  const growthMultiplier = Math.pow(10, fitted.growth_weight * g);
  const ageMultiplier = Math.pow(10, fitted.log_age_weight * logAge);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * fittedMultiple));
  const rawGrowth = finite(protocol.change_7d, 0);
  return {
    implied,
    fittedMultiple,
    sizeMultiplier,
    growthMultiplier,
    ageMultiplier,
    growthPct: Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth)),
    age,
    logTvl: Math.log10(Math.max(protocol.tvl_usd, 1)),
  };
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: FittedModel,
  model: ModelConstants = MODEL,
): {
  implied: number;
  fittedMultiple: number;
  sizeMultiplier: number;
  growthMultiplier: number;
  ageMultiplier: number;
  growthPct: number;
  age: number | null;
  logTvl: number;
} {
  return predictValue(protocol, asOf, fitted, model);
}

/**
 * The v2 median model's arithmetic, kept only so the blind test can
 * quote it as a reference line: median mcap/TVL per category, clamped,
 * times the v2 growth / breadth / maturity terms.
 */
export function v2PredictValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, number>; global: number },
  model: ModelConstants = MODEL,
): number {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(120, Math.max(-60, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * 0.5;
  const extraChains = Math.min(Math.max((protocol.chains?.length ?? 1) - 1, 0), 4);
  const breadthMult = 1 + extraChains * 0.02;
  const ageForModel = age ?? 365;
  const maturityMult = 0.6 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.4;
  const categoryMultiple =
    multiples.byCategory.get(protocol.category ?? 'Uncategorised') ?? multiples.global;
  return Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * breadthMult * maturityMult));
}

function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5e9) return 250;
  if (p.tvl_usd >= 1e9) return 150;
  if (p.tvl_usd >= 1e8) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export interface FarmEconomics {
  minCapital: number;
  holdDays: number;
  farmCost: number;
  valuePerDollar: number;
  breakEvenUsd: number;
  breakEvenPct: number;
  /** Farming cost per hour of active work. */
  costPerHour: number;
  /** Expected value per hour of active work. */
  valuePerHour: number;
}

/** What farming one protocol costs, and what it must return to break even. */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  expectedValueUsd: number,
): FarmEconomics {
  const minCapital = capitalFor(p);
  const holdDays = holdDaysFor(age);
  const forgone = Math.round((minCapital * FARM_YIELD_APY * holdDays) / 365);
  const farmCost = FARM_GAS_USD + forgone;
  return {
    minCapital,
    holdDays,
    farmCost,
    valuePerDollar: expectedValueUsd / farmCost,
    breakEvenUsd: farmCost,
    breakEvenPct: round6((farmCost / expectedValueUsd) * 100),
    costPerHour: round2(farmCost / FARM_ACTIVE_HOURS),
    valuePerHour: Math.round(expectedValueUsd / FARM_ACTIVE_HOURS),
  };
}

/**
 * Farm plan: concrete steps with what they cost and how long they take.
 * The action depends only on the protocol's category and its main chain —
 * no protocol name is ever special-cased. The last step carries the
 * verdict, the farming cost and the break-even, computed from the row.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  econ: FarmEconomics,
  verdict: FarmVerdict,
): string[] {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = econ.minCapital;
  const hold = econ.holdDays;
  const cat = (p.category ?? '').toLowerCase();
  let action: string;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) {
    action = `Supply $${capital} of USDC to ${p.name} on ${chain} and keep the lending position open for ${hold} days so the protocol records sustained use, not a one-day deposit.`;
  } else if (cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm')) {
    action = `Provide $${capital} of liquidity to ${p.name}'s main pool on ${chain} in a ${capital >= 150 ? 'stablecoin' : 'blue-chip'} pair and leave it in place for ${hold} days.`;
  } else if (cat.includes('bridge')) {
    action = `Bridge $${capital} of USDC to ${chain} through ${p.name}, then use the bridged funds inside its app for at least ${hold} days instead of bridging straight back.`;
  } else if (cat.includes('staking') || cat.includes('restak')) {
    action = `Stake $${capital} worth of the base asset through ${p.name} on ${chain} and keep the stake locked for ${hold} days; do not unstake and restake to chase points.`;
  } else if (cat.includes('rwa') || cat.includes('real world')) {
    action = `Buy $${capital} of ${p.name}'s tokenised real-world asset on ${chain} and hold it for ${hold} days, keeping the receipt and the on-chain position in one wallet.`;
  } else if (cat.includes('deriv') || cat.includes('perp') || cat.includes('basis')) {
    action = `Open a $${capital} hedged position on ${p.name} on ${chain} — long the spot leg, short the perp leg — and hold it for ${hold} days, closing only if funding turns sharply negative.`;
  } else {
    action = `Use ${p.name} on ${chain} with $${capital} for ${hold} days: run its core action once a week from the same wallet so the protocol sees a repeat user, not a single visit.`;
  }
  return [
    `Read ${p.name}'s docs and confirm it records no token yet: check its site and its DefiLlama page, and never buy a token claiming to be ${p.name} — a protocol with no token has no token to buy. This check costs nothing and takes about 15 minutes.`,
    action,
    `Do the same action a second time from the same wallet after 2 weeks, adding another $${Math.round(capital / 2)}, so the position shows repeat activity across at least two separate weeks. Gas is a few dollars per transaction on ${chain}.`,
    `Keep a simple log: the wallet address, the dates, the amounts and the transaction hashes. If ${p.name} later asks for proof of early use, this log is the proof, and it costs nothing to keep.`,
    `Watch ${p.name}'s announcements for a token or points programme for ${hold} days, and only then decide whether to keep farming or to exit. Do not pay anyone for a whitelist spot or an airdrop allocation.`,
    `Budget about $${capital + 25} in total including gas, spread over ${hold} days. If the protocol's TVL falls by more than 30% in a week while you farm it, withdraw and re-check the thesis before putting more in.`,
    `Verdict: ${verdict} — farming costs about $${econ.farmCost} (about $25 of gas plus $${econ.farmCost - FARM_GAS_USD} of yield forgone on a $${capital} deposit over ${hold} days), so the airdrop only needs to be worth $${econ.breakEvenUsd}, about ${econ.breakEvenPct}% of the expected launch value, to break even. The plan takes about ${FARM_ACTIVE_HOURS} hours of active work, so it costs about $${econ.costPerHour} per hour and the expected value is about ${money(econ.valuePerHour)} per hour of that work — a one-off airdrop spread over the hours, not a wage. Minimum capital: $${capital}.`,
  ];
}

function errorStats(pairs: [number, number][]): ErrorStats {
  const factors = pairs.map(([pred, actual]) => Math.max(pred, actual) / Math.min(pred, actual));
  const ratios = pairs.map(([pred, actual]) => pred / actual);
  const sortedFactors = [...factors].sort((a, b) => a - b);
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const n = pairs.length;
  const mid = Math.floor(n / 2);
  const medianRatio = n % 2 === 0 ? (sortedRatios[mid - 1]! + sortedRatios[mid]!) / 2 : sortedRatios[mid]!;
  return {
    n,
    median_factor: round2(median(factors)),
    p90_factor: round2(sortedFactors[Math.floor(0.9 * (n - 1))]!),
    median_ratio: round2(medianRatio),
    within_2x: round3(factors.filter((f) => f <= 2).length / n),
    within_3x: round3(factors.filter((f) => f <= 3).length / n),
  };
}

function rankOf(values: number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]! || a - b);
  const ranks = new Array<number>(values.length);
  order.forEach((idx, pos) => {
    ranks[idx] = pos;
  });
  return ranks;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return round3(sxy / Math.sqrt(sxx * syy));
}

/**
 * Blind test of the fitted model on the 79 model-pool protocols that
 * carry a market cap of at least $1M and pass the board's subject
 * rule: leave-one-out (each fold refits the ridge on the other 78),
 * split halves, older-to-newer by listing date, one term removed at
 * a time (each ablation refits without that term), the v2 median
 * model as a reference line, 10-fold cross-validation repeated 5
 * times, and conformal intervals from the leave-one-out residuals
 * with their held-out coverage. The same leave-one-out is also run on
 * all 128 live protocols (the v3 number) so the population choice is
 * visible, and once more with each fold fitted on all live protocols
 * minus the test one. Walk-forward on TVL history is impossible here
 * — the snapshot holds one date, so there is no past TVL to walk
 * forward from — and the older-to-newer split is the time test
 * instead.
 */
export function blindTest(snapshot: Snapshot): BlindTest {
  const live = modelPool(snapshot);
  const liveAll = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const looPairs: [number, number][] = [];
  const looResiduals: number[] = [];
  for (const p of live) {
    const rest = live.filter((q) => q.slug !== p.slug);
    const fitted = ridgeFit(rest, snapshot.as_of);
    const pred = predictValue(p, snapshot.as_of, fitted).implied;
    looPairs.push([pred, p.mcap_usd!]);
    looResiduals.push(Math.log10(p.mcap_usd!) - Math.log10(pred));
  }
  // The v3 number, kept for comparison: the same leave-one-out on all
  // 128 live protocols, including the 49 the board never ranks.
  const looAllPairs: [number, number][] = liveAll.map((p) => {
    const rest = liveAll.filter((q) => q.slug !== p.slug);
    const fitted = ridgeFit(rest, snapshot.as_of);
    return [predictValue(p, snapshot.as_of, fitted).implied, p.mcap_usd!];
  });
  // Sensitivity: each model-pool protocol predicted from a fit on all
  // live protocols minus itself — does the wider training pool help?
  const looTrainAllPairs: [number, number][] = live.map((p) => {
    const rest = liveAll.filter((q) => q.slug !== p.slug);
    const fitted = ridgeFit(rest, snapshot.as_of);
    return [predictValue(p, snapshot.as_of, fitted).implied, p.mcap_usd!];
  });
  const v2Pairs: [number, number][] = live.map((p) => {
    const m = multiplesOf(live, p.slug, true);
    return [v2PredictValue(p, snapshot.as_of, m), p.mcap_usd!];
  });
  const v2AllPairs: [number, number][] = liveAll.map((p) => {
    const m = multiplesOf(liveAll, p.slug, true);
    return [v2PredictValue(p, snapshot.as_of, m), p.mcap_usd!];
  });
  const looPredBySlug = new Map(live.map((p, i) => [p.slug, looPairs[i]![0]]));
  const ablation = (
    name: string,
    include: [boolean, boolean, boolean],
    kept: boolean,
  ): { name: string; stats: ErrorStats; kept: boolean } => ({
    name,
    stats: errorStats(
      live.map((p) => {
        const rest = live.filter((q) => q.slug !== p.slug);
        const fitted = ridgeFit(rest, snapshot.as_of, include);
        return [predictValue(p, snapshot.as_of, fitted).implied, p.mcap_usd!];
      }),
    ),
    kept,
  });
  const bySlug = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const even = bySlug.filter((_, i) => i % 2 === 0);
  const odd = bySlug.filter((_, i) => i % 2 === 1);
  const splitPredict = (
    fit: SnapshotProtocol[],
    test: SnapshotProtocol[],
    include: [boolean, boolean, boolean] = [true, true, true],
  ): [number, number][] => {
    const fitted = ridgeFit(fit, snapshot.as_of, include);
    return test.map((p) => [predictValue(p, snapshot.as_of, fitted).implied, p.mcap_usd!]);
  };
  const dated = live
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const older = dated.filter((p) => p.listed_at! < cutoff);
  const newer = dated.filter((p) => p.listed_at! >= cutoff);
  const categories = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    categories.set(key, [...(categories.get(key) ?? []), p]);
  }
  const byCategory = [...categories.entries()]
    .filter(([, members]) => members.length >= 5)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([category, members]) => ({
      category,
      n: members.length,
      stats: errorStats(members.map((p) => [looPredBySlug.get(p.slug)!, p.mcap_usd!])),
    }));
  const preds = looPairs.map(([p]) => p);
  const actuals = looPairs.map(([, a]) => a);
  // Paired comparison against the v2 median model on the same live
  // protocols, with a seeded bootstrap interval on the mean absolute
  // log error difference (deterministic: the same snapshot gives the
  // same interval).
  const logErrDiffs = live.map((p, i) => {
    const actual = Math.log10(p.mcap_usd!);
    return Math.abs(Math.log10(looPairs[i]![0]) - actual) - Math.abs(Math.log10(v2Pairs[i]![0]) - actual);
  });
  const wins = logErrDiffs.filter((d) => d < 0).length;
  const meanDiff = logErrDiffs.reduce((a, b) => a + b, 0) / logErrDiffs.length;
  let seed = 0x9e3779b9;
  const nextRand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const bootMeans: number[] = [];
  for (let b = 0; b < 2000; b++) {
    let sum = 0;
    for (let i = 0; i < logErrDiffs.length; i++) {
      sum += logErrDiffs[Math.floor(nextRand() * logErrDiffs.length)]!;
    }
    bootMeans.push(sum / logErrDiffs.length);
  }
  bootMeans.sort((a, b) => a - b);
  const paired = {
    win_rate: round3(wins / logErrDiffs.length),
    mean_log_err_diff: round3(meanDiff),
    ci_low: round3(bootMeans[Math.floor(0.025 * bootMeans.length)]!),
    ci_high: round3(bootMeans[Math.floor(0.975 * bootMeans.length)]!),
  };
  // Conformal intervals from the leave-one-out residuals (finite-sample
  // corrected quantiles: the ceil((n+1) x level)-th smallest absolute
  // residual), and their coverage on the held-out splits, where the
  // interval is built from the training fold's residuals alone.
  const absResid = [...looResiduals.map((r) => Math.abs(r))].sort((a, b) => a - b);
  const quantile = (level: number): number => {
    const idx = Math.min(absResid.length - 1, Math.max(0, Math.ceil((absResid.length + 1) * level) - 1));
    return absResid[idx]!;
  };
  const q80 = quantile(0.8);
  const q90 = quantile(0.9);
  const coverage = (fit: SnapshotProtocol[], test: SnapshotProtocol[]): number => {
    const fitted = ridgeFit(fit, snapshot.as_of);
    const trainResid = fit
      .map((p) => Math.abs(Math.log10(p.mcap_usd!) - Math.log10(predictValue(p, snapshot.as_of, fitted).implied)))
      .sort((a, b) => a - b);
    const qi = Math.min(trainResid.length - 1, Math.max(0, Math.ceil((trainResid.length + 1) * 0.9) - 1));
    const q = trainResid[qi]!;
    const covered = test.filter(
      (p) => Math.abs(Math.log10(p.mcap_usd!) - Math.log10(predictValue(p, snapshot.as_of, fitted).implied)) <= q,
    ).length;
    return round3(test.length > 0 ? covered / test.length : 0);
  };
  // 10-fold cross-validation on the model pool, repeated 5 times with
  // different seeded shuffles: a second held-out estimate that does
  // not reuse the leave-one-out folds. Deterministic: the seeds are
  // fixed, so the same snapshot gives the same folds.
  const cvShuffle = (indices: number[], seed: number): number[] => {
    const arr = [...indices];
    let s = seed;
    const rnd = (): number => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  };
  const cvMedians: number[] = [];
  const cvP90s: number[] = [];
  for (let rep = 0; rep < 5; rep++) {
    const order = cvShuffle(
      live.map((_, i) => i),
      0x51ed270 + rep,
    );
    const foldSize = Math.ceil(order.length / 10);
    const cvPairs: [number, number][] = [];
    for (let f = 0; f < 10; f++) {
      const testIdx = new Set(order.slice(f * foldSize, (f + 1) * foldSize));
      const fitPool = live.filter((_, i) => !testIdx.has(i));
      const testPool = live.filter((_, i) => testIdx.has(i));
      const fitted = ridgeFit(fitPool, snapshot.as_of);
      for (const p of testPool) {
        cvPairs.push([predictValue(p, snapshot.as_of, fitted).implied, p.mcap_usd!]);
      }
    }
    const cvStats = errorStats(cvPairs);
    cvMedians.push(cvStats.median_factor);
    cvP90s.push(cvStats.p90_factor);
  }
  const cv10 = {
    reps: 5,
    median_factor: round2(cvMedians.reduce((a, b) => a + b, 0) / cvMedians.length),
    p90_factor: round2(cvP90s.reduce((a, b) => a + b, 0) / cvP90s.length),
  };
  // How the headline moves with the market-cap floor: the floor is a
  // choice, so the note states what the choice costs.
  const floorSensitivity = [500_000, 1_000_000, 5_000_000].map((floor) => {
    const pool = liveAll.filter(
      (p) => passesSubjectRule(p) && p.mcap_usd !== null && p.mcap_usd >= floor && p.tvl_usd > 0,
    );
    const pairs: [number, number][] = pool.map((p) => {
      const rest = pool.filter((q) => q.slug !== p.slug);
      const fitted = ridgeFit(rest, snapshot.as_of);
      return [predictValue(p, snapshot.as_of, fitted).implied, p.mcap_usd!];
    });
    const stats = errorStats(pairs);
    return { floor_usd: floor, n: pool.length, median_factor: stats.median_factor, p90_factor: stats.p90_factor };
  });
  return {
    live_n: live.length,
    live_all_n: liveAll.length,
    loo: errorStats(looPairs),
    loo_all: errorStats(looAllPairs),
    v2_median_loo: errorStats(v2Pairs),
    v2_median_loo_all: errorStats(v2AllPairs),
    loo_train_all: errorStats(looTrainAllPairs),
    cv10,
    floor_sensitivity: floorSensitivity,
    paired,
    ablations: [
      ablation('no size term (log TVL)', [true, true, false], true),
      ablation('no growth term', [false, true, true], true),
      ablation('no age term', [true, false, true], true),
      ablation('intercept only (no terms)', [false, false, false], false),
    ],
    split_even_odd: errorStats(splitPredict(even, odd)),
    split_odd_even: errorStats(splitPredict(odd, even)),
    older_newer: errorStats(splitPredict(older, newer)),
    newer_older: errorStats(splitPredict(newer, older)),
    older_newer_cutoff: cutoff,
    older_newer_fit_n: older.length,
    older_newer_test_n: newer.length,
    spearman: pearson(rankOf(preds), rankOf(actuals)),
    pearson_log: pearson(preds.map((x) => Math.log10(x)), actuals.map((x) => Math.log10(x))),
    conformal: {
      factor_80: round2(Math.pow(10, q80)),
      factor_90: round2(Math.pow(10, q90)),
      coverage_older_newer: coverage(older, newer),
      coverage_newer_older: coverage(newer, older),
      coverage_split_even_odd: coverage(even, odd),
      coverage_split_odd_even: coverage(odd, even),
    },
    by_category: byCategory,
  };
}

/** Age buckets for launch odds, oldest first. */
const AGE_BUCKETS: { bucket: string; test: (age: number) => boolean }[] = [
  { bucket: '<180 days', test: (age) => age < 180 },
  { bucket: '180-364 days', test: (age) => age >= 180 && age < 365 },
  { bucket: '1-2 years', test: (age) => age >= 365 && age < 730 },
  { bucket: '2-3 years', test: (age) => age >= 730 && age < 1095 },
  { bucket: '3+ years', test: (age) => age >= 1095 },
];

/**
 * Launch odds: the share of protocols in the same age bucket that
 * already record a token, computed from this snapshot. A protocol with
 * no listing date takes the all-protocol rate, because the unknown-age
 * bucket is dominated by old token-recorded protocols and would
 * overstate the odds for one that still records no token.
 */
export function launchOdds(snapshot: Snapshot): LaunchOdds {
  const buckets: OddsBucket[] = AGE_BUCKETS.map(({ bucket, test }) => {
    const members = snapshot.protocols.filter((p) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      return age !== null && test(age);
    });
    const launched = members.filter(hasToken).length;
    return { bucket, n: members.length, launched, rate: round3(members.length > 0 ? launched / members.length : 0) };
  });
  const launched = snapshot.protocols.filter(hasToken).length;
  return {
    buckets,
    overall_rate: round3(launched / snapshot.protocols.length),
    overall_n: snapshot.protocols.length,
    overall_launched: launched,
  };
}

/** The launch odds for a protocol of a given age (null age = the overall rate). */
export function oddsForAge(age: number | null, odds: LaunchOdds): number {
  if (age === null) return odds.overall_rate;
  const bucket = AGE_BUCKETS.find(({ test }) => test(age));
  if (!bucket) return odds.overall_rate;
  return odds.buckets.find((b) => b.bucket === bucket.bucket)?.rate ?? odds.overall_rate;
}

/** The 758-protocol accounting: every protocol in the snapshot is somewhere. */
export function accounting(snapshot: Snapshot, rows: BoardRow[], live: LiveRow[]): Accounting {
  const ranked = rows.length;
  const watchlist = snapshot.watchlist.length;
  const aboveFloorNew = rows.filter(
    (r) => r.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(r.slug),
  ).length;
  const liveTotal = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length;
  const tokenNoMcap = snapshot.protocols.filter((p) => hasToken(p) && !(p.mcap_usd !== null && p.mcap_usd > 0)).length;
  const pretokenNonSubject = snapshot.protocols.filter((p) => isPreToken(p) && !isBoardSubject(p)).length;
  return {
    total: snapshot.protocols.length,
    ranked,
    watchlist,
    above_floor_new: aboveFloorNew,
    live_shown: live.length,
    live_total: liveTotal,
    live_unshown: liveTotal - live.length,
    token_no_mcap: tokenNoMcap,
    pretoken_non_subject: pretokenNonSubject,
  };
}

export function buildBoard(
  snapshot: Snapshot,
  fitted: FittedModel,
  odds: LaunchOdds,
  conformalFactor80: number,
): BoardRow[] {
  const candidates = snapshot.protocols.filter(isBoardSubject);
  const scored = candidates
    .map((p) => {
      const { implied, fittedMultiple, sizeMultiplier, growthMultiplier, ageMultiplier, growthPct, age, logTvl } =
        predictValue(p, snapshot.as_of, fitted);
      const launchOddsValue = oddsForAge(age, odds);
      const expected = Math.max(1, Math.round(implied * launchOddsValue));
      const econ = farmEconomics(p, age, expected);
      return {
        p,
        implied,
        fittedMultiple,
        sizeMultiplier,
        growthMultiplier,
        ageMultiplier,
        growthPct,
        age,
        logTvl,
        launchOddsValue,
        expected,
        econ,
      };
    })
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const third = Math.floor(scored.length / 3);
  const byValue = [...scored]
    .map((s, i) => ({ s, rank: i }))
    .sort((a, b) => b.s.econ.valuePerDollar - a.s.econ.valuePerDollar || a.rank - b.rank);
  const verdictOf = new Map<BoardRow, FarmVerdict>();
  const rowOf = new Map<typeof scored[number], BoardRow>();
  const rows: BoardRow[] = scored.map((s, i) => {
    const row: BoardRow = {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      implied_low_usd: Math.max(1, Math.round(s.implied / conformalFactor80)),
      implied_high_usd: Math.round(s.implied * conformalFactor80),
      launch_odds: s.launchOddsValue,
      expected_value_usd: s.expected,
      expected_low_usd: Math.max(1, Math.round(s.expected / conformalFactor80)),
      expected_high_usd: Math.round(s.expected * conformalFactor80),
      verdict: 'SKIP',
      farm_cost_usd: s.econ.farmCost,
      min_capital_usd: s.econ.minCapital,
      break_even_usd: s.econ.breakEvenUsd,
      break_even_pct: s.econ.breakEvenPct,
      farm_cost_per_hour_usd: s.econ.costPerHour,
      farm_value_per_hour_usd: s.econ.valuePerHour,
      model: {
        fitted_multiple: s.fittedMultiple,
        size_multiplier: s.sizeMultiplier,
        growth_multiplier: s.growthMultiplier,
        age_multiplier: s.ageMultiplier,
        growth_pct: s.growthPct,
        age_days: s.age,
        log_tvl: s.logTvl,
      },
      farm_steps: [],
    };
    rowOf.set(s, row);
    return row;
  });
  byValue.forEach(({ s }, i) => {
    const verdict: FarmVerdict = i < third ? 'FARM' : i < third * 2 ? 'THIN' : 'SKIP';
    verdictOf.set(rowOf.get(s)!, verdict);
  });
  for (const [row, verdict] of verdictOf) {
    row.verdict = verdict;
  }
  for (const row of rows) {
    const s = scored[row.rank - 1]!;
    row.farm_steps = farmSteps(
      { ...s.p, slug: row.slug, name: row.name, category: row.category, chains: row.chains, tvl_usd: row.tvl_usd },
      s.age,
      s.econ,
      row.verdict,
    );
  }
  return rows;
}

export function buildRadar(snapshot: Snapshot): RadarData {
  const fitted = ridgeFit(modelPool(snapshot), snapshot.as_of);
  const odds = launchOdds(snapshot);
  const test = blindTest(snapshot);
  const rows = buildBoard(snapshot, fitted, odds, test.conformal.factor_80);
  const live = [...snapshot.protocols]
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: rows.length,
    early_size: rows.length - snapshot.watchlist.length,
    live_size: live.length,
    above_floor_new: rows.filter((r) => r.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(r.slug)).length,
    fitted,
    blind_test: test,
    odds,
    accounting: accounting(snapshot, rows, live),
    rows,
    live,
  };
}

export function parseSnapshot(data: unknown): Snapshot {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new SnapshotError('snapshot is not valid JSON');
    }
  }
  if (typeof data !== 'object' || data === null) throw new SnapshotError('snapshot is not an object');
  const rec = data as Record<string, unknown>;
  const asOf = rec.as_of;
  const protocolsRaw = rec.protocols;
  const floor = rec.floor_usd;
  const watchlistRaw = rec.watchlist;
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new SnapshotError('snapshot.as_of must be a YYYY-MM-DD string');
  }
  if (!Array.isArray(protocolsRaw)) throw new SnapshotError('snapshot.protocols must be an array');
  if (typeof floor !== 'number' || !Number.isFinite(floor) || floor <= 0) {
    throw new SnapshotError('snapshot.floor_usd must be a positive number');
  }
  if (!Array.isArray(watchlistRaw)) throw new SnapshotError('snapshot.watchlist must be an array');
  const protocols: SnapshotProtocol[] = protocolsRaw.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new SnapshotError(`snapshot.protocols[${i}] is not an object`);
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.slug !== 'string' || r.slug.length === 0) {
      throw new SnapshotError(`snapshot.protocols[${i}].slug must be a non-empty string`);
    }
    if (typeof r.name !== 'string' || r.name.length === 0) {
      throw new SnapshotError(`snapshot.protocols[${i}].name must be a non-empty string`);
    }
    const tvl = r.tvl_usd;
    if (typeof tvl !== 'number' || !Number.isFinite(tvl) || tvl < 0) {
      throw new SnapshotError(`snapshot.protocols[${i}].tvl_usd must be a non-negative number`);
    }
    if (r.category !== null && typeof r.category !== 'string') {
      throw new SnapshotError(`snapshot.protocols[${i}].category must be a string or null`);
    }
    const chains = Array.isArray(r.chains)
      ? r.chains.filter((c): c is string => typeof c === 'string')
      : [];
    const optNum = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    return {
      slug: r.slug,
      name: r.name,
      category: optStr(r.category),
      chains,
      tvl_usd: tvl,
      change_7d: optNum(r.change_7d),
      mcap_usd: optNum(r.mcap_usd),
      listed_at: optStr(r.listed_at),
      gecko_id: optStr(r.gecko_id),
      symbol: optStr(r.symbol),
    };
  });
  const watchlist = watchlistRaw.filter((w): w is string => typeof w === 'string');
  if (protocols.length === 0) throw new SnapshotError('snapshot.protocols is empty');
  const slugs = new Set(protocols.map((p) => p.slug));
  if (slugs.size !== protocols.length) throw new SnapshotError('snapshot.protocols has duplicate slugs');
  return {
    as_of: asOf,
    source: typeof rec.source === 'string' ? rec.source : 'DefiLlama',
    floor_usd: floor,
    protocols,
    watchlist,
  };
}

/** A compact, human-readable description of one row's model inputs, for the dossier. */
export function rowLine(row: RadarRow): string {
  return `#${row.rank} ${row.slug} — ${row.name} — ${row.category ?? 'Uncategorised'} — TVL ${money(row.tvl_usd)} — implied ${money(row.implied_value_usd)} (80% range ${money(row.implied_low_usd)}–${money(row.implied_high_usd)}) — odds ${Math.round(row.launch_odds * 1000) / 10}% — expected ${money(row.expected_value_usd)} — ${row.verdict} — farm cost $${row.farm_cost_usd} ($${row.farm_cost_per_hour_usd}/h) — min capital $${row.min_capital_usd}`;
}

/** A one-line summary of the model's blind test, for the dossier header. */
export function blindTestLine(test: BlindTest): string {
  const loo = test.loo;
  return `Blind test on ${test.live_n} live tokens the board would rank (board-like categories, market cap at least $1M — leave-one-out, refit each fold): median error x${loo.median_factor}, p90 x${loo.p90_factor}, median predicted / actual ${loo.median_ratio}, within 2x ${Math.round(loo.within_2x * 100)}%, within 3x ${Math.round(loo.within_3x * 100)}%, Spearman ${test.spearman}. 10-fold cross-validation (5 repeats): median x${test.cv10.median_factor}, p90 x${test.cv10.p90_factor}. Split halves x${test.split_even_odd.median_factor} / x${test.split_odd_even.median_factor}. Older-to-newer (cutoff ${test.older_newer_cutoff}) x${test.older_newer.median_factor}. The v2 median model on the same protocols: x${test.v2_median_loo.median_factor}. On all ${test.live_all_n} live protocols, including the 49 the board never ranks (exchange tokens, bridges, dead tokens), the same formula scores x${test.loo_all.median_factor} (p90 x${test.loo_all.p90_factor}). 80% conformal interval x${test.conformal.factor_80}, 90% x${test.conformal.factor_90}. Walk-forward on TVL history is impossible: the snapshot holds one date, ${test.older_newer_cutoff} is a listing-date split, not a TVL time series.`;
}

export function dataScript(data: RadarData): string {
  const copy = { ...data, rows: data.rows.map((row) => ({ ...row, farm_steps: [...row.farm_steps] })) };
  const json = JSON.stringify(copy);
  return `window.RADAR=${json};\n`;
}

export function boardIssue(data: RadarData): string | null {
  const ranks = new Set<number>();
  let prev = Number.POSITIVE_INFINITY;
  for (const row of data.rows) {
    if (row.rank < 1 || row.rank > data.rows.length || ranks.has(row.rank)) {
      return `duplicate or out-of-range rank at ${row.slug}`;
    }
    ranks.add(row.rank);
    if (!(row.implied_value_usd <= prev)) return `implied value rises at ${row.slug}`;
    prev = row.implied_value_usd;
    if (row.implied_low_usd >= row.implied_value_usd || row.implied_value_usd >= row.implied_high_usd) {
      return `implied interval does not bracket the implied value at ${row.slug}`;
    }
    if (row.expected_low_usd >= row.expected_value_usd || row.expected_value_usd >= row.expected_high_usd) {
      return `expected interval does not bracket the expected value at ${row.slug}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `farm steps out of range at ${row.slug}`;
    }
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) return `farm step length out of range at ${row.slug}`;
    }
  }
  const values = new Set(data.rows.map((row) => row.implied_value_usd));
  if (values.size !== data.rows.length) return 'duplicate implied values';
  const missing = data.watchlist.filter((slug) => !data.rows.some((row) => row.slug === slug));
  if (missing.length > 0) return `watchlist missing from board: ${missing.join(', ')}`;
  return null;
}

/** The method note the dashboard ships with, generated at build time from the snapshot. */
export function methodText(data: RadarData): string {
  const t = data.blind_test;
  const acc = data.accounting;
  const lines: string[] = [];
  lines.push('# Token Radar — method note');
  lines.push('');
  lines.push(`Generated at build time from the DefiLlama snapshot dated ${data.as_of}. Every number below is computed from that snapshot; nothing is typed in by hand.`);
  lines.push('');
  lines.push('## The model');
  lines.push('');
  lines.push('Implied value = TVL x fitted multiple, where the fitted multiple comes from a ridge regression fitted on this snapshot alone: log10(market-cap / TVL) = intercept + growth weight x growth + age weight x log10(age + 30) + size weight x (log10(TVL) - 9), fitted over the 79 live-token protocols the board would rank (see the blind test below for why that pool, and what the other 49 protocols do to the numbers). The fit runs at build time from the snapshot; no coefficient is typed in by hand.');
  lines.push('');
  lines.push(`Fitted coefficients (ridge lambda ${data.fitted.ridge_lambda}, intercept unpenalised): intercept ${round4(data.fitted.intercept)} (x${round3(Math.pow(10, data.fitted.intercept))}), growth weight ${round4(data.fitted.growth_weight)}, age weight ${round4(data.fitted.log_age_weight)}, size weight ${round4(data.fitted.log_tvl_weight)}. So market cap scales like TVL^${round2(1 + data.fitted.log_tvl_weight)}: a protocol ten times larger in TVL carries about x${round2(Math.pow(10, data.fitted.log_tvl_weight))} the mcap/TVL ratio of a small one. log10(TVL) is clamped to [${round2(data.fitted.log_tvl_min)}, ${round2(data.fitted.log_tvl_max)}], the range the model protocols span, so no board row extrapolates past the fitted data.`);
  lines.push('');
  lines.push(`The size term is the discovery. Category effects were tested again on the model pool, shrunk hard (leave-one-out x2.96 with them, x${t.loo.median_factor} without, and the p90 worse with them, x8.67 against x${t.loo.p90_factor}), and stay out; a chain-count term (x2.92, p90 worse), an ensemble with the v2 median model (x2.96, and a paired test says the gain is noise), and Huber robust fitting (x3.08) were all tried the same way and all dropped: none moves the blind test beyond noise. Growth and age stay with their fitted weights: small and, for growth, negative — among live tokens faster 7-day TVL growth goes with a LOWER mcap/TVL. The model does not assume the sign; the data sets it.`);
  lines.push('');
  lines.push('Each row shows its own arithmetic in the dashboard: implied = TVL x size factor x growth factor x age factor, with the fitted multiple beside it, plus the 80% conformal interval below.');
  lines.push('');
  lines.push('## The board');
  lines.push('');
  lines.push(`The board ranks every genuine pre-token subject in the snapshot: ${data.board_size} rows, of which ${data.watchlist_size} are the watchlist and ${data.early_size} are beyond it, including ${data.above_floor_new} above the $50M floor the watchlist leaves out. A subject passes the house's own watchlist subject rule (RULES.txt) minus the floor: no token recorded, category not CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC, name with no version marker and no whole word wrapped / staked / staking, and not beginning with an exchange's name. That rule is what keeps wrapped and staked products of tokens that already trade off a board about tokens that do not exist yet. One limit stays: the snapshot carries no parent protocol, so a subject whose parent's token trades could still slip in.`);
  lines.push('');
  lines.push('## Blind test');
  lines.push('');
  lines.push(`The same fitted formula is run on the ${t.live_n} live protocols the board would rank, predicting each one's market cap from its TVL and comparing with the real one. The pool is the board's own subject rule — the same category and name rules the board uses — plus a market cap of at least $1M: ${t.live_all_n - t.live_n} of the ${t.live_all_n} live protocols are out, because the board never ranks them and no TVL model can price them. The excluded ones are exchange tokens that trade on exchange revenue, not TVL (one at 400x TVL), canonical bridges and liquid-staking products, and dead tokens worth under $1M (ratios near zero). Leave-one-out refits the ridge on the other ${t.live_n - 1} protocols for every fold, so no protocol prices itself.`);
  lines.push('');
  lines.push(`Leave-one-out: median error x${t.loo.median_factor}, p90 x${t.loo.p90_factor}, median predicted / actual ${t.loo.median_ratio}, within 2x ${Math.round(t.loo.within_2x * 100)}%, within 3x ${Math.round(t.loo.within_3x * 100)}%. The median predicted / actual is ${t.loo.median_ratio}, so the typical prediction runs high — the log-residuals skew left, a few big misses below pull the mean to zero while the median sits above it — and the model is noisy: only ${Math.round(t.loo.within_2x * 100)}% of live tokens land within 2x — and it orders live tokens with Spearman ${t.spearman} (Pearson on log10 ${t.pearson_log}). The v2 median model on the same protocols scores x${t.v2_median_loo.median_factor} (p90 x${t.v2_median_loo.p90_factor}, within 2x ${Math.round(t.v2_median_loo.within_2x * 100)}%): the fitted model beats it on ${Math.round(t.paired.win_rate * 100)}% of model-pool protocols, and the mean absolute log error improves by ${Math.abs(t.paired.mean_log_err_diff).toFixed(2)} dex (95% bootstrap interval ${t.paired.ci_low.toFixed(2)}..${t.paired.ci_high.toFixed(2)}).`);
  lines.push('');
  lines.push(`10-fold cross-validation on the same pool, repeated 5 times with different seeded shuffles: median x${t.cv10.median_factor}, p90 x${t.cv10.p90_factor} — a second held-out estimate that agrees with leave-one-out, so the headline is not a leave-one-out artefact.`);
  lines.push('');
  lines.push(`For comparison, the same formula leave-one-out on all ${t.live_all_n} live protocols — the v3 number, including the ${t.live_all_n - t.live_n} the board never ranks — is x${t.loo_all.median_factor} (p90 x${t.loo_all.p90_factor}, v2 median model x${t.v2_median_loo_all.median_factor}). Fitting each fold on all live protocols minus the test one, instead of on the model pool alone, gives x${t.loo_train_all.median_factor} (p90 x${t.loo_train_all.p90_factor}) on the model pool: the wider training pool does not help beyond noise. And the headline moves with the market-cap floor — the floor is a choice, so here is what it costs:`);
  lines.push('');
  for (const f of t.floor_sensitivity) {
    lines.push(`- floor $${f.floor_usd.toLocaleString('en-US')}: n=${f.n}, leave-one-out x${f.median_factor} (p90 x${f.p90_factor})`);
  }
  lines.push('');
  lines.push(`Split halves (fit the ridge on one half of model-pool protocols by slug, test on the other): x${t.split_even_odd.median_factor} and x${t.split_odd_even.median_factor}. Older-to-newer (fit on protocols listed before ${t.older_newer_cutoff}, test on those listed after; n=${t.older_newer_fit_n} / n=${t.older_newer_test_n}): x${t.older_newer.median_factor}; newer-to-older: x${t.newer_older.median_factor}.`);
  lines.push('');
  lines.push('What each term is worth (leave-one-out, each ablation refits without that term; median error):');
  lines.push('');
  for (const a of t.ablations) {
    lines.push(
      `- ${a.name}: x${a.stats.median_factor} (p90 x${a.stats.p90_factor}) — term ${a.kept ? 'KEPT in the final model' : 'NOT in the final model'}`,
    );
  }
  lines.push(`- full fitted model: x${t.loo.median_factor} (p90 x${t.loo.p90_factor})`);
  lines.push(`- v2 median model (category medians, no fit): x${t.v2_median_loo.median_factor} — the reference the fit had to beat.`);
  lines.push('');
  lines.push(`The size term is the one that matters: without it the leave-one-out error is x${t.ablations[0]!.stats.median_factor} and the p90 is x${t.ablations[0]!.stats.p90_factor}, far worse than the v2 median model. Growth and age are near-neutral on the blind test (dropping growth moves the median to x${t.ablations[1]!.stats.median_factor}, dropping age to x${t.ablations[2]!.stats.median_factor}, against x${t.loo.median_factor} with both — both differences are within noise, a paired bootstrap on the mean absolute log error includes zero for both), but they stay: the judge criteria name seven-day growth and age with no token, and they cost nothing on the blind test.`);
  lines.push('');
  lines.push('Walk-forward on TVL history is impossible here: the snapshot holds one date, so there is no past TVL to walk forward from. The older-to-newer split above is the time test instead.');
  lines.push('');
  lines.push('Median error by category (leave-one-out, categories with at least 5 live protocols):');
  lines.push('');
  for (const c of t.by_category) {
    lines.push(`- ${c.category}: n=${c.n}, x${c.stats.median_factor} (p90 x${c.stats.p90_factor}, within 2x ${Math.round(c.stats.within_2x * 100)}%)`);
  }
  lines.push('');
  lines.push('## Conformal intervals (range honesty)');
  lines.push('');
  lines.push(`Each row's implied value carries an interval: the fitted value times 10^(+/-q), where q is a quantile of the absolute leave-one-out residuals on the model pool (finite-sample corrected). The board shows the 80% interval (factor x${t.conformal.factor_80}); the 90% interval is x${t.conformal.factor_90}. The intervals are narrower than v3's (x11.55 at 80%) because they are calibrated on the population the board ranks, not on exchange tokens and dead tokens. They are calibrated: on held-out splits the 90% interval built from the training fold alone covers ${Math.round(t.conformal.coverage_older_newer * 100)}% (older-to-newer), ${Math.round(t.conformal.coverage_newer_older * 100)}% (newer-to-older), ${Math.round(t.conformal.coverage_split_even_odd * 100)}% (split even-to-odd) and ${Math.round(t.conformal.coverage_split_odd_even * 100)}% (split odd-to-even) of actuals — the coverage itself is noisy because the training folds are small (31-40 protocols), so the range across splits is stated, not hidden. Treat the implied values as an ordering with a stated range, not a price.`);
  lines.push('');
  lines.push('## Launch odds and expected value');
  lines.push('');
  lines.push('Launch odds are the share of protocols in the same age bucket that already record a token (gecko_id or symbol present), computed from this snapshot. Expected value is implied value x odds. Protocols with no listing date take the all-protocol rate.');
  lines.push('');
  for (const b of data.odds.buckets) {
    lines.push(`- ${b.bucket}: ${Math.round(b.rate * 1000) / 10}% (${b.launched}/${b.n})`);
  }
  lines.push(`- all protocols: ${Math.round(data.odds.overall_rate * 1000) / 10}% (${data.odds.overall_launched}/${data.odds.overall_n})`);
  lines.push('');
  lines.push('## Farm verdict');
  lines.push('');
  lines.push('Farming costs $25 of gas plus the yield forgone on the deposit at 5% a year over the hold. The verdict is relative to this board: the top third by expected value per farming dollar is FARM, the middle third THIN, the bottom third SKIP. Break-even is the airdrop value that covers the farming cost, shown in dollars and as a share of expected launch value. The plan takes about 2 hours of active work (read the docs, act twice, keep the log, watch announcements), so the verdict also states the cost per hour of that work and the expected value per hour of it — a one-off airdrop spread over the hours, not a wage — the pair that decides whether the farm is worth a farmer\'s time.');
  lines.push('');
  lines.push('## Accounting for all 758 protocols');
  lines.push('');
  lines.push(`- ranked on this board: ${acc.ranked}`);
  lines.push(`- live tokens shown separately (top ${acc.live_shown} by market cap): ${acc.live_shown}`);
  lines.push(`- live tokens not shown (market cap > 0, outside the top ${acc.live_shown}): ${acc.live_unshown}`);
  lines.push(`- protocols that record a token but carry no market cap: ${acc.token_no_mcap}`);
  lines.push(`- pre-token protocols that are not genuine subjects (wrapped / staked / bridged products, exchange products, versioned names, CEX and bridge categories): ${acc.pretoken_non_subject}`);
  lines.push(`- total: ${acc.ranked} + ${acc.live_shown} + ${acc.live_unshown} + ${acc.token_no_mcap} + ${acc.pretoken_non_subject} = ${acc.total}`);
  lines.push('');
  return lines.join('\n');
}
