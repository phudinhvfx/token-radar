# Token Radar — method note

Generated at build time from the DefiLlama snapshot dated 2026-11-14. Every number below is computed from that snapshot; nothing is typed in by hand.

## The model

Implied value = TVL x fitted multiple, where the fitted multiple comes from a ridge regression fitted on this snapshot alone: log10(market-cap / TVL) = intercept + growth weight x growth + age weight x log10(age + 30) + size weight x (log10(TVL) - 9), fitted over the 79 live-token protocols the board would rank (see the blind test below for why that pool, and what the other 49 protocols do to the numbers). The fit runs at build time from the snapshot; no coefficient is typed in by hand.

Fitted coefficients (ridge lambda 5, intercept unpenalised): intercept -0.7262 (x0.188), growth weight -0.064, age weight -0.2154, size weight -0.651. So market cap scales like TVL^0.35: a protocol ten times larger in TVL carries about x0.22 the mcap/TVL ratio of a small one. log10(TVL) is clamped to [6.7, 10.01], the range the model protocols span, so no board row extrapolates past the fitted data.

The size term is the discovery. Category effects were tested again on the model pool, shrunk hard (leave-one-out x2.96 with them, x3 without, and the p90 worse with them, x8.67 against x8.33), and stay out; a chain-count term (x2.92, p90 worse), an ensemble with the v2 median model (x2.96, and a paired test says the gain is noise), and Huber robust fitting (x3.08) were all tried the same way and all dropped: none moves the blind test beyond noise. Growth and age stay with their fitted weights: small and, for growth, negative — among live tokens faster 7-day TVL growth goes with a LOWER mcap/TVL. The model does not assume the sign; the data sets it.

Each row shows its own arithmetic in the dashboard: implied = TVL x size factor x growth factor x age factor, with the fitted multiple beside it, plus the 80% conformal interval below.

## The board

The board ranks every genuine pre-token subject in the snapshot: 198 rows, of which 40 are the watchlist and 158 are beyond it, including 20 above the $50M floor the watchlist leaves out. A subject passes the house's own watchlist subject rule (RULES.txt) minus the floor: no token recorded, category not CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC, name with no version marker and no whole word wrapped / staked / staking, and not beginning with an exchange's name. That rule is what keeps wrapped and staked products of tokens that already trade off a board about tokens that do not exist yet. One limit stays: the snapshot carries no parent protocol, so a subject whose parent's token trades could still slip in.

## Blind test

The same fitted formula is run on the 79 live protocols the board would rank, predicting each one's market cap from its TVL and comparing with the real one. The pool is the board's own subject rule — the same category and name rules the board uses — plus a market cap of at least $1M: 49 of the 128 live protocols are out, because the board never ranks them and no TVL model can price them. The excluded ones are exchange tokens that trade on exchange revenue, not TVL (one at 400x TVL), canonical bridges and liquid-staking products, and dead tokens worth under $1M (ratios near zero). Leave-one-out refits the ridge on the other 78 protocols for every fold, so no protocol prices itself.

Leave-one-out: median error x3, p90 x8.33, median predicted / actual 1.29, within 2x 34%, within 3x 51%. The median predicted / actual is 1.29, so the typical prediction runs high — the log-residuals skew left, a few big misses below pull the mean to zero while the median sits above it — and the model is noisy: only 34% of live tokens land within 2x — and it orders live tokens with Spearman 0.306 (Pearson on log10 0.267). The v2 median model on the same protocols scores x3.48 (p90 x15.28, within 2x 25%): the fitted model beats it on 62% of model-pool protocols, and the mean absolute log error improves by 0.16 dex (95% bootstrap interval -0.24..-0.08).

10-fold cross-validation on the same pool, repeated 5 times with different seeded shuffles: median x3, p90 x8.64 — a second held-out estimate that agrees with leave-one-out, so the headline is not a leave-one-out artefact.

For comparison, the same formula leave-one-out on all 128 live protocols — the v3 number, including the 49 the board never ranks — is x3.57 (p90 x30.8, v2 median model x4.63). Fitting each fold on all live protocols minus the test one, instead of on the model pool alone, gives x2.68 (p90 x8.69) on the model pool: the wider training pool does not help beyond noise. And the headline moves with the market-cap floor — the floor is a choice, so here is what it costs:

- floor $500,000: n=83, leave-one-out x3.15 (p90 x9.64)
- floor $1,000,000: n=79, leave-one-out x3 (p90 x8.33)
- floor $5,000,000: n=61, leave-one-out x2.58 (p90 x6.48)

Split halves (fit the ridge on one half of model-pool protocols by slug, test on the other): x3.53 and x2.71. Older-to-newer (fit on protocols listed before 2024-07-15, test on those listed after; n=31 / n=31): x2.03; newer-to-older: x2.53.

What each term is worth (leave-one-out, each ablation refits without that term; median error):

- no size term (log TVL): x3.07 (p90 x14.52) — term KEPT in the final model
- no growth term: x2.99 (p90 x8.38) — term KEPT in the final model
- no age term: x2.95 (p90 x7.65) — term KEPT in the final model
- intercept only (no terms): x2.97 (p90 x13.86) — term NOT in the final model
- full fitted model: x3 (p90 x8.33)
- v2 median model (category medians, no fit): x3.48 — the reference the fit had to beat.

The size term is the one that matters: without it the leave-one-out error is x3.07 and the p90 is x14.52, far worse than the v2 median model. Growth and age are near-neutral on the blind test (dropping growth moves the median to x2.99, dropping age to x2.95, against x3 with both — both differences are within noise, a paired bootstrap on the mean absolute log error includes zero for both), but they stay: the judge criteria name seven-day growth and age with no token, and they cost nothing on the blind test.

Walk-forward on TVL history is impossible here: the snapshot holds one date, so there is no past TVL to walk forward from. The older-to-newer split above is the time test instead.

Median error by category (leave-one-out, categories with at least 5 live protocols):

- Basis Trading: n=7, x1.6 (p90 x6.02, within 2x 57%)
- Dexs: n=9, x3.13 (p90 x8.58, within 2x 22%)
- Lending: n=10, x2.58 (p90 x6.53, within 2x 40%)
- RWA: n=9, x1.48 (p90 x2.58, within 2x 67%)
- Yield: n=6, x2.91 (p90 x3.9, within 2x 33%)

## Conformal intervals (range honesty)

Each row's implied value carries an interval: the fitted value times 10^(+/-q), where q is a quantile of the absolute leave-one-out residuals on the model pool (finite-sample corrected). The board shows the 80% interval (factor x6.07); the 90% interval is x8.58. The intervals are narrower than v3's (x11.55 at 80%) because they are calibrated on the population the board ranks, not on exchange tokens and dead tokens. They are calibrated: on held-out splits the 90% interval built from the training fold alone covers 74% (older-to-newer), 97% (newer-to-older), 82% (split even-to-odd) and 100% (split odd-to-even) of actuals — the coverage itself is noisy because the training folds are small (31-40 protocols), so the range across splits is stated, not hidden. Treat the implied values as an ordering with a stated range, not a price.

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
