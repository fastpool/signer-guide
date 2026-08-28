# Google Play Data safety — the answers

The Data safety form is filled in by hand in Play Console, and it is filled in
against the code, not against a hope. This is what the app actually does, so
that whoever fills it in next says the same thing.

## Does your app collect or share any of the required user data types?

**No.**

Play defines "collect" as data leaving the device and reaching you or a third
party you contract with, and "share" as passing it to a third party. Neither
happens here. The app has no backend, no analytics SDK, no ad SDK and no crash
reporter.

## The three things that leave the device, and why none of them is collection

| Request                              | Contains                    | Why it is not collection under Play's definition |
| ------------------------------------ | --------------------------- | ------------------------------------------------ |
| `raw.githubusercontent.com` — pool data | nothing about the user   | a static file fetch; we receive nothing          |
| `api.hiro.so` — chain reads          | the Stacks address being viewed | the request goes to a public node, not to us, and it is the app functioning as asked. Declare **nothing collected**; the disclosure that belongs to it is in the privacy policy, which says plainly that Hiro sees the address |
| WalletConnect relay                  | the transaction to be signed | only when a wallet is connected, only for as long as it takes, and only to reach the user's own wallet |

If Play's review asks about the Hiro request, the honest framing is the one
above: the app has no server, receives nothing, and names the third party and
what it can see in the privacy policy.

## Data deletion

There is no account, so there is nothing to delete on request. Everything the
app keeps is on the device and goes when the app is uninstalled — or, for the
address, when the user presses **Forget**.

## Security practices

- All network traffic is HTTPS (and WSS for the transaction watch).
- No data is collected, so there is none in transit to encrypt beyond that.
- The app does not handle private keys at all; signing is delegated to the
  user's wallet application.

## Declared permissions

`INTERNET` only. No location, no camera, no contacts, no storage, no
identifiers.
