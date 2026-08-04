import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { globSync } from 'node:fs';

/*
 * The parts of the app that only exist in a browser.
 *
 * Everything else here is unit-tested, but a service worker cannot be: whether
 * it registers, whether it takes control on the next visit, and what the app
 * does with the network cut are facts about a browser, not about a function.
 * Same for the wallet picker, which is a web component that has to be told a
 * WalletConnect project id before it will offer that route at all.
 *
 * Not part of `pnpm test` — it needs a build, a server and a browser. Run it
 * by hand before shipping something that touches the shell or the data layer:
 *
 *   pnpm build && pnpm preview &   # then, in another shell
 *   pnpm check:pwa
 *
 * Set CHROME_PATH to point it at a browser if it cannot find one.
 */

const ORIGIN = process.env.PWA_ORIGIN ?? 'http://localhost:4173';
const PORT = 9222;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    ...globSync(
      `${homedir()}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome`,
    )
      .sort()
      .reverse(),
  ];
  return candidates.find((path) => existsSync(path));
}

const CHROME = findChrome();
if (!CHROME) {
  console.error('No browser found. Set CHROME_PATH to one.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=/tmp/pwa-check-profile-${process.pid}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function debuggerUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${PORT}/json/list`)
      ).json();
      const page = targets.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('devtools never came up');
}

const ws = new WebSocket(await debuggerUrl());
await new Promise((resolve) => (ws.onopen = resolve));

let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.result?.exceptionDetails) {
    return `THREW: ${res.result.exceptionDetails.text}`;
  }
  return res.result?.result?.value;
}

async function navigate(url) {
  await send('Page.navigate', { url });
  await sleep(2500);
}

/**
 * Text of the picker alone, reached through its shadow roots.
 *
 * Deliberately not the whole page. Reading the page and looking for a wallet's
 * name in it gives false positives that are very hard to see: the app's own
 * "Your wallet" and "Connect wallet" sit next to each other, and concatenating
 * the text of every node spells `walletConnect`.
 */
const PICKER_TEXT = `
  const modal = document.querySelector('connect-modal');
  if (!modal) return 'no picker';
  const walk = (root, out) => {
    out.push(root.textContent ?? '');
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot, out);
    }
    return out;
  };
  return walk(modal.shadowRoot ?? modal, []).join(' ');
`;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const results = [];
const check = (name, pass, detail = '') =>
  results.push({
    name,
    pass: pass === true,
    detail: String(detail).slice(0, 110),
  });

// ---- first visit, online -------------------------------------------------
await navigate(`${ORIGIN}/`);

check(
  'manifest is linked and parses',
  await evaluate(`
    const href = document.querySelector('link[rel=manifest]')?.href;
    if (!href) return false;
    const m = await (await fetch(href)).json();
    return m.name === 'Bitcoin Staking' && m.icons.length > 0;
  `),
);

const swState = await evaluate(`
  const reg = await navigator.serviceWorker.ready;
  return reg.active ? reg.active.state : 'no active worker';
`);
check('service worker activates', swState === 'activated', swState);

check(
  'the pool list rendered',
  await evaluate(`return document.body.innerText.includes('signer contracts')`),
);

const updateLine = await evaluate(`
  const m = document.body.innerText.match(/Last update:[^\\n]*/);
  return m ? m[0] : 'not found';
`);
check(
  'online, it does not claim to be a saved copy',
  (await evaluate(
    `return document.body.innerText.includes('last copy saved on your device')`,
  )) === false,
  updateLine,
);

// ---- the wallet picker ---------------------------------------------------
// WalletConnect is switched off (see WALLETCONNECT.md), so the check below is
// the other way round from what it used to be: the picker must still open and
// list the injected wallets, and must *not* offer a route that ends in an
// error after the user has already approved.
const picker = await evaluate(`
  const stake = [...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === 'Stake with wallet');
  if (!stake) return 'no stake button';
  stake.click();
  await new Promise((r) => setTimeout(r, 400));
  const connect = [...document.querySelectorAll('button')]
    .find((b) => /Connect wallet|Use another account/.test(b.textContent));
  if (!connect) return 'no connect button';
  connect.click();
  await new Promise((r) => setTimeout(r, 6000));
  ${PICKER_TEXT}
`);
check(
  'the wallet picker opens, listing the injected wallets',
  typeof picker === 'string' && /Leather/.test(picker) && /Xverse/.test(picker),
  typeof picker === 'string' ? picker.slice(0, 110) : picker,
);
check(
  'WalletConnect is not offered',
  typeof picker === 'string' && !/WalletConnect/i.test(picker),
);

// ---- second visit: the worker should now be in control -------------------
await navigate(`${ORIGIN}/`);
check(
  'worker controls the page on the next visit',
  await evaluate(`return navigator.serviceWorker.controller !== null`),
);

// ---- offline -------------------------------------------------------------
await send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});
await navigate(`${ORIGIN}/`);

check(
  'the app still renders with the network cut',
  await evaluate(`return document.body.innerText.includes('signer contracts')`),
);
check(
  'the amounts are still there, from the saved copy',
  await evaluate(
    `return /[\\d,.]+ (million )?STX/.test(document.body.innerText)`,
  ),
);
check(
  'offline, it says it is showing a saved copy',
  await evaluate(
    `return document.body.innerText.includes('last copy saved on your device')`,
  ),
);
check(
  'the chain is never answered from a cache',
  await evaluate(`
    try {
      await fetch('https://api.hiro.so/v2/pox');
      return false;               // something answered — wrong
    } catch { return true; }      // refused, as it must be
  `),
);

// ---- report --------------------------------------------------------------
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(
    `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`,
  );
}
console.log(`\n${results.length - failed}/${results.length} passed`);

ws.close();
chrome.kill();
process.exit(failed ? 1 : 0);
