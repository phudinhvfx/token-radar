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
  function isWatch(r) { return r.tvl_usd >= DATA.floor_usd; }

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
      var va = key === 'implied' ? a.implied_value_usd : key === 'tvl' ? a.tvl_usd
        : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d)
        : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : a.rank;
      var vb = key === 'implied' ? b.implied_value_usd : key === 'tvl' ? b.tvl_usd
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
        (isWatch(r) ? 'on the $50M watchlist' : 'early find below the $50M floor') + ' · records no token.'),
      el('h3', {}, 'Implied value: ' + fmtUsd(r.implied_value_usd)),
      el('div', { 'class': 'math' },
        el('div', {}, 'implied = TVL × category multiple × growth × breadth × maturity'),
        el('table', {}, el('tbody', {},
          el('tr', {}, el('td', {}, 'TVL'), el('td', { 'class': 'num' }, fmtUsd(r.tvl_usd))),
          el('tr', {}, el('td', {}, 'Category multiple (' + (r.category || 'Uncategorised') + ', median mcap/TVL of live tokens in this category)'), el('td', { 'class': 'num' }, '× ' + m.category_multiple.toFixed(2))),
          el('tr', {}, el('td', {}, 'Growth (' + fmtPct(m.growth_pct) + ' in 7 days, clamped −60% to +120%)'), el('td', { 'class': 'num' }, '× ' + m.growth_multiplier.toFixed(2))),
          el('tr', {}, el('td', {}, 'Breadth (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')'), el('td', { 'class': 'num' }, '× ' + m.breadth_multiplier.toFixed(2))),
          el('tr', {}, el('td', {}, 'Maturity (' + fmtAge(m.age_days) + ' with no token)'), el('td', { 'class': 'num' }, '× ' + m.maturity_multiplier.toFixed(2))),
          el('tr', {}, el('td', {}, 'Implied value'), el('td', { 'class': 'num' }, fmtUsd(r.implied_value_usd)))))),
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
        '. Implied values come from the snapshot\u2019s own figures — TVL, 7-day growth, age with no token — priced against live tokens in the same category.'),
      el('div', { 'class': 'stats' },
        el('div', { 'class': 'stat' }, el('b', {}, String(DATA.board_size)), el('span', {}, 'protocols ranked')),
        el('div', { 'class': 'stat' }, el('b', {}, String(DATA.watchlist_size)), el('span', {}, 'on the $50M watchlist')),
        el('div', { 'class': 'stat' }, el('b', {}, String(DATA.early_size)), el('span', {}, 'early finds below floor')),
        el('div', { 'class': 'stat' }, el('b', {}, fmtUsd(DATA.rows[0].implied_value_usd)), el('span', {}, '#1 implied value')),
        el('div', { 'class': 'stat' }, el('b', {}, DATA.as_of), el('span', {}, 'snapshot date'))));
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
        el('p', {}, 'implied = TVL × category multiple × growth × breadth × maturity. ' +
          'The category multiple is the median market-cap / TVL of the live-token protocols in the same category, computed from this snapshot at run time and clamped to 0.10–0.55. ' +
          'Growth is the 7-day TVL change clamped to −60%…+120% and weighted 0.5. Breadth adds 2% per extra chain (max 4). ' +
          'Maturity is 0.6 + 0.4 × min(age, 3 years) / 3 years; an unknown listing date counts as 1 year. No protocol name is ever special-cased.'),
        el('h3', {}, 'Category multiples from this snapshot'),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', { 'class': 'num' }, 'Multiple'), el('th', { 'class': 'num' }, 'Live protocols'))),
          el('tbody', {}, DATA.multiples.map(function (m) {
            return el('tr', {}, el('td', {}, m.category), el('td', { 'class': 'num' }, '× ' + m.multiple.toFixed(2)), el('td', { 'class': 'num' }, String(m.n)));
          }))),
        el('p', { 'class': 'note' }, 'Global median multiple: × ' + DATA.global_multiple.toFixed(2) +
          '. Categories with fewer than 3 live protocols use it. Source: ' + DATA.source + '.'));
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
        [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7-day growth'], ['age', 'Sort: age'], ['rank', 'Sort: rank']].map(function (s) {
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
        el('th', { 'class': 'num' }, 'Age'), el('th', { 'class': 'num' }, 'Implied value'))),
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
          el('td', { 'class': 'num' }, el('b', {}, fmtUsd(r.implied_value_usd))));
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
