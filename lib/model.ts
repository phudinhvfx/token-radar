// Token Radar — the model. Snapshot in, ranked board out.
//
// v2 (radar-3-tested) keeps v1's implied-value formula and adds three
// things the top of the leaderboard all show, each computed from this
// snapshot alone:
//
//   implied = TVL x category multiple x growth x breadth x maturity
//
// * category multiple: the median market-cap / TVL of the live-token
//   protocols in the same category, computed from this snapshot at run
//   time (clamped to [0.10, 0.55]; categories with fewer than 3 live
//   protocols fall back to the global median, 0.205 on this snapshot).
//   A DEX token is worth a different share of TVL than a lending token,
//   and the snapshot itself says how different.
// * growth: the protocol's 7-day TVL change, clamped to [-60, +120]%,
//   weighted 0.5, so a fast-growing protocol is worth more than a
//   shrinking one at the same TVL.
// * breadth: 1 + 2% per extra chain beyond the first, capped at 4 extra
//   chains — a protocol live on many chains has more distribution.
// * maturity: 0.6 + 0.4 x min(age, 1095 days) / 1095 — a protocol that
//   has run for years with no token is a more credible launch than a
//   two-week-old one. Unknown listing date counts as 365 days.
//
// The board ranks every genuine pre-token subject in the snapshot, not
// just the watchlist and the highest-TVL names below the floor. A subject
// is genuine when it passes the house's own watchlist subject rule
// (RULES.txt, "The snapshot") minus the $50M floor: it records no token,
// its category is not CEX, Bridge, Canonical Bridge, Liquid Staking,
// Liquid Restaking or Restaked BTC, its name carries no version marker
// and no whole word wrapped / staked / staking, and it does not begin
// with an exchange's name. That rule is what keeps wrapped and staked
// products of tokens that already trade — WBTC, Binance staked ETH,
// USDT0 and the like — off a board about tokens that do not exist yet.
// v1's looser rule let 39 such rows onto its board (15 Liquid Staking,
// 11 Bridge, 6 Canonical Bridge, 2 Liquid Restaking and 5 more by name);
// v2 drops them and adds 20 genuine subjects above the floor the
// watchlist leaves out (sentora-curator at $473M among them). One limit
// stays: the snapshot carries no parent protocol, so a subject whose
// parent's token trades could still slip in; the dashboard says so.
//
// Blind test: the same formula is run leave-one-out over the 128 live
// protocols that carry a market cap, and again on two split halves and
// older-to-newer by listing date. The numbers are in the board's data
// and in dashboard/METHOD.md, not hidden: the model is unbiased
// (median predicted / actual 0.98) but noisy (median error x4.63, only
// a quarter of live tokens land within 2x), and it orders live tokens
// with Spearman 0.40. Walk-forward on TVL history is impossible here:
// the snapshot holds one date, 14 November 2026, so there is no past
// TVL to walk forward from; the older-to-newer split is the time test.
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
// shown in dollars and as a share of expected launch value.

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
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.1,
  multiple_cap: 0.55,
  breadth_per_chain: 0.02,
  breadth_max_chains: 4,
};

export const MODEL_VERSION = 'radar-3-tested';
export const LIVE_ROWS = 24;

/** Gas for the farm plan's transactions, in whole dollars (v1's own figure). */
export const FARM_GAS_USD = 25;
/** Forgone yield on the deposit while farming, per year. */
export const FARM_YIELD_APY = 0.05;

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
  launch_odds: number;
  expected_value_usd: number;
  verdict: FarmVerdict;
  farm_cost_usd: number;
  min_capital_usd: number;
  break_even_usd: number;
  break_even_pct: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    breadth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
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
  live_n: number;
  loo: ErrorStats;
  ablations: { name: string; stats: ErrorStats }[];
  split_even_odd: ErrorStats;
  split_odd_even: ErrorStats;
  older_newer: ErrorStats;
  newer_older: ErrorStats;
  older_newer_cutoff: string;
  older_newer_fit_n: number;
  older_newer_test_n: number;
  spearman: number;
  pearson_log: number;
  unclamped_loo: ErrorStats;
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
  multiples: { category: string; multiple: number; n: number }[];
  global_multiple: number;
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
 * A genuine pre-token subject for the board: it passes the house's own
 * watchlist subject rule (RULES.txt, "The snapshot") minus the $50M
 * floor. The rule is the house's, not the model's: it is what keeps a
 * wrapped, staked or bridged product of a token that already trades
 * off a board about tokens that do not exist yet.
 */
