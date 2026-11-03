/**
 * The address report as one page somebody can sort, filter and search.
 *
 * Self-contained on purpose: the data is inside the file, the script and the
 * styles are inline, and nothing is fetched — not a font, not a library. The
 * page is a list of somebody's addresses and what is on them, so opening it
 * must not tell any server that it was opened. The one way out is the
 * explorer link on each transaction, which is a link and only followed when
 * somebody clicks it.
 *
 * What it shows by default is what a key rescue needs: the addresses with a
 * reason, what is still on the possibly compromised ones, and only the
 * transfers that went somewhere other than a safe address. NFTs are hidden
 * until asked for — on a list like this they are mostly airdropped noise.
 *
 * The rendering runs in the browser off the embedded report, so every toggle
 * is instant and the file needs nothing but itself.
 */

import type { Report } from './address-report.js';

/**
 * JSON safe to drop inside a `<script>` element: `</script>` in a label (or
 * `<!--`) would otherwise end it early, and a label is text somebody typed.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderHtml(report: Report): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Address report</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Address report</h1>
  <p id="when"></p>
</header>
<div class="controls" role="toolbar">
  <input id="search" type="search" placeholder="Search address or label" aria-label="Search">
  <div class="seg" role="group" aria-label="Which keys">
    <button data-status="all" aria-pressed="true">All</button>
    <button data-status="compromised" aria-pressed="false">Possibly compromised</button>
    <button data-status="safe" aria-pressed="false">Safe</button>
  </div>
  <label><input id="flagged" type="checkbox"> Only with flags</label>
  <label>Token <select id="token"></select></label>
  <label><input id="nfts" type="checkbox"> Show NFTs</label>
</div>
<main>
  <section id="cards" class="cards"></section>

  <section>
    <h2>Needs attention <span class="count" id="attention-count"></span></h2>
    <div id="attention"></div>
  </section>

  <section id="risk-section">
    <h2>Still on possibly compromised addresses</h2>
    <p class="note">Unlocked STX and tokens can be moved by anyone holding the key today; locked STX from the cycle it unlocks in.</p>
    <div class="scroll"><table id="risk"></table></div>
  </section>

  <section>
    <h2>Transfers <span class="count" id="transfer-count"></span></h2>
    <div class="subcontrols">
      <label><input id="hide-safe" type="checkbox" checked> Hide moves to safe addresses</label>
      <label><input id="incoming" type="checkbox"> Show incoming</label>
      <label><input id="window" type="checkbox" checked> Only <span id="days"></span></label>
      <label><input id="group" type="checkbox" checked> One row per transaction</label>
    </div>
    <div class="scroll"><table id="transfers"></table></div>
  </section>

  <section>
    <h2>Every address</h2>
    <div class="scroll"><table id="addresses"></table></div>
  </section>

  <section>
    <h2>What they hold</h2>
    <div class="scroll"><table id="assets"></table></div>
  </section>
</main>
<script type="application/json" id="report">${embedJson(report)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const STYLE = `
:root {
  --bg: #fbfaf8; --surface: #ffffff; --text: #1d1c1a; --muted: #6b6862;
  --border: #e4e1db; --accent: #2f5bd3;
  --bad: #b42318; --bad-bg: #fde8e6; --warn: #8a5300; --warn-bg: #fdf0d9;
  --ok: #1d6b3a; --ok-bg: #e2f3e8; --info-bg: #e8edfb; --chip-bg: #efede9;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161514; --surface: #1f1e1c; --text: #ecebe8; --muted: #a29f98;
    --border: #34322f; --accent: #8aa8ff;
    --bad: #ff8a80; --bad-bg: #3d1c19; --warn: #f2bd6b; --warn-bg: #3a2c14;
    --ok: #7fd49a; --ok-bg: #173323; --info-bg: #1e2741; --chip-bg: #2a2926;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #161514; --surface: #1f1e1c; --text: #ecebe8; --muted: #a29f98;
  --border: #34322f; --accent: #8aa8ff;
  --bad: #ff8a80; --bad-bg: #3d1c19; --warn: #f2bd6b; --warn-bg: #3a2c14;
  --ok: #7fd49a; --ok-bg: #173323; --info-bg: #1e2741; --chip-bg: #2a2926;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header, main { max-width: 1280px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 20px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 28px 0 8px; }
#when, .note { color: var(--muted); margin: 0 0 8px; }
.count { color: var(--muted); font-weight: normal; }
.controls { position: sticky; top: 0; z-index: 2; background: var(--bg);
  border-bottom: 1px solid var(--border); padding: 10px 16px;
  display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center;
  max-width: 1280px; margin: 0 auto; }
.subcontrols { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 8px; }
input[type=search], select { font: inherit; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
input[type=search] { min-width: 220px; flex: 1 1 220px; max-width: 360px; }
label { display: inline-flex; gap: 6px; align-items: center; color: var(--text); }
.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.seg button { font: inherit; border: 0; background: var(--surface); color: var(--text);
  padding: 5px 10px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--border); }
.seg button[aria-pressed=true] { background: var(--accent); color: var(--surface); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px; margin-top: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.card .k { color: var(--muted); font-size: 12px; }
.card .v { font-size: 18px; font-variant-numeric: tabular-nums; margin-top: 2px; }
.card.bad .v { color: var(--bad); }
.scroll { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; vertical-align: top; }
th { font-weight: 600; font-size: 12px; color: var(--muted); cursor: pointer; user-select: none; position: relative; }
th[aria-sort=ascending]::after { content: " ▲"; }
th[aria-sort=descending]::after { content: " ▼"; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.total td { font-weight: 600; border-bottom: 0; }
tbody tr:hover { background: var(--chip-bg); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.muted { color: var(--muted); }
.pill { display: inline-block; border-radius: 999px; padding: 0 8px; font-size: 12px; line-height: 20px;
  background: var(--chip-bg); color: var(--text); margin: 1px 2px 1px 0; }
.pill.bad { background: var(--bad-bg); color: var(--bad); }
.pill.warn { background: var(--warn-bg); color: var(--warn); }
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.info { background: var(--info-bg); color: var(--accent); }
.attention { background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px; margin-bottom: 8px; }
.attention .who { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; margin-bottom: 6px; }
.attention ul { margin: 0; padding: 0; list-style: none; }
.attention li { display: grid; grid-template-columns: 90px 1fr; gap: 8px; padding: 2px 0; }
.attention li .d { overflow-wrap: anywhere; }
details summary { cursor: pointer; }
details div { white-space: nowrap; }
a { color: var(--accent); }
.empty { color: var(--muted); padding: 12px; }
@media (max-width: 640px) { .attention li { grid-template-columns: 1fr; gap: 0; } }
`;

/*
 * Plain browser JavaScript, written as a string so the page needs no build.
 * Amounts arrive as decimal strings and are divided with BigInt, never with
 * floating point: these are somebody's balances, and 0.1 + 0.2 is not a
 * figure to show them.
 */
