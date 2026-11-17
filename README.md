# Sandcastle Wallet

Sandcastle Wallet uses the Xverse browser extension and wallet core. The original programs are copyright Secret Key Labs Limited. This independent derivative is distributed solely for Non-Commercial Use under the enclosed licences. It is not affiliated with or endorsed by Xverse or Secret Key Labs.

## Building with the local core

Check out `regtest-fork` in both repositories, with these directory names under
the same parent. The build was verified with Node.js 22 and npm 10. The core
declares Node.js 18, so npm can print an engine warning on Node.js 22.

```sh
cd sandcastle-wallet-core
npm ci
npm run build:esm

cd ../sandcastle-wallet
test -f .env || cp .env.example .env
npm ci --legacy-peer-deps
npm run ts-check
npm run build
```

The extension uses the core's compiled `dist/` through the local dependency.
Run `npm run build:esm` again after changing core source. A successful extension
build produces the unpacked Chrome extension in `build/`. In Chrome's extension
manager, enable Developer mode, choose Load unpacked, and select that directory.
