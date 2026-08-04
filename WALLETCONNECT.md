# WalletConnect: why connecting fails, and what we are waiting for

Status as of **4 August 2026**. Open question is with **Xverse and Leather** — see
[What we need from the wallets](#what-we-need-from-the-wallets).

**WalletConnect is switched off in the meantime.** The project id in
`src/lib/wallet-connect.ts` is commented out, and the picker now lists the injected
wallets only — Leather, Xverse, Asigna, Fordefi — so nobody meets a route that fails
after they have already approved. Uncommenting the one line, or setting
`VITE_WALLETCONNECT_PROJECT_ID`, puts it back.

Taking it away needed **two** changes, which is worth knowing before someone tries
one of them:

1. `walletOptions()` must omit the `walletConnect` key rather than pass an empty
   one. The library creates the connector, and appends the picker entry, whenever
   that key is _present_ — it never looks at the id first.
2. `WALLET_CONNECT_PROVIDER` is **already in `DEFAULT_PROVIDERS`**, so the picker
   lists it whether or not any option is passed. Dropping the option alone leaves
   the entry sitting there, now leading to a connector nothing ever initialised. So
   `walletOptions()` also passes a `defaultProviders` list with it filtered out.

`scripts/pwa-check.mjs` checks the result in a real browser. Its wallet checks now
read the text of the picker alone rather than of the whole page: the old whole-page
version gave a false positive that took a while to see, because the app's own "Your
wallet" and "Connect wallet" concatenate to `walletConnect`.

Nothing else here has been fixed; the rest is the analysis, so the next session does
not have to redo it.

The symptom, reported on desktop Chrome, Android Chrome and Android Firefox alike:
**you approve in the wallet, and the app does not pick it up.** Same on all three,
which already says the cause is not platform deep-linking.

## What is not wrong

Ruled out by measurement before WalletConnect was switched off, so nobody spends
another evening on it:

| Checked                                   | Result                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm test`                               | all pass                                                                            |
| `pnpm build`                              | clean                                                                               |
| `pnpm check:pwa` (against `pnpm preview`) | 11/11                                                                               |
| Service worker                            | registers, activates, controls the page on the next visit, serves the shell offline |
| Reown project id                          | accepted — the picker really did list WalletConnect                                 |
| Live `sw.js`                              | byte-identical to `public/sw.js`; the Netlify deploy is current                     |
| Routing                                   | hash-based (`src/lib/route.ts`), so no SPA fallback is needed                       |
| WalletConnect deps                        | present transitively via `@stacks/connect` → `@reown/appkit@1.7.17`                 |

The PWA half is fine. The failure is in the wallet half.

## The cause: the session carries no public key

Read `@stacks/connect@8.2.6` (`node_modules/@stacks/connect/dist/index.mjs`, minified —
the class is `de`, the wrapper it puts on `window.WalletConnectProvider`).

Three method names never reach the wallet at all:

```js
case "getAddresses": case "stx_getAddresses": case "stx_getAccounts":
  let u = await this.getAddresses(); return We(u);
```

and `getAddresses()` reads the WalletConnect **session**, it does not make an RPC call:

```js
get stacksAddresses() {
  const session = this.connector.provider?.session;
  if (!session?.namespaces?.stacks?.accounts) return [];
  const extra = JSON.parse(session?.sessionProperties?.stacks_getAddresses || "[]");
  const all = [
    ...session.namespaces.stacks.accounts.map(a => ({ address: a.split(":")[2], publicKey: "" })),
    ...extra,
  ].sort(e => (e.publicKey ? 1 : -1));
  return Array.from(new Map(all.map(e => [e.address, e])).values());
}
```

So over WalletConnect an address has a public key **only if the wallet published
`sessionProperties.stacks_getAddresses` when it approved the session.** Otherwise
every entry comes back as `publicKey: ""`.

And `publicKey: ""` is exactly what this app cannot use. `sessionFromAddresses`
(`src/lib/wallet-session.ts:79`) requires a truthy public key and returns `null`
without one, so `openWallet` (`src/components/StakeModal.tsx:372`) throws
`stake.error.noPublicKey` — _"Your wallet did not return a public key. Reconnect and
try again."_ — and calls `forgetWallet()`, throwing the freshly approved session away.

That is the reported symptom, and it does not depend on the platform.

**Why we need the key at all:** the app builds the unsigned transaction itself
(`buildStake` / the increase path) and then asks for `stx_signTransaction`
(`src/components/StakeModal.tsx:526`). Building a Stacks transaction locally needs the
signer's public key. An injected extension answers `getAddresses` with one; a
WalletConnect session may not contain one.

### The `stx_getAddresses` fallback cannot help

`requestAddresses` (`src/lib/wallet-connect.ts:177`) retries with
`request(walletOptions(), 'stx_getAddresses')` when `connect()` comes back empty. Over
WalletConnect that is a **no-op**: both land in the same `de.getAddresses()` above and
read the same session. Verified end to end —

- `connect()` is `ns(e)` → `request({...e, forceWalletSelect: true}, 'getAddresses')`.
- The `wallet_connect` method override in `pe()` only fires for Xverse-shaped injected
  providers (`signMultipleTransactions` + `createRepeatInscriptions`). The WalletConnect
  wrapper is not one, so the method stays `getAddresses`.
- `getAddresses` and `stx_getAddresses` hit the identical `case` arm.

The retry costs a round trip and returns the same data. It genuinely does help with the
injected extensions, where the two calls reach different provider objects.

### The comment in the source is wrong

`src/lib/wallet-connect.ts:161-176` explains the fallback as sidestepping a bip122
method that Xverse's approved session lacks. That reasoning does not survive reading the
library: `getAddresses` over WalletConnect makes **no RPC call at all**, to bip122 or
anything else. Whatever was observed, that was not the mechanism. Fix the comment
alongside whatever fix lands.

## Two further defects, real but probably secondary

Worth fixing regardless; neither is likely to be the main event.

**1. The disconnect is asynchronous and nobody waits for it.**
`disconnect()` from `@stacks/connect` is not `async`, and internally it does
`provider.disconnect()` without awaiting — while `de.disconnect()` is `async` and calls
`UniversalConnector.disconnect()`, which awaits `appKit.disconnect()` _and_
`provider.disconnect()`. `openWallet` calls `forgetWallet()` and then immediately
connects (`src/components/StakeModal.tsx:373-383`), so from the second attempt in a page
load onwards a teardown is still in flight while the new connect starts, and can destroy
the session that was just approved. The first attempt of a page load is safe only
because `window.WalletConnectProvider` does not exist yet, so there is nothing to
disconnect.

**2. A spurious "user cancelled" can discard a good approval.**
`de.connect()` races a watchdog against the connect:

```js
appKit.subscribeState((state) => {
  if (!state.open && !this.connector.provider?.session)
    reject(new Error('User closed the WalletConnect modal'));
});
```

`isUserCancellation` (`src/lib/wallet-connect.ts:148`) matches
`/closed the walletconnect modal/` and rethrows, which skips the fallback and forgets
the wallet. If that watchdog ever fires while the session is in fact live, an approval is
thrown away as a cancellation. Before treating an error as a cancellation, check whether
a session actually exists.

## What we need from the wallets

**The question for Xverse and Leather:** does the wallet publish
`sessionProperties.stacks_getAddresses`, containing the STX address **with its public
key**, when it approves a WalletConnect session? And if not, is there a supported way to
obtain the public key over WalletConnect?

Answers change what we build:

- **They do publish it (or will).** Nothing structural to do — take the wallet update,
  fix defects 1 and 2 above, correct the wrong comment.
- **They will not.** The local-build-then-`stx_signTransaction` flow cannot work over
  WalletConnect, and the stake path has to switch to `stx_callContract` for the
  WalletConnect provider, letting the wallet build and sign. That is a real change to
  `StakeModal`, and it gives up the local control over fee and nonce that the current
  flow has.

Do not start the `stx_callContract` rewrite before the answer lands.

## Loose ends, unrelated to the above

- **`manifest.webmanifest` is served as `application/octet-stream`** on the live site.
  Netlify has no mapping for the extension and there is no `netlify.toml` in the repo.
  Chrome tolerates it; iOS Safari is stricter. Worth a `[[headers]]` block setting
  `application/manifest+json`.
- **`/.well-known/walletconnect.txt` is 404.** Only affects Reown's Verify badge — what
  a wallet _displays_ about who is asking — not whether the connection works.
- **`VERSION` in `public/sw.js` is a constant.** The file is byte-identical between
  builds, so the browser never sees a changed worker, so the update banner in
  `src/lib/service-worker.ts` can effectively never appear. Navigation is network-first
  and assets are content-hashed, so nothing goes stale — but the "a new version is
  ready" path is dead code until the version is stamped at build time.

## Reproducing the analysis

The library is shipped minified. To read it:

```bash
python3 - <<'EOF'
import re
s = open('node_modules/@stacks/connect/dist/index.mjs', encoding='utf-8').read()
i = re.search(r'var de=class', s).start()      # the WalletConnect provider wrapper
print(s[i:i+5200].replace(',', ',\n'))
EOF
```

`@reown/appkit-universal-connector` is not minified and is short enough to read directly:
`node_modules/.pnpm/@reown+appkit-universal-connector@1.7.17_*/node_modules/@reown/appkit-universal-connector/dist/esm/src/UniversalConnector.js`.
