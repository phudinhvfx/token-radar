# Token Radar — method note

Generated at build time from the DefiLlama snapshot dated 2026-11-14. Every number below is computed from that snapshot; nothing is typed in by hand.

## The model

Implied value = TVL x category multiple x growth x breadth x maturity.

- Category multiple: the median market-cap / TVL of the live-token protocols in the same category, computed from this snapshot (clamped to [0.10, 0.55]; categories with fewer than 3 live protocols fall back to the global median).
- Growth: the protocol's 7-day TVL change, clamped to [-60, +120]%, weighted 0.5.
- Breadth: 1 + 2% per extra chain beyond the first, capped at 4 extra chains.
- Maturity: 0.6 + 0.4 x min(age, 1095 days) / 1095; unknown listing date counts as 365 days.

## The board

The board ranks every genuine pre-token subject in the snapshot: 198 rows, of which 40 are the watchlist and 158 are beyond it, including 20 above the $50M floor the watchlist leaves out. A subject passes the house's own watchlist subject rule (RULES.txt) minus the floor: no token recorded, category not CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC, name with no version marker and no whole word wrapped / staked / staking, and not beginning with an exchange's name. That rule is what keeps wrapped and staked products of tokens that already trade off a board about tokens that do not exist yet. One limit stays: the snapshot carries no parent protocol, so a subject whose parent's token trades could still slip in.

## Blind test

The same formula is run on the 128 live protocols that carry a market cap, predicting each one's market cap from its TVL and comparing with the real one.

Leave-one-out (each protocol predicted from comparables that exclude it): median error x4.63, p90 x28.04, median predicted / actual 0.98, within 2x 25%, within 3x 35%. The model is unbiased at the middle (median ratio 0.98) but noisy — only 25% of live tokens land within 2x — and it orders live tokens with Spearman 0.403 (Pearson on log10 0.412).

Split halves (fit the category medians on one half of live protocols by slug, test on the other): x4.49 and x4.1. Older-to-newer (fit on protocols listed before 2024-02-18, test on those listed after; n=47 / n=48): x5.51; newer-to-older: x5.17.

What each term is worth (leave-one-out, median error):

- no growth: x4.72 (p90 x28.12)
- no maturity: x4.63 (p90 x39.7)
- no breadth: x4.54 (p90 x25.96)
- global multiple only: x5.21 (p90 x31.13)
- no growth + no maturity: x4.53 (p90 x37.76)
- full model: x4.63 (p90 x28.04)
- unclamped multiples (diagnostic): x5.66 — the clamp helps, so it stays.

Walk-forward on TVL history is impossible here: the snapshot holds one date, so there is no past TVL to walk forward from. The older-to-newer split above is the time test instead.

Median error by category (leave-one-out, categories with at least 5 live protocols):

- Basis Trading: n=7, x2.69 (p90 x9.34, within 2x 43%)
- Bridge: n=6, x11.43 (p90 x13.76, within 2x 0%)
- CEX: n=9, x3.65 (p90 x17, within 2x 44%)
- Canonical Bridge: n=8, x4.44 (p90 x58.34, within 2x 38%)
- Dexs: n=11, x5.89 (p90 x14.14, within 2x 18%)
- Lending: n=15, x3.63 (p90 x13.06, within 2x 27%)
- Liquid Staking: n=9, x2.87 (p90 x22.29, within 2x 0%)
- RWA: n=9, x2.55 (p90 x5.6, within 2x 33%)
- Yield: n=9, x4.72 (p90 x7.27, within 2x 33%)

## Launch odds and expected value

Launch odds are the share of protocols in the same age bucket that already record a token (gecko_id or symbol present), computed from this snapshot. Expected value is implied value x odds. Protocols with no listing date take the all-protocol rate.

- <180 days: 26.4% (23/87)
- 180-364 days: 39.7% (29/73)
- 1-2 years: 38.3% (70/183)
- 2-3 years: 54.7% (76/139)
- 3+ years: 79.1% (129/163)
- all protocols: 54.9% (416/758)

## Farm verdict

Farming costs $25 of gas plus the yield forgone on the deposit at 5% a year over the hold. The verdict is relative to this board: the top third by expected value per farming dollar is FARM, the middle third THIN, the bottom third SKIP. Break-even is the airdrop value that covers the farming cost, shown in dollars and as a share of expected launch value.

## Accounting for all 758 protocols

- ranked on this board: 198
- live tokens shown separately (top 24 by market cap): 24
- live tokens not shown (market cap > 0, outside the top 24): 104
- protocols that record a token but carry no market cap: 288
- pre-token protocols that are not genuine subjects (wrapped / staked / bridged products, exchange products, versioned names, CEX and bridge categories): 144
- total: 198 + 24 + 104 + 288 + 144 = 758
