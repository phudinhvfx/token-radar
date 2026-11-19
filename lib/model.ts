// Token Radar — the model. Snapshot in, ranked board out.
//
// The board ranks pre-token protocols by an implied value that is computed
// from the snapshot's own figures, never from a hardcoded list of names:
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
// The watchlist (40 protocols at or above the $50M floor that record no
// token) is the floor, never the ceiling: the board carries all 40, plus
// the 160 highest-TVL pre-token protocols below the floor — the early
// radar. Live-token protocols are kept apart and shown at their market
// value, never mixed into the ranking.

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

export const MODEL_VERSION = 'radar-2-comparables';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

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
  multiples: { category: string; multiple: number; n: number }[];
  global_multiple: number;
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

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
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

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A protocol the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
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
  const byCategory = new Map<string, number[]>();
  const live: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    live.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = Math.min(
    MODEL.multiple_cap,
    Math.max(MODEL.multiple_floor, median(live)),
  );
  const out = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [cat, ratios] of byCategory) {
    counts.set(cat, ratios.length);
    out.set(
      cat,
      ratios.length >= 3
        ? Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, median(ratios)))
        : global,
    );
  }
  return { byCategory: out, counts, global };
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
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const extraChains = Math.min(Math.max((protocol.chains?.length ?? 1) - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryMultiple = multiples.byCategory.get(protocol.category ?? 'Uncategorised') ?? multiples.global;
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * categoryMultiple * growthMult * breadthMult * maturityMult),
  );
  return { implied, categoryMultiple, growthPct, growthMult, breadthMult, maturityMult, age };
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

/**
 * Farm plan: concrete steps with what they cost and how long they take.
 * The action depends only on the protocol's category and its main chain —
 * no protocol name is ever special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
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
  ];
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('snapshot is not an object');
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new SnapshotError('snapshot lacks protocols or watchlist');
  }
  return doc as unknown as Snapshot;
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: round4(s.v.categoryMultiple),
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      breadth_multiplier: round4(s.v.breadthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): {
  board: BoardRow[];
  radar: RadarData;
} {
  const multiples = categoryMultiples(snapshot);
  const board = buildBoard(snapshot, model);
  const watchlistSize = snapshot.watchlist.length;
  const earlySize = board.length - watchlistSize;
  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
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
  const multiplesTable = [...multiples.byCategory.entries()]
    .map(([category, multiple]) => ({
      category,
      multiple: round4(multiple),
      n: multiples.counts.get(category) ?? 0,
    }))
    .filter((m) => m.n >= 3)
    .sort((a, b) => b.multiple - a.multiple);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: watchlistSize,
    watchlist: snapshot.watchlist,
    board_size: board.length,
    early_size: earlySize,
    live_size: live.length,
    multiples: multiplesTable,
    global_multiple: round4(multiples.global),
    rows: board,
    live,
  };
  return { board, radar };
}

/** The dashboard's data file: window.RADAR, written beside dashboard/. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Gate-shaped validation of a board, before the program writes it out. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, need 100 to 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!slugs.has(row.slug)) return `row ${i + 1} names an unknown slug ${row.slug}`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${i + 1} has rank ${row.rank}, need ${i + 1}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has a bad implied value`;
    }
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${row.rank}`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps?.length ?? 0} farm steps, need 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (board.length >= 2 && values.size === 1) return 'every implied value is the same';
  return null;
}

export { money };
