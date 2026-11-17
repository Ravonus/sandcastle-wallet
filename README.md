# Sandcastle Wallet

Sandcastle Wallet is an unofficial, non-commercial fork of the Xverse browser extension for local Bitcoin Regtest development. It uses the Xverse extension and wallet core, copyright Secret Key Labs Limited. See [NOTICE](NOTICE) and [LICENSE](LICENSE) for the copyright notice and licence conditions. Sandcastle is for unpacked developer use and is not intended for extension stores.

## Build and load in Chrome

Place the `regtest-fork` branches of the extension and core in sibling checkouts named `sandcastle-wallet` and `sandcastle-wallet-core`. The extension resolves core through a local file dependency. From their parent directory, with Node.js 22 and npm:

```sh
cd sandcastle-wallet-core
npm ci
npm run build:esm
cd ../sandcastle-wallet
npm ci --legacy-peer-deps
cp -n .env.example .env
npm run ts-check
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `sandcastle-wallet/build`. The official wallet can stay installed. Sandcastle has a different extension ID and exposes its Bitcoin provider at `window.SandcastleProviders.BitcoinProvider`. Create or restore a disposable Regtest wallet in Sandcastle. Its keys, account settings, and site permissions are stored under its own extension ID.

## Configure Regtest

A fresh install selects **Regtest** with both URLs blank. Open **Settings → Network → Regtest** and enter:

| Setting | Example |
| --- | --- |
| Bitcoin API URL (esplora-style) | `http://localhost:3002/api` |
| Ord API URL | `http://localhost:80` |

Enter the Bitcoin API prefix if your service has one. The Ord URL is the server root serving `/r/blockheight`, `/output/<outpoint>`, `/inscription/<id>`, and `/content/<id>`. Save checks the Bitcoin tip and indexed Ord height. If Ord answers the genesis lookup, its hash must match Regtest. The wallet warns if Ord is more than one block behind Bitcoin or the endpoints report different hashes at the same height. **Save anyway** lets you keep the settings while services are offline. Restart or refresh your wallet views after your services come online.

The wallet uses these endpoints for Bitcoin balances, fees, inscriptions, and broadcasts. On Regtest it disables hosted fiat prices and charts, announcements, dApp discovery, buy and swaps, stacking and Stacks, token services for runes and BRC-20, hosted inscription orders, and Ledger and Keystone. Analytics are disabled throughout this fork.

## Local test connector

In **Settings → Network → Regtest**, enable **Expose local regtest test connector** and save. This is off by default. On Regtest, a site can discover `window.agorixRegtestWallet` if the property is unclaimed. It uses Sandcastle's normal connection, signing, and transfer approvals. Sites can read its state or listen for `agorix:btc-regtest-wallet-state`.

The connector exposes the account's ordinals and payment roles, eligible payment UTXOs, BIP322 Taproot message signing, PSBT signing, and Bitcoin transfers. Amounts in connector transfer requests are integer satoshis. Sign-only PSBT requests preserve partial signatures. A script-path signing request needs explicit input descriptors.

## Known limits

- Partial Esplora backends can supply spendable outputs without address history. History and pending activity depend on backend support. Regtest speed-up and RBF are disabled.
- Funding requires confirmed UTXOs whose Ord output records match the address and value and show no inscriptions or observed runes. Funding safety relies on the configured Ord server indexing inscriptions for the same Bitcoin chain. Funding also checks the outspend route and coinbase maturity when those facts are available. The extension tracks submitted inputs until scans stop returning them.
- Inscription views render images and plain text. Other media uses a placeholder. A held inscription with unavailable details keeps its ID, with an unknown offset.
- `ALL|ANYONECANPAY` can display fee and inscription routing even though additional inputs can change them. Requests without input descriptors can mark external inputs as signing candidates in the preview.
- The Taproot script-path signer assumes the default code separator position. Leaves using `OP_CODESEPARATOR` can produce invalid signatures.
- Some shared TypeScript return types are wider to accommodate missing Regtest metadata. Hosted helpers that take no Bitcoin network rely on the extension's caller-side Regtest guards.
- The marketplace compatibility connector supplies wallet approvals and signatures. Marketplace inventory, attestation, co-signatures, and settlement depend on the site and its services.

Run the localhost replay and coexistence checks against the production bundle:

```sh
npx playwright install chromium
npx playwright test tests/specs/sandcastleCoexistence.spec.ts tests/specs/sandcastleRegtest.spec.ts --workers=1
```
