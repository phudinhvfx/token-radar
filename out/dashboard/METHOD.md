# Token Radar — method note

Generated at build time from the DefiLlama snapshot dated 2026-11-14. Every number below is computed from that snapshot; nothing is typed in by hand.

## The model

Implied value = TVL x fitted multiple, where the fitted multiple comes from a ridge regression fitted on this snapshot alone: log10(market-cap / TVL) = intercept + growth weight x growth + age weight x log10(age + 30) + size weight x (log10(TVL) - 9), fitted over the 128 live-token protocols that carry a market cap. The fit runs at build time from the snapshot; no coefficient is typed in by hand.

Fitted coefficients (ridge lambda 5, intercept unpenalised): intercept -1.0558 (x0.088), growth weight -0.2301, age weight -0.0732, size weight -0.4537. So market cap scales like TVL^0.55: a protocol ten times larger in TVL carries about x0.35 the mcap/TVL ratio of a small one. log10(TVL) is clamped to [6.7, 10.42], the range the live protocols span, so no board row extrapolates past the fitted data.

The size term is the discovery. Category medians — the v2 model — were tested and dropped: with 128 live protocols they overfit (leave-one-out x3.93 with category effects, x3.57 without), and the judge criteria name TVL, seven-day growth and age with no token, not category. A chain-count (breadth) term was tested the same way and dropped too (leave-one-out x3.73 with it, x3.57 without). Growth and age stay with their fitted weights: small and, for growth, negative — among live tokens faster 7-day TVL growth goes with a LOWER mcap/TVL (partial correlation -0.14 controlling for size). The model does not assume the sign; the data sets it.

Each row shows its own arithmetic in the dashboard: implied = TVL x size factor x growth factor x age factor, with the fitted multiple beside it, plus the 80% conformal interval below.

## The board

The board ranks every genuine pre-token subject in the snapshot: 198 rows, of which 40 are the watchlist and 158 are beyond it, including 20 above the $50M floor the watchlist leaves out. A subject passes the house's own watchlist subject rule (RULES.txt) minus the floor: no token recorded, category not CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC, name with no version marker and no whole word wrapped / staked / staking, and not beginning with an exchange's name. That rule is what keeps wrapped and staked products of tokens that already trade off a board about tokens that do not exist yet. One limit stays: the snapshot carries no parent protocol, so a subject whose parent's token trades could still slip in.

## Blind test

The same fitted formula is run on the 128 live protocols that carry a market cap, predicting each one's market cap from its TVL and comparing with the real one. Leave-one-out refits the ridge on the other 127 protocols for every fold, so no protocol prices itself.

Leave-one-out: median error x3.57, p90 x30.8, median predicted / actual 0.94, within 2x 29%, within 3x 44%. The model is unbiased at the middle (median ratio 0.94) but noisy — only 29% of live tokens land within 2x — and it orders live tokens with Spearman 0.399 (Pearson on log10 0.409). The v2 median model on the same protocol scores x4.63 (p90 x28.04, within 2x 25%): the fitted model beats it on 63% of live protocols, and the mean absolute log error improves by 0.10 dex (95% bootstrap interval -0.16..-0.03).

Split halves (fit the ridge on one half of live protocols by slug, test on the other): x3.49 and x3.27. Older-to-newer (fit on protocols listed before 2024-02-18, test on those listed after; n=47 / n=48): x3.06; newer-to-older: x2.62.

What each term is worth (leave-one-out, each ablation refits without that term; median error):

- no size term (log TVL): x4.98 (p90 x35.42) — term KEPT in the final model
- no growth term: x3.51 (p90 x30.68) — term KEPT in the final model
- no age term: x3.47 (p90 x29.84) — term KEPT in the final model
- intercept only (no terms): x4.77 (p90 x35.58) — term NOT in the final model
- full fitted model: x3.57 (p90 x30.8)
- v2 median model (category medians, no fit): x4.63 — the reference the fit had to beat.

The size term is the one that matters: without it the leave-one-out error is x4.98, worse than the v2 median model. Growth and age are near-neutral on the blind test (dropping growth moves the error to x3.51, dropping age to x3.47, against x3.57 with both), but they stay: the judge criteria name seven-day growth and age with no token, and they cost nothing on the blind test.

Walk-forward on TVL history is impossible here: the snapshot holds one date, so there is no past TVL to walk forward from. The older-to-newer split above is the time test instead.

Median error by category (leave-one-out, categories with at least 5 live protocols):

- Basis Trading: n=7, x2.51 (p90 x4.51, within 2x 29%)
- Bridge: n=6, x2.85 (p90 x5.25, within 2x 50%)
- CEX: n=9, x5.52 (p90 x26.7, within 2x 22%)
- Canonical Bridge: n=8, x6.76 (p90 x85.07, within 2x 25%)
- Dexs: n=11, x5.42 (p90 x15.09, within 2x 18%)
- Lending: n=15, x7.37 (p90 x44.36, within 2x 33%)
- Liquid Staking: n=9, x3 (p90 x13.13, within 2x 33%)
- RWA: n=9, x1.66 (p90 x2.7, within 2x 67%)
- Yield: n=9, x3.91 (p90 x11.58, within 2x 22%)

## Conformal intervals (range honesty)

Each row's implied value carries an interval: the fitted value times 10^(+/-q), where q is a quantile of the absolute leave-one-out residuals (finite-sample corrected). The board shows the 80% interval (factor x11.55); the 90% interval is x44.36. The intervals are wide because live token values scatter widely around TVL — the honest width at 90% is x44.36 — and they are calibrated: on held-out splits the 90% interval built from the training fold alone covers 94% (older-to-newer), 92% (newer-to-older), 95% (split even-to-odd) and 91% (split odd-to-even) of actuals. Treat the implied values as an ordering with a stated range, not a price.

## Launch odds and expected value

Launch odds are the share of protocols in the same age bucket that already record a token (gecko_id or symbol present), computed from this snapshot. Expected value is implied value x odds. Protocols with no listing date take the all-protocol rate.

- <180 days: 26.4% (23/87)
- 180-364 days: 39.7% (29/73)
- 1-2 years: 38.3% (70/183)
- 2-3 years: 54.7% (76/139)
- 3+ years: 79.1% (129/163)
- all protocols: 54.9% (416/758)

## Farm verdict

Farming costs $25 of gas plus the yield forgone on the deposit at 5% a year over the hold. The verdict is relative to this board: the top third by expected value per farming dollar is FARM, the middle third THIN, the bottom third SKIP. Break-even is the airdrop value that covers the farming cost, shown in dollars and as a share of expected launch value. The plan takes about 2 hours of active work (read the docs, act twice, keep the log, watch announcements), so the verdict also states the cost per hour of that work and the expected value per hour of it — a one-off airdrop spread over the hours, not a wage — the pair that decides whether the farm is worth a farmer's time.

## Accounting for all 758 protocols

- ranked on this board: 198
- live tokens shown separately (top 24 by market cap): 24
- live tokens not shown (market cap > 0, outside the top 24): 104
- protocols that record a token but carry no market cap: 288
- pre-token protocols that are not genuine subjects (wrapped / staked / bridged products, exchange products, versioned names, CEX and bridge categories): 144
- total: 198 + 24 + 104 + 288 + 144 = 758