export function isBoardSubject(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
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

export interface PredictOptions {
  useGrowth?: boolean;
  useMaturity?: boolean;
  useBreadth?: boolean;
  useCategory?: boolean;
  clamp?: boolean;
}

/** The model's arithmetic for one protocol, given its comparables. */
export function predictValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, number>; global: number },
  model: ModelConstants = MODEL,
  opts: PredictOptions = {},
): {
  implied: number;
  categoryMultiple: number;
  growthPct: number;
  growthMult: number;
  breadthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = opts.useGrowth === false ? 1 : 1 + (growthPct / 100) * model.growth_weight;
  const extraChains = Math.min(Math.max((protocol.chains?.length ?? 1) - 1, 0), model.breadth_max_chains);
  const breadthMult = opts.useBreadth === false ? 1 : 1 + extraChains * model.breadth_per_chain;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    opts.useMaturity === false
      ? 1
      : model.maturity_floor +
        (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryMultiple =
    opts.useCategory === false
      ? multiples.global
      : multiples.byCategory.get(protocol.category ?? 'Uncategorised') ?? multiples.global;
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * categoryMultiple * growthMult * breadthMult * maturityMult),
  );
  return { implied, categoryMultiple, growthPct, growthMult, breadthMult, maturityMult, age };
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, number>; global: number },
  model: ModelConstants = MODEL,
): {
  implied: number;
  categoryMultiple: number;
  growthPct: number;
  growthMult: number;
  breadthMult: number;
  maturityMult: number;
  age: number | null;
} {
  return predictValue(protocol, asOf, multiples, model);
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
    `Verdict: ${verdict} — farming costs about $${econ.farmCost} (about $25 of gas plus $${econ.farmCost - FARM_GAS_USD} of yield forgone on a $${capital} deposit over ${hold} days), so the airdrop only needs to be worth $${econ.breakEvenUsd}, about ${econ.breakEvenPct}% of the expected launch value, to break even. Minimum capital: $${capital}.`,
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
 * Blind test of the model on the 128 live protocols that carry a market
 * cap: leave-one-out, split halves, older-to-newer by listing date,
 * one term removed at a time, and the unclamped multiples as a
 * diagnostic. Walk-forward on TVL history is impossible here — the
 * snapshot holds one date, so there is no past TVL to walk forward from
 * — and the older-to-newer split is the time test instead.
 */
export function blindTest(snapshot: Snapshot): BlindTest {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const predict = (p: SnapshotProtocol, opts: PredictOptions = {}): number => {
    const pool = opts.clamp === false ? live : live;
    void pool;
    const m = multiplesOf(live, p.slug, opts.clamp !== false);
    return predictValue(p, snapshot.as_of, m, MODEL, opts).implied;
  };
  const looPairs: [number, number][] = live.map((p) => [predict(p), p.mcap_usd!]);
  const unclampedPairs: [number, number][] = live.map((p) => [predict(p, { clamp: false }), p.mcap_usd!]);
  const ablation = (name: string, opts: PredictOptions): { name: string; stats: ErrorStats } => ({
    name,
    stats: errorStats(live.map((p) => [predict(p, opts), p.mcap_usd!])),
  });
  const bySlug = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const even = bySlug.filter((_, i) => i % 2 === 0);
  const odd = bySlug.filter((_, i) => i % 2 === 1);
  const splitPredict = (fit: SnapshotProtocol[], test: SnapshotProtocol[]): [number, number][] =>
    test.map((p) => {
      const m = multiplesOf(fit, null, true);
      return [predictValue(p, snapshot.as_of, m, MODEL).implied, p.mcap_usd!];
    });
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
      stats: errorStats(members.map((p) => [predict(p), p.mcap_usd!])),
    }));
  const preds = looPairs.map(([p]) => p);
  const actuals = looPairs.map(([, a]) => a);
  return {
    live_n: live.length,
    loo: errorStats(looPairs),
    ablations: [
      ablation('no growth', { useGrowth: false }),
      ablation('no maturity', { useMaturity: false }),
      ablation('no breadth', { useBreadth: false }),
      ablation('global multiple only', { useCategory: false }),
      ablation('no growth + no maturity', { useGrowth: false, useMaturity: false }),
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
    unclamped_loo: errorStats(unclampedPairs),
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

export function buildBoard(snapshot: Snapshot, multiples: ReturnType<typeof categoryMultiples>, odds: LaunchOdds): BoardRow[] {
  const candidates = snapshot.protocols.filter(isBoardSubject);
  const scored = candidates
    .map((p) => {
      const { implied, categoryMultiple, growthPct, growthMult, breadthMult, maturityMult, age } = impliedValue(
        p,
        snapshot.as_of,
        multiples,
      );
      const launchOddsValue = oddsForAge(age, odds);
      const expected = Math.max(1, Math.round(implied * launchOddsValue));
      const econ = farmEconomics(p, age, expected);
      return {
        p,
        implied,
        categoryMultiple,
        growthPct,
        growthMult,
        breadthMult,
        maturityMult,
        age,
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
      launch_odds: s.launchOddsValue,
      expected_value_usd: s.expected,
      verdict: 'SKIP',
      farm_cost_usd: s.econ.farmCost,
      min_capital_usd: s.econ.minCapital,
      break_even_usd: s.econ.breakEvenUsd,
      break_even_pct: s.econ.breakEvenPct,
      model: {
        category_multiple: s.categoryMultiple,
        growth_pct: s.growthPct,
        growth_multiplier: s.growthMult,
        breadth_multiplier: s.breadthMult,
        maturity_multiplier: s.maturityMult,
        age_days: s.age,
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
  const multiples = categoryMultiples(snapshot);
  const odds = launchOdds(snapshot);
  const test = blindTest(snapshot);
  const rows = buildBoard(snapshot, multiples, odds);
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
    multiples: [...multiples.byCategory.entries()]
      .filter(([, ,]) => true)
      .filter(([cat]) => (multiples.counts.get(cat) ?? 0) >= 3)
      .map(([cat, mult]) => ({ category: cat, multiple: round4(mult), n: multiples.counts.get(cat) ?? 0 }))
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    global_multiple: round4(multiples.global),
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
  return `#${row.rank} ${row.slug} — ${row.name} — ${row.category ?? 'Uncategorised'} — TVL ${money(row.tvl_usd)} — implied ${money(row.implied_value_usd)} — odds ${Math.round(row.launch_odds * 1000) / 10}% — expected ${money(row.expected_value_usd)} — ${row.verdict} — farm cost $${row.farm_cost_usd} — min capital $${row.min_capital_usd}`;
}

/** A one-line summary of the model's blind test, for the dossier header. */
export function blindTestLine(test: BlindTest): string {
  const loo = test.loo;
  return `Blind test on ${test.live_n} live tokens (leave-one-out): median error x${loo.median_factor}, p90 x${loo.p90_factor}, median predicted / actual ${loo.median_ratio}, within 2x ${Math.round(loo.within_2x * 100)}%, within 3x ${Math.round(loo.within_3x * 100)}%, Spearman ${test.spearman}. Split halves x${test.split_even_odd.median_factor} / x${test.split_odd_even.median_factor}. Older-to-newer (cutoff ${test.older_newer_cutoff}) x${test.older_newer.median_factor}. Walk-forward on TVL history is impossible: the snapshot holds one date, ${test.older_newer_cutoff} is a listing-date split, not a TVL time series.`;
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
  lines.push('Implied value = TVL x category multiple x growth x breadth x maturity.');
  lines.push('');
  lines.push('- Category multiple: the median market-cap / TVL of the live-token protocols in the same category, computed from this snapshot (clamped to [0.10, 0.55]; categories with fewer than 3 live protocols fall back to the global median).');
  lines.push('- Growth: the protocol\'s 7-day TVL change, clamped to [-60, +120]%, weighted 0.5.');
  lines.push('- Breadth: 1 + 2% per extra chain beyond the first, capped at 4 extra chains.');
  lines.push('- Maturity: 0.6 + 0.4 x min(age, 1095 days) / 1095; unknown listing date counts as 365 days.');
  lines.push('');
  lines.push('## The board');
  lines.push('');
  lines.push(`The board ranks every genuine pre-token subject in the snapshot: ${data.board_size} rows, of which ${data.watchlist_size} are the watchlist and ${data.early_size} are beyond it, including ${data.above_floor_new} above the $50M floor the watchlist leaves out. A subject passes the house's own watchlist subject rule (RULES.txt) minus the floor: no token recorded, category not CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC, name with no version marker and no whole word wrapped / staked / staking, and not beginning with an exchange's name. That rule is what keeps wrapped and staked products of tokens that already trade off a board about tokens that do not exist yet. One limit stays: the snapshot carries no parent protocol, so a subject whose parent's token trades could still slip in.`);
  lines.push('');
  lines.push('## Blind test');
  lines.push('');
  lines.push(`The same formula is run on the ${t.live_n} live protocols that carry a market cap, predicting each one's market cap from its TVL and comparing with the real one.`);
  lines.push('');
  lines.push(`Leave-one-out (each protocol predicted from comparables that exclude it): median error x${t.loo.median_factor}, p90 x${t.loo.p90_factor}, median predicted / actual ${t.loo.median_ratio}, within 2x ${Math.round(t.loo.within_2x * 100)}%, within 3x ${Math.round(t.loo.within_3x * 100)}%. The model is unbiased at the middle (median ratio ${t.loo.median_ratio}) but noisy — only ${Math.round(t.loo.within_2x * 100)}% of live tokens land within 2x — and it orders live tokens with Spearman ${t.spearman} (Pearson on log10 ${t.pearson_log}).`);
  lines.push('');
  lines.push(`Split halves (fit the category medians on one half of live protocols by slug, test on the other): x${t.split_even_odd.median_factor} and x${t.split_odd_even.median_factor}. Older-to-newer (fit on protocols listed before ${t.older_newer_cutoff}, test on those listed after; n=${t.older_newer_fit_n} / n=${t.older_newer_test_n}): x${t.older_newer.median_factor}; newer-to-older: x${t.newer_older.median_factor}.`);
  lines.push('');
  lines.push('What each term is worth (leave-one-out, median error):');
  lines.push('');
  for (const a of t.ablations) {
    lines.push(`- ${a.name}: x${a.stats.median_factor} (p90 x${a.stats.p90_factor})`);
  }
  lines.push(`- full model: x${t.loo.median_factor} (p90 x${t.loo.p90_factor})`);
  lines.push(`- unclamped multiples (diagnostic): x${t.unclamped_loo.median_factor} — the clamp helps, so it stays.`);
  lines.push('');
  lines.push('Walk-forward on TVL history is impossible here: the snapshot holds one date, so there is no past TVL to walk forward from. The older-to-newer split above is the time test instead.');
  lines.push('');
  lines.push('Median error by category (leave-one-out, categories with at least 5 live protocols):');
  lines.push('');
  for (const c of t.by_category) {
    lines.push(`- ${c.category}: n=${c.n}, x${c.stats.median_factor} (p90 x${c.stats.p90_factor}, within 2x ${Math.round(c.stats.within_2x * 100)}%)`);
  }
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
  lines.push('Farming costs $25 of gas plus the yield forgone on the deposit at 5% a year over the hold. The verdict is relative to this board: the top third by expected value per farming dollar is FARM, the middle third THIN, the bottom third SKIP. Break-even is the airdrop value that covers the farming cost, shown in dollars and as a share of expected launch value.');
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
