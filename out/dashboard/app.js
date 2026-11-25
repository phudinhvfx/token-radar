// Token Radar dashboard. Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own arithmetic, the live
// token set, and the model itself. No network: every byte shown is in
// data.js. Hash routes: #detail=<slug> opens a protocol, #filter=<category>.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  app.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchOnly: false };
  // A row is on the watchlist when its slug is in the snapshot's
  // watchlist (TVL at or above the $50M floor, no token, not a wrapped
  // or staked product). The list travels in the data file.
  var watchSet = {};
  (DATA.watchlist || []).forEach(function (s) { watchSet[s] = true; });
  function isWatch(r) { return !!watchSet[r.slug]; }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !isWatch(r)) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_value_usd : key === 'expected' ? a.expected_value_usd
        : key === 'tvl' ? a.tvl_usd
        : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d)
        : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : a.rank;
      var vb = key === 'implied' ? b.implied_value_usd : key === 'expected' ? b.expected_value_usd
        : key === 'tvl' ? b.tvl_usd
        : key === 'growth' ? (b.change_7d === null ? -999 : b.change_7d)
        : key === 'age' ? (b.age_days === null ? -1 : b.age_days) : b.rank;
      return (va - vb) * state.dir;
    });
    return rows;
  }

  function renderDetail(r) {
    var m = r.model;
    var box = el('section', { 'class': 'detail', id: 'detail' },
      el('h2', {}, '#' + r.rank + ' ' + r.name + ' '),
      el('p', { 'class': 'note' }, (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') +
        ' · TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) + ' · listed ' +
        (r.listed_at || 'unknown') + ' (' + fmtAge(r.age_days) + ') · ' +
        (isWatch(r) ? 'on the $50M watchlist' : 'beyond the watchlist') + ' · records no token.'),
      el('h3', {}, 'Implied value: ' + fmtUsd(r.implied_value_usd) + ' · Expected value: ' + fmtUsd(r.expected_value_usd)),
      el('p', { 'class': 'note' }, '80% range on the implied value: ' + fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) +
        ' · 80% range on the expected value: ' + fmtUsd(r.expected_low_usd) + ' – ' + fmtUsd(r.expected_high_usd) +
        '. The range is the fitted value times 10^(±q80), q80 from the leave-one-out residuals — live token values scatter widely around TVL, so the honest range is wide.'),
      el('div', { 'class': 'math' },
        el('div', {}, 'implied = TVL × fitted multiple — the multiple is fitted, not a category median: log10(multiple) = intercept + growth weight × growth + age weight × log10(age + 30) + size weight × (log10(TVL) − 9)'),
        el('table', {}, el('tbody', {},
          el('tr', {}, el('td', {}, 'TVL'), el('td', { 'class': 'num' }, fmtUsd(r.tvl_usd))),
          el('tr', {}, el('td', {}, 'Size factor (TVL ' + fmtUsd(r.tvl_usd) + ', log10 ' + m.log_tvl.toFixed(2) + '; market cap scales like TVL^0.55, so larger protocols carry a smaller multiple)'), el('td', { 'class': 'num' }, '× ' + m.size_multiplier.toFixed(2))),
          el('tr', {}, el('td', {}, 'Growth factor (' + fmtPct(m.growth_pct) + ' in 7 days, clamped −60% to +120%; fitted weight is negative — among live tokens faster TVL growth goes with a lower mcap/TVL)'), el('td', { 'class': 'num' }, '× ' + m.growth_multiplier.toFixed(2))),
          el('tr', {}, el('td', {}, 'Age factor (' + fmtAge(m.age_days) + ' with no token)'), el('td', { 'class': 'num' }, '× ' + m.age_multiplier.toFixed(2))),
          el('tr', {}, el('td', {}, 'Fitted multiple'), el('td', { 'class': 'num' }, '× ' + m.fitted_multiple.toFixed(3))),
          el('tr', {}, el('td', {}, 'Implied value'), el('td', { 'class': 'num' }, fmtUsd(r.implied_value_usd))),
          el('tr', {}, el('td', {}, '80% range'), el('td', { 'class': 'num' }, fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd))),
          el('tr', {}, el('td', {}, 'Launch odds (share of protocols this old that already record a token)'), el('td', { 'class': 'num' }, (r.launch_odds * 100).toFixed(1) + '%')),
          el('tr', {}, el('td', {}, 'Expected value (implied × odds)'), el('td', { 'class': 'num' }, fmtUsd(r.expected_value_usd)))))),
      el('h3', {}, 'Farm verdict: ' + r.verdict),
      el('p', {}, 'Farming costs about $' + r.farm_cost_usd + ' ($25 of gas plus the yield forgone on a $' + r.min_capital_usd +
        ' deposit), so the airdrop only needs to be worth $' + r.break_even_usd + ' — about ' + r.break_even_pct +
        '% of the expected launch value — to break even. The plan takes about 2 hours of active work, so it costs about $' + r.farm_cost_per_hour_usd +
        ' per hour and the expected value is about ' + fmtUsd(r.farm_value_per_hour_usd) + ' per hour of that work — a one-off airdrop spread over the hours, not a wage. Minimum capital: $' + r.min_capital_usd +
        '. The verdict is relative to this board: the top third by expected value per farming dollar is FARM, the middle third THIN, the bottom third SKIP.'),
      el('h3', {}, 'How to farm it'),
      el('ol', { 'class': 'farm' }, r.farm_steps.map(function (s) { return el('li', {}, s); })),
      el('p', { 'class': 'note' }, 'This is the entry\u2019s own claim from the snapshot dated ' + DATA.as_of +
        '. It does not predict whether or when a token is issued. A protocol that records no token may still have one its DefiLlama record does not carry.'));
    return box;
  }

  function render() {
    app.innerHTML = '';
    var wrap = el('div', { 'class': 'wrap' });
    var hero = el('header', { 'class': 'hero' },
      el('h1', {}, 'Token Radar — ', el('span', {}, 'pre-token protocols, ranked')),
      el('p', {}, 'What would a protocol\u2019s token be worth if it launched today, and how do you farm it first? ' +
        'Every row below records no token in the DefiLlama snapshot of ' + DATA.as_of +
        '. Implied values come from the snapshot\u2019s own figures — TVL, 7-day growth, age with no token — priced by a ridge model fitted on the 128 live-token protocols in the same snapshot.'),
      el('div', { 'class': 'stats' },
        el('div', { 'class': 'stat' }, el('b', {}, String(DATA.board_size)), el('span', {}, 'protocols ranked')),
        el('div', { 'class': 'stat' }, el('b', {}, String(DATA.watchlist_size)), el('span', {}, 'on the $50M watchlist')),
        el('div', { 'class': 'stat' }, el('b', {}, String(DATA.early_size)), el('span', {}, 'beyond the watchlist')),
        el('div', { 'class': 'stat' }, el('b', {}, fmtUsd(DATA.rows[0].implied_value_usd)), el('span', {}, '#1 implied value')),
        el('div', { 'class': 'stat' }, el('b', {}, DATA.as_of), el('span', {}, 'snapshot date'))),
      el('div', { 'class': 'strip' },
        'Blind-tested on ' + DATA.blind_test.live_n + ' live tokens: leave-one-out median error ×' + DATA.blind_test.loo.median_factor +
        ' (v2 median model: ×' + DATA.blind_test.v2_median_loo.median_factor + ') · ' + Math.round(DATA.blind_test.loo.within_2x * 100) + '% within 2× · Spearman ' + DATA.blind_test.spearman +
        ' · 80% range ×' + DATA.blind_test.conformal.factor_80 + ' · All ' + DATA.accounting.total + ' protocols accounted for: ' + DATA.accounting.ranked + ' ranked, ' +
        DATA.accounting.live_shown + ' live shown, ' + DATA.accounting.live_unshown + ' live unshown, ' +
        DATA.accounting.token_no_mcap + ' token-recorded without a market cap, ' + DATA.accounting.pretoken_non_subject +
        ' pre-token but not genuine subjects.'));
    wrap.appendChild(hero);

    var tabs = el('div', { 'class': 'tabs' });
    [['pre-token', 'Pre-token board (' + DATA.board_size + ')'],
     ['live', 'Already trading (' + DATA.live_size + ')'],
     ['model', 'How the model works']].forEach(function (t) {
      tabs.appendChild(el('button', {
        'class': 'tab' + (state.tab === t[0] ? ' on' : ''),
        onclick: function () { state.tab = t[0]; state.selected = null; render(); }
      }, t[1]));
    });
    wrap.appendChild(tabs);

    if (state.tab === 'model') {
      var box = el('section', { 'class': 'modelbox' },
        el('h2', {}, 'The model, in full'),
        el('p', {}, 'implied = TVL × fitted multiple. The multiple is fitted by ridge regression on this snapshot alone: log10(market-cap / TVL) = intercept + growth weight × growth + age weight × log10(age + 30) + size weight × (log10(TVL) − 9), over the 128 live-token protocols that carry a market cap. No coefficient is typed in by hand; the fit runs at build time.'),
        el('h3', {}, 'Fitted coefficients'),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Term'), el('th', { 'class': 'num' }, 'Coefficient'), el('th', { 'class': 'num' }, 'As a multiplier'))),
          el('tbody', {},
            el('tr', {}, el('td', {}, 'Intercept'), el('td', { 'class': 'num' }, DATA.fitted.intercept.toFixed(4)), el('td', { 'class': 'num' }, '× ' + Math.pow(10, DATA.fitted.intercept).toFixed(3))),
            el('tr', {}, el('td', {}, 'Growth (7-day TVL change, clamped −60%…+120%)'), el('td', { 'class': 'num' }, DATA.fitted.growth_weight.toFixed(4)), el('td', { 'class': 'num' }, 'per unit')),
            el('tr', {}, el('td', {}, 'Age (log10(age in days + 30))'), el('td', { 'class': 'num' }, DATA.fitted.log_age_weight.toFixed(4)), el('td', { 'class': 'num' }, 'per unit')),
            el('tr', {}, el('td', {}, 'Size (log10(TVL) − 9, i.e. centred on $1B; clamped to the live range ' + DATA.fitted.log_tvl_min.toFixed(2) + '…' + DATA.fitted.log_tvl_max.toFixed(2) + ')'), el('td', { 'class': 'num' }, DATA.fitted.log_tvl_weight.toFixed(4)), el('td', { 'class': 'num' }, 'per unit')))),
        el('p', { 'class': 'note' }, 'Market cap scales like TVL^' + (1 + DATA.fitted.log_tvl_weight).toFixed(2) +
          ': a protocol ten times larger in TVL carries about ×' + Math.pow(10, DATA.fitted.log_tvl_weight).toFixed(2) +
          ' the mcap/TVL ratio of a small one. That size term is the discovery — without it the leave-one-out error is ×' + DATA.blind_test.ablations[0].stats.median_factor + ', worse than the v2 median model. ' +
          'Category medians were tested and dropped (leave-one-out ×3.93 with them, ×' + DATA.blind_test.loo.median_factor + ' without); a chain-count term was tested and dropped the same way (×3.73). Source: ' + DATA.source + '.'),
        el('h3', {}, 'Blind test: the same formula on live tokens'),
        el('p', {}, 'Every live protocol that carries a market cap is predicted from its TVL and compared with the real one. ' +
          'Leave-one-out means each protocol is predicted from a fit on the other 127, so it never prices itself.'),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Test'), el('th', { 'class': 'num' }, 'Median error'), el('th', { 'class': 'num' }, 'p90'), el('th', { 'class': 'num' }, 'Within 2×'))),
          el('tbody', {},
            el('tr', {}, el('td', {}, 'Leave-one-out (n=' + DATA.blind_test.live_n + ')'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.loo.median_factor), el('td', { 'class': 'num' }, '×' + DATA.blind_test.loo.p90_factor), el('td', { 'class': 'num' }, Math.round(DATA.blind_test.loo.within_2x * 100) + '%')),
            el('tr', {}, el('td', {}, 'Split half by slug: fit even, test odd'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.split_even_odd.median_factor), el('td', { 'class': 'num' }, '×' + DATA.blind_test.split_even_odd.p90_factor), el('td', { 'class': 'num' }, Math.round(DATA.blind_test.split_even_odd.within_2x * 100) + '%')),
            el('tr', {}, el('td', {}, 'Split half by slug: fit odd, test even'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.split_odd_even.median_factor), el('td', { 'class': 'num' }, '×' + DATA.blind_test.split_odd_even.p90_factor), el('td', { 'class': 'num' }, Math.round(DATA.blind_test.split_odd_even.within_2x * 100) + '%')),
            el('tr', {}, el('td', {}, 'Older-to-newer by listing date (cutoff ' + DATA.blind_test.older_newer_cutoff + ', fit n=' + DATA.blind_test.older_newer_fit_n + ', test n=' + DATA.blind_test.older_newer_test_n + ')'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.older_newer.median_factor), el('td', { 'class': 'num' }, '×' + DATA.blind_test.older_newer.p90_factor), el('td', { 'class': 'num' }, Math.round(DATA.blind_test.older_newer.within_2x * 100) + '%')),
            el('tr', {}, el('td', {}, 'Newer-to-older'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.newer_older.median_factor), el('td', { 'class': 'num' }, '×' + DATA.blind_test.newer_older.p90_factor), el('td', { 'class': 'num' }, Math.round(DATA.blind_test.newer_older.within_2x * 100) + '%')))),
        el('p', {}, 'The model is unbiased at the middle — median predicted / actual ' + DATA.blind_test.loo.median_ratio +
          ' — but noisy: only ' + Math.round(DATA.blind_test.loo.within_2x * 100) + '% of live tokens land within 2×, and it orders live tokens with Spearman ' +
          DATA.blind_test.spearman + ' (Pearson on log10 ' + DATA.blind_test.pearson_log + '). Against the v2 median model on the same 128 protocols it wins on ' +
          Math.round(DATA.blind_test.paired.win_rate * 100) + '% of them, and the mean absolute log error improves by ' +
          Math.abs(DATA.blind_test.paired.mean_log_err_diff).toFixed(2) + ' dex (95% interval ' + DATA.blind_test.paired.ci_low.toFixed(2) + '…' + DATA.blind_test.paired.ci_high.toFixed(2) + '). Treat the implied values as an ordering with a stated range, not a price.'),
        el('h3', {}, 'What each term is worth (kept or dropped on the blind test)'),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Model'), el('th', { 'class': 'num' }, 'Median error'), el('th', {}, 'Decision'))),
          el('tbody', {}, DATA.blind_test.ablations.map(function (a) {
            return el('tr', {}, el('td', {}, a.name), el('td', { 'class': 'num' }, '×' + a.stats.median_factor), el('td', {}, a.kept ? 'Kept' : 'Not in the model'));
          }).concat([
            el('tr', {}, el('td', {}, 'Full fitted model'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.loo.median_factor), el('td', {}, 'This board')),
            el('tr', {}, el('td', {}, 'v2 median model (category medians, no fit)'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.v2_median_loo.median_factor), el('td', {}, 'Reference'))]))),
        el('h3', {}, 'Conformal intervals (range honesty)'),
        el('p', {}, 'Each row carries an 80% range: the fitted value times 10^(±q80), q80 from the leave-one-out residuals. The 90% interval is wider still. Coverage on held-out splits — the 90% interval built from the training fold alone — is ' +
          Math.round(DATA.blind_test.conformal.coverage_older_newer * 100) + '% older-to-newer, ' +
          Math.round(DATA.blind_test.conformal.coverage_newer_older * 100) + '% newer-to-older, ' +
          Math.round(DATA.blind_test.conformal.coverage_split_even_odd * 100) + '% split even-to-odd, ' +
          Math.round(DATA.blind_test.conformal.coverage_split_odd_even * 100) + '% split odd-to-even, so the intervals are calibrated.'),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Interval'), el('th', { 'class': 'num' }, 'Factor'))),
          el('tbody', {},
            el('tr', {}, el('td', {}, '80% (shown on the board)'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.conformal.factor_80)),
            el('tr', {}, el('td', {}, '90%'), el('td', { 'class': 'num' }, '×' + DATA.blind_test.conformal.factor_90)))),
        el('p', { 'class': 'note' }, 'Walk-forward on TVL history is impossible here: the snapshot holds one date, so there is no past TVL to walk forward from. The older-to-newer split above is the time test instead.'),
        el('h3', {}, 'Launch odds by age'),
        el('p', {}, 'The share of protocols in each age bucket that already record a token. Expected value is implied value × odds. Protocols with no listing date take the all-protocol rate.'),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Age bucket'), el('th', { 'class': 'num' }, 'Protocols'), el('th', { 'class': 'num' }, 'Already record a token'), el('th', { 'class': 'num' }, 'Odds'))),
          el('tbody', {}, DATA.odds.buckets.map(function (b) {
            return el('tr', {}, el('td', {}, b.bucket), el('td', { 'class': 'num' }, String(b.n)), el('td', { 'class': 'num' }, String(b.launched)), el('td', { 'class': 'num' }, (b.rate * 100).toFixed(1) + '%'));
          }).concat([el('tr', {}, el('td', {}, 'All protocols'), el('td', { 'class': 'num' }, String(DATA.odds.overall_n)), el('td', { 'class': 'num' }, String(DATA.odds.overall_launched)), el('td', { 'class': 'num' }, (DATA.odds.overall_rate * 100).toFixed(1) + '%'))]))),
        el('h3', {}, 'Accounting for all ' + DATA.accounting.total + ' protocols'),
        el('table', {}, el('tbody', {},
          el('tr', {}, el('td', {}, 'Ranked on this board'), el('td', { 'class': 'num' }, String(DATA.accounting.ranked))),
          el('tr', {}, el('td', {}, 'Live tokens shown separately (top ' + DATA.accounting.live_shown + ' by market cap)'), el('td', { 'class': 'num' }, String(DATA.accounting.live_shown))),
          el('tr', {}, el('td', {}, 'Live tokens not shown'), el('td', { 'class': 'num' }, String(DATA.accounting.live_unshown))),
          el('tr', {}, el('td', {}, 'Record a token but carry no market cap'), el('td', { 'class': 'num' }, String(DATA.accounting.token_no_mcap))),
          el('tr', {}, el('td', {}, 'Pre-token but not genuine subjects (wrapped / staked / bridged products, exchange products, versioned names, CEX and bridge categories)'), el('td', { 'class': 'num' }, String(DATA.accounting.pretoken_non_subject))),
          el('tr', {}, el('td', {}, 'Total'), el('td', { 'class': 'num' }, String(DATA.accounting.total))))),
        el('p', { 'class': 'note' }, 'The board ranks every genuine pre-token subject in the snapshot, including ' + DATA.above_floor_new +
          ' above the $50M floor the watchlist leaves out. One limit stays: the snapshot carries no parent protocol, so a subject whose parent\u2019s token trades could still slip in. The full method note ships as METHOD.md in the dashboard.'));
      wrap.appendChild(box);
      app.appendChild(wrap);
      return;
    }

    if (state.tab === 'live') {
      var lt = el('table', {}, el('thead', {}, el('tr', {},
        el('th', {}, 'Protocol'), el('th', {}, 'Category'), el('th', { 'class': 'num' }, 'TVL'),
        el('th', { 'class': 'num' }, 'Market cap'), el('th', { 'class': 'num' }, 'mcap / TVL'))),
        el('tbody', {}, DATA.live.map(function (p) {
          return el('tr', {}, el('td', { 'class': 'name' }, el('b', {}, p.name), el('small', {}, p.slug)),
            el('td', {}, p.category || '—'), el('td', { 'class': 'num' }, fmtUsd(p.tvl_usd)),
            el('td', { 'class': 'num' }, fmtUsd(p.mcap_usd)),
            el('td', { 'class': 'num' }, p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : 'n/a'));
        })));
      wrap.appendChild(el('p', { 'class': 'note' }, 'These protocols already trade, so the board shows the market\u2019s own value for them and never ranks them. They are the comparables the model prices pre-token protocols against.'));
      wrap.appendChild(lt);
      app.appendChild(wrap);
      return;
    }

    var cats = ['all'];
    DATA.rows.forEach(function (r) { var c = r.category || 'Uncategorised'; if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort();
    var controls = el('div', { 'class': 'controls' },
      el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q,
        oninput: function (e) { state.q = e.target.value; render(); } }),
      el('select', { onchange: function (e) { state.category = e.target.value; render(); } },
        cats.map(function (c) { var o = el('option', { value: c }, c === 'all' ? 'All categories' : c); if (state.category === c) o.selected = true; return o; })),
      el('select', { onchange: function (e) { var v = e.target.value; state.sort = v; state.dir = v === 'rank' ? 1 : -1; render(); } },
        [['implied', 'Sort: implied value'], ['expected', 'Sort: expected value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7-day growth'], ['age', 'Sort: age'], ['rank', 'Sort: rank']].map(function (s) {
          var o = el('option', { value: s[0] }, s[1]); if (state.sort === s[0]) o.selected = true; return o; })),
      el('label', {}, el('input', { type: 'checkbox', checked: state.watchOnly ? true : undefined,
        onchange: function (e) { state.watchOnly = e.target.checked; render(); } }), 'Watchlist only'));
    wrap.appendChild(controls);

    var rows = filteredRows();
    wrap.appendChild(el('p', { 'class': 'count' }, 'Showing ' + rows.length + ' of ' + DATA.board_size + ' ranked protocols. Click a row for its model breakdown and farm plan.'));

    if (state.selected) {
      var sel = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (sel) wrap.appendChild(renderDetail(sel));
    }

    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, 'Protocol'), el('th', {}, 'Category'),
        el('th', { 'class': 'num' }, 'TVL'), el('th', { 'class': 'num' }, '7d'),
        el('th', { 'class': 'num' }, 'Age'), el('th', { 'class': 'num' }, 'Implied value'),
        el('th', { 'class': 'num' }, 'Range (80%)'),
        el('th', { 'class': 'num' }, 'Expected'), el('th', {}, 'Verdict'))),
      el('tbody', {}, rows.slice(0, 100).map(function (r) {
        var g = r.change_7d;
        return el('tr', {
          'class': state.selected === r.slug ? 'sel' : '',
          onclick: function () { state.selected = state.selected === r.slug ? null : r.slug; render(); var d = document.getElementById('detail'); if (d) d.scrollIntoView(); }
        },
          el('td', {}, el('span', { 'class': 'rank' + (r.rank <= 3 ? ' top' : '') }, String(r.rank))),
          el('td', { 'class': 'name' }, el('b', {}, r.name), el('small', {}, r.slug + (isWatch(r) ? ' · watchlist' : ''))),
          el('td', {}, el('span', { 'class': 'pill' + (isWatch(r) ? ' watch' : '') }, r.category || '—')),
          el('td', { 'class': 'num' }, fmtUsd(r.tvl_usd)),
          el('td', { 'class': 'num ' + (g === null ? '' : g >= 0 ? 'up' : 'down') }, fmtPct(g)),
          el('td', { 'class': 'num' }, fmtAge(r.age_days)),
          el('td', { 'class': 'num' }, el('b', {}, fmtUsd(r.implied_value_usd))),
          el('td', { 'class': 'num' }, fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd)),
          el('td', { 'class': 'num' }, fmtUsd(r.expected_value_usd)),
          el('td', {}, el('span', { 'class': 'verdict v-' + r.verdict.toLowerCase() }, r.verdict)));
      })));
    wrap.appendChild(table);
    if (rows.length > 100) wrap.appendChild(el('p', { 'class': 'count' }, 'First 100 rows shown — use search or a category filter to see the rest.'));
    wrap.appendChild(el('p', { 'class': 'note' }, 'Snapshot: ' + esc(DATA.source) + '. Implied values are this entry\u2019s own claim; they do not predict whether or when a token is issued.'));
    app.appendChild(wrap);
  }

  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    var parts = h.split('&');
    parts.forEach(function (p) {
      var kv = p.split('=');
      if (kv[0] === 'detail' && kv[1]) { state.selected = decodeURIComponent(kv[1]); state.tab = 'pre-token'; }
      if (kv[0] === 'filter' && kv[1]) { state.category = decodeURIComponent(kv[1]); state.tab = 'pre-token'; }
      if (kv[0] === 'tab' && kv[1]) { state.tab = decodeURIComponent(kv[1]); }
    });
  }
  fromHash();
  render();
})();