const SCRIPT = String.raw`
(() => {
  const report = JSON.parse(document.getElementById('report').textContent);
  const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token';
  const meta = new Map(report.tokenMeta.map((m) => [m.asset, m]));
  const labels = new Map(report.addresses.map((a) => [a.address, a.label]));
  const statusOf = new Map(report.addresses.map((a) => [a.address, a.status]));
  const safe = new Set(report.safe || []);
  const marked = report.safe !== null;

  const state = { search: '', status: 'all', flagged: false, token: '', nfts: false,
    hideSafe: true, incoming: false, window: true, group: true };

  // ---- formatting -------------------------------------------------------
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  };
  const units = (value, decimals) => {
    if (value === null || value === undefined) return '?';
    let v = BigInt(value);
    const neg = v < 0n; if (neg) v = -v;
    const base = 10n ** BigInt(decimals);
    const whole = (v / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const frac = decimals ? (v % base).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
    return (neg ? '-' : '') + whole + (frac ? '.' + frac : '');
  };
  const stx = (v) => units(v, 6);
  const short = (p) => {
    const [a, c] = p.split('.');
    const s = a.length > 20 ? a.slice(0, 8) + '…' + a.slice(-5) : a;
    return c ? s + '.' + c : s;
  };
  const assetName = (asset) => asset.split('::')[1] || asset;
  const tokenAmount = (asset, amount, kind) => {
    if (kind === 'stx' || asset === 'STX') return stx(amount) + ' STX';
    if (kind === 'nft') return assetName(asset);
    const m = meta.get(asset);
    return m && m.known ? units(amount, m.decimals) + ' ' + m.symbol : amount + ' ' + assetName(asset) + ' (base units)';
  };
  const date = (s) => new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const statusPill = (status) => status === 'safe' ? el('span', { class: 'pill ok', text: 'safe' })
    : status === 'compromised' ? el('span', { class: 'pill bad', text: 'possibly compromised' })
    : status === 'outside' ? el('span', { class: 'pill warn', text: 'not on the list' })
    : el('span', { class: 'pill', text: 'on the list' });
  const tagClass = (tag) => ({ outflow: 'bad', pending: 'bad', 'woke up': 'warn', signed: 'warn',
    unread: '', ending: 'info', idle: 'info', 'not staking': 'info', 'not pox-5': 'info', token: 'info' }[tag] ?? '');
  const party = (p) => {
    if (!p) return el('span', { class: 'muted', text: '—' });
    const label = labels.get(p);
    const status = labels.has(p) ? (statusOf.get(p) === 'unmarked' ? 'listed' : statusOf.get(p)) : 'outside';
    return el('span', { title: p },
      label ? el('span', {}, label, ' ') : null,
      el('span', { class: 'mono' }, label ? short(p) : p), ' ',
      status === 'listed' ? null : statusPill(status));
  };

  // ---- filters -----------------------------------------------------------
  const matches = (a) => {
    if (state.status !== 'all' && a.status !== state.status) return false;
    if (state.flagged && a.attention.length === 0) return false;
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    return a.address.toLowerCase().includes(q) || (a.label || '').toLowerCase().includes(q);
  };
  const visible = () => report.addresses.filter(matches);

  // ---- sortable tables ---------------------------------------------------
  const sorts = new Map();
  function table(id, columns, rows, totals) {
    const node = document.getElementById(id);
    const sort = sorts.get(id);
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col && col.value) {
        rows = [...rows].sort((a, b) => {
          const x = col.value(a), y = col.value(b);
          const r = x === y ? 0 : x === null ? 1 : y === null ? -1 : x > y ? 1 : -1;
          return sort.dir === 'ascending' ? r : -r;
        });
      }
    }
    node.replaceChildren(
      el('thead', {}, el('tr', {}, columns.map((c) => {
        const th = el('th', { class: c.num ? 'num' : null, 'aria-sort': sort && sort.key === c.key ? sort.dir : null, text: c.title });
        if (c.value) th.addEventListener('click', () => {
          const dir = sort && sort.key === c.key && sort.dir === 'descending' ? 'ascending' : 'descending';
          sorts.set(id, { key: c.key, dir });
          render();
        });
        return th;
      }))),
      el('tbody', {},
        rows.length ? rows.map((r) => el('tr', {}, columns.map((c) => el('td', { class: c.num ? 'num' : null }, c.cell(r)))))
          : el('tr', {}, el('td', { class: 'empty', colspan: String(columns.length), text: 'Nothing matches.' })),
        totals ? el('tr', { class: 'total' }, columns.map((c) => el('td', { class: c.num ? 'num' : null }, totals(c) ?? ''))) : null));
  }
  const big = (v) => (v === null || v === undefined ? null : BigInt(v));
  const sum = (rows, f) => rows.reduce((t, r) => t + (big(f(r)) ?? 0n), 0n);

  // ---- sections ------------------------------------------------------------
  function renderCards() {
    const cards = [];
    const card = (k, v, bad) => el('div', { class: 'card' + (bad ? ' bad' : '') }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }));
    const flagged = report.addresses.filter((a) => a.attention.length).length;
    cards.push(card('Addresses needing attention', flagged + ' of ' + report.addresses.length, false));
    if (marked) {
      const risk = report.atRisk;
      const sbtcDec = (meta.get(SBTC) || { decimals: 8 }).decimals;
      cards.push(card('Unlocked STX at risk', stx(sum(risk, (r) => r.unlocked)), sum(risk, (r) => r.unlocked) > 0n));
      cards.push(card('Locked STX at risk', stx(sum(risk, (r) => r.locked)), sum(risk, (r) => r.locked) > 0n));
      cards.push(card('sBTC at risk', units(sum(risk, (r) => r.sbtc), sbtcDec), sum(risk, (r) => r.sbtc) > 0n));
      const outs = new Set(allTransfers().filter((t) => t.out && !safe.has(t.recipient) && inWindow(t) && statusOf.get(t.sender) === 'compromised').map((t) => t.txId));
      cards.push(card('Transactions sending outside the safe set, ' + report.window.label, String(outs.size), outs.size > 0));
    }
    document.getElementById('cards').replaceChildren(...cards);
  }

  function renderAttention() {
    const rows = visible().filter((a) => a.attention.length);
    document.getElementById('attention-count').textContent = '— ' + rows.length;
    document.getElementById('attention').replaceChildren(...(rows.length ? rows.map((a) => el('div', { class: 'attention' },
      el('div', { class: 'who' }, el('strong', {}, a.label || 'unlabelled'), el('span', { class: 'mono', text: a.address }), statusPill(a.status === 'unmarked' ? 'listed' : a.status)),
      el('ul', {}, a.attention.map((r) => el('li', {}, el('span', {}, el('span', { class: 'pill ' + tagClass(r.tag), text: r.tag })), el('span', { class: 'd', text: r.detail })))))) : [el('p', { class: 'empty', text: 'Nothing needs attention.' })]));
  }

  function renderRisk() {
    document.getElementById('risk-section').hidden = !marked;
    if (!marked) return;
    const shown = new Set(visible().map((a) => a.address));
    const rows = report.atRisk.filter((r) => shown.has(r.address));
    const sbtcDec = (meta.get(SBTC) || { decimals: 8 }).decimals;
    const cols = [
      { key: 'label', title: 'Label', value: (r) => r.label || '', cell: (r) => r.label || '—' },
      { key: 'address', title: 'Address', value: (r) => r.address, cell: (r) => el('span', { class: 'mono', title: r.address, text: short(r.address) }) },
      { key: 'unlocked', title: 'Unlocked STX', num: true, value: (r) => big(r.unlocked), cell: (r) => stx(r.unlocked) },
      { key: 'locked', title: 'Locked STX', num: true, value: (r) => big(r.locked), cell: (r) => stx(r.locked) },
      { key: 'unlocks', title: 'Unlocks', num: true, value: (r) => r.unlocksAt, cell: (r) => r.unlocksAt !== null ? 'c' + r.unlocksAt : big(r.locked) > 0n ? 'pox-4' : '—' },
      { key: 'sbtc', title: 'sBTC', num: true, value: (r) => big(r.sbtc), cell: (r) => units(r.sbtc, sbtcDec) },
      { key: 'other', title: 'Other tokens', value: (r) => Object.keys(r.tokens).length, cell: (r) => Object.entries(r.tokens).map(([a, v]) => tokenAmount(a, v, 'ft')).join(', ') || '—' },
      ...(state.nfts ? [{ key: 'nfts', title: 'NFTs', num: true, value: (r) => r.nfts, cell: (r) => String(r.nfts) }] : []),
    ];
    table('risk', cols, rows, (c) => c.key === 'label' ? 'Total' : c.key === 'unlocked' ? stx(sum(rows, (r) => r.unlocked))
      : c.key === 'locked' ? stx(sum(rows, (r) => r.locked)) : c.key === 'sbtc' ? units(sum(rows, (r) => r.sbtc), sbtcDec) : '');
  }

  let transfersCache = null;
  function allTransfers() {
    if (transfersCache) return transfersCache;
    const seen = new Set();
    const out = [];
    for (const a of report.addresses) {
      const act = a.activity;
      if (!act) continue;
      for (const [pending, list] of [[false, act.confirmed || []], [true, act.pending || []]]) {
        for (const tx of list) {
          for (const t of tx.transfers) {
            const key = [tx.txId, t.kind, t.asset, t.amount, t.item, t.sender, t.recipient].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ ...t, txId: tx.txId, time: tx.time, signer: tx.sender, status: pending ? 'pending' : tx.status,
              call: tx.call, out: labels.has(t.sender) });
          }
        }
      }
    }
    out.sort((x, y) => y.time - x.time);
    return (transfersCache = out);
  }
  const inWindow = (t) => t.time >= report.window.since;

  /*
   * A pool paying its stakers is one transaction sending to hundreds of
   * addresses, and as hundreds of rows it buries the one transfer that
   * matters. Grouped, it is one row per transaction, sender and asset: the
   * amounts added up, and the recipients folded away under a count.
   */
  function grouped(transfers) {
    const groups = new Map();
    for (const t of transfers) {
      const key = [t.txId, t.sender, t.kind, t.asset].join('|');
      const g = groups.get(key);
      if (!g) { groups.set(key, { ...t, recipients: [t] }); continue; }
      g.recipients.push(t);
      if (t.kind !== 'nft') g.amount = (BigInt(g.amount) + BigInt(t.amount)).toString();
    }
    return [...groups.values()];
  }
  const recipientsCell = (t) => {
    if (!t.recipients || t.recipients.length === 1) return party(t.recipient);
    const outside = t.recipients.filter((r) => !labels.has(r.recipient)).length;
    return el('details', {},
      el('summary', {}, t.recipients.length + ' recipients' + (outside ? ', ' + outside + ' not on the list' : '')),
      el('div', {}, t.recipients.map((r) => el('div', {}, tokenAmount(r.asset, r.amount, r.kind) + (r.item ? ' ' + r.item : '') + ' → ', party(r.recipient)))));
  };

  function renderTransfers() {
    const shown = new Set(visible().map((a) => a.address));
    const filtered = allTransfers().filter((t) => {
      if (!state.nfts && t.kind === 'nft') return false;
      if (state.window && !inWindow(t)) return false;
      if (!t.out && !state.incoming) return false;
      if (state.hideSafe && t.out && safe.has(t.recipient)) return false;
      return shown.has(t.sender) || shown.has(t.recipient);
    });
    const rows = state.group ? grouped(filtered) : filtered;
    document.getElementById('transfer-count').textContent = '— ' + rows.length +
      (state.group && rows.length !== filtered.length ? ' (' + filtered.length + ' transfers)' : '');
    table('transfers', [
      { key: 'time', title: 'When', value: (t) => t.time, cell: (t) => el('span', {}, date(t.time), t.status !== 'success' ? el('span', { class: 'pill ' + (t.status === 'pending' ? 'bad' : ''), text: t.status }) : null) },
      { key: 'from', title: 'From', value: (t) => labels.get(t.sender) || t.sender, cell: (t) => party(t.sender) },
      { key: 'amount', title: 'Amount', num: true, value: (t) => t.kind === 'stx' ? big(t.amount) : null,
        cell: (t) => t.kind === 'nft' && t.recipients && t.recipients.length > 1 ? t.recipients.length + ' × ' + assetName(t.asset) : tokenAmount(t.asset, t.amount, t.kind) + (t.item && !(t.recipients && t.recipients.length > 1) ? ' ' + t.item : '') },
      { key: 'to', title: 'To', value: (t) => t.recipients && t.recipients.length > 1 ? t.recipients.length : labels.get(t.recipient) || t.recipient, cell: recipientsCell },
      { key: 'via', title: 'Via', value: (t) => t.call || '', cell: (t) => t.call ? el('span', { class: 'mono', title: t.call, text: short(t.call) }) : el('span', { class: 'muted', text: 'transfer' }) },
      { key: 'tx', title: 'Transaction', cell: (t) => el('a', { class: 'mono', href: 'https://explorer.hiro.so/txid/' + t.txId + '?chain=mainnet', target: '_blank', rel: 'noopener noreferrer', text: t.txId.slice(0, 10) + '…' }) },
    ], rows);
  }

  function renderAddresses() {
    const rows = visible();
    const tok = state.token ? meta.get(state.token) : null;
    const tokenOf = (a) => {
      if (!state.token) return null;
      if (a.stxTotal === null) return null;
      if (tok && tok.nft) return String(a.nfts[state.token] || 0);
      return a.fungible[state.token] || '0';
    };
    const sbtcDec = (meta.get(SBTC) || { decimals: 8 }).decimals;
    const nftCount = (a) => Object.values(a.nfts).reduce((x, y) => x + y, 0);
    const cols = [
      ...(marked ? [{ key: 'status', title: 'Key', value: (a) => a.status, cell: (a) => statusPill(a.status) }] : []),
      { key: 'label', title: 'Label', value: (a) => a.label || '', cell: (a) => a.label || '—' },
      { key: 'address', title: 'Address', value: (a) => a.address, cell: (a) => el('span', { class: 'mono', title: a.address, text: short(a.address) }) },
      { key: 'total', title: 'STX total', num: true, value: (a) => big(a.stxTotal), cell: (a) => a.stxTotal === null ? 'not known' : stx(a.stxTotal) },
      { key: 'unlocked', title: 'Unlocked', num: true, value: (a) => big(a.stxAvailable), cell: (a) => stx(a.stxAvailable) },
      { key: 'staked', title: 'Staked', num: true, value: (a) => a.staking ? big(a.staking.ustx) : null, cell: (a) => a.staking ? stx(a.staking.ustx) : '—' },
      { key: 'with', title: 'With', value: (a) => a.staking ? a.staking.pool || a.staking.signer : '', cell: (a) => a.staking ? a.staking.pool || short(a.staking.signer) : '—' },
      { key: 'ends', title: 'Ends', num: true, value: (a) => a.staking ? a.staking.unlockCycle : null, cell: (a) => a.staking ? 'c' + a.staking.unlockCycle : '—' },
      ...(state.token && state.token !== SBTC ? [{ key: 'token', title: tok ? tok.symbol : assetName(state.token), num: true, value: (a) => big(tokenOf(a)),
        cell: (a) => { const v = tokenOf(a); return v === null ? '?' : tok && tok.nft ? v : tok && tok.known ? units(v, tok.decimals) : v; } }] : []),
      { key: 'sbtc', title: 'sBTC', num: true, value: (a) => big(a.sbtc), cell: (a) => units(a.sbtc, sbtcDec) },
      ...(state.nfts ? [{ key: 'nfts', title: 'NFTs', num: true, value: nftCount, cell: (a) => String(nftCount(a)) }] : []),
      { key: 'flags', title: 'Flags', value: (a) => a.attention.length, cell: (a) => [...new Set(a.attention.map((r) => r.tag))].map((t) => el('span', { class: 'pill ' + tagClass(t), text: t })) },
    ];
    table('addresses', cols, rows, (c) => {
      if (c.key === 'label') return 'Total (' + rows.length + ')';
      if (c.key === 'total') return stx(sum(rows, (a) => a.stxTotal));
      if (c.key === 'unlocked') return stx(sum(rows, (a) => a.stxAvailable));
      if (c.key === 'staked') return stx(sum(rows, (a) => a.staking && a.staking.ustx));
      if (c.key === 'sbtc') return units(sum(rows, (a) => a.sbtc), sbtcDec);
      if (c.key === 'token') { const t = sum(rows, tokenOf); return tok && !tok.nft && tok.known ? units(t, tok.decimals) : t.toString(); }
      if (c.key === 'nfts') return String(rows.reduce((t, a) => t + nftCount(a), 0));
      return '';
    });
  }

  function renderAssets() {
    const rows = report.held.assets.filter((a) => state.nfts || a.kind === 'ft');
    table('assets', [
      { key: 'symbol', title: 'Token', value: (a) => a.symbol, cell: (a) => a.symbol + (a.metadata ? '' : ' *') },
      { key: 'asset', title: 'Asset', value: (a) => a.asset, cell: (a) => el('span', { class: 'mono', title: a.asset, text: short(a.asset) }) },
      { key: 'holders', title: 'Held by', num: true, value: (a) => a.holders, cell: (a) => String(a.holders) },
      { key: 'total', title: 'Total', num: true, value: (a) => big(a.total), cell: (a) => a.kind === 'nft' ? a.total : units(a.total, a.decimals) },
    ], [{ symbol: 'STX', asset: 'the chain itself', holders: report.held.stx.holders, total: report.held.stx.total, decimals: 6, metadata: true, kind: 'ft' }, ...rows]);
  }

  function render() {
    renderCards();
    renderAttention();
    renderRisk();
    renderTransfers();
    renderAddresses();
    renderAssets();
  }

  // ---- controls ------------------------------------------------------------
  const when = report.captured
    ? 'Captured ' + report.captured.at + ' from ' + report.captured.node + ' — every figure is as it was then.'
    : 'Read ' + date(report.now) + ' UTC.';
  document.getElementById('when').textContent = when + ' Reward cycle ' + report.cycle + '. ' +
    (marked ? report.safe.length + ' safe address(es); the rest may be compromised.' : 'No safe section in the list.');
  document.getElementById('days').textContent = report.window.label;

  const select = document.getElementById('token');
  const fillTokens = () => {
    const current = state.token;
    const options = report.held.assets.filter((a) => a.asset !== SBTC && (state.nfts || a.kind === 'ft'));
    select.replaceChildren(el('option', { value: '', text: '—' }), ...options.map((a) =>
      el('option', { value: a.asset, text: a.symbol + ' (' + a.holders + ')' })));
    state.token = options.some((a) => a.asset === current) ? current : '';
    select.value = state.token;
  };
  select.addEventListener('change', () => { state.token = select.value; render(); });
  document.getElementById('search').addEventListener('input', (e) => { state.search = e.target.value.trim(); render(); });
  document.getElementById('flagged').addEventListener('change', (e) => { state.flagged = e.target.checked; render(); });
  document.getElementById('nfts').addEventListener('change', (e) => { state.nfts = e.target.checked; fillTokens(); render(); });
  document.getElementById('hide-safe').addEventListener('change', (e) => { state.hideSafe = e.target.checked; render(); });
  document.getElementById('incoming').addEventListener('change', (e) => { state.incoming = e.target.checked; render(); });
  document.getElementById('window').addEventListener('change', (e) => { state.window = e.target.checked; render(); });
  document.getElementById('group').addEventListener('change', (e) => { state.group = e.target.checked; render(); });
  for (const b of document.querySelectorAll('.seg button')) {
    if (!marked && b.dataset.status !== 'all') b.hidden = true;
    b.addEventListener('click', () => {
      state.status = b.dataset.status;
      for (const o of document.querySelectorAll('.seg button')) o.setAttribute('aria-pressed', String(o === b));
      render();
    });
  }
  fillTokens();
  render();
})();
`;
