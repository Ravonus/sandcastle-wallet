import { schnorr } from '@noble/curves/secp256k1';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { base64, hex } from '@scure/base';
import {
  p2tr,
  RawWitness,
  Script,
  SigHash,
  TAPROOT_UNSPENDABLE_KEY,
  Transaction,
} from '@scure/btc-signer';
import { tagSchnorr } from '@scure/btc-signer/utils';
import { createUnsecuredToken } from 'jsontokens';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {} from '../../src/inpage/regtestConnector';
import replay from '../fixtures/sandcastle-regtest/replay.json';
import {
  missingInscriptionId,
  ordinalOutpoint,
  outputScript,
  regtest,
  startRegtestReplay,
  unknownParent,
} from '../fixtures/sandcastle-regtest/server';

const extensionPath = path.resolve(__dirname, '../../build');

async function restoreWallet(page: Page) {
  await page.getByRole('button', { name: 'Restore an existing wallet' }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  // BIP39 public test vector for 128 zero bits.
  const words = [...Array<string>(11).fill('abandon'), 'about'];
  for (const [index, word] of words.entries()) {
    await page.locator(`#input${index}`).fill(word);
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByPlaceholder('Type your password', { exact: true })
    .fill('Sandcastle playback only #309');
  await page
    .getByPlaceholder('Type your password again', { exact: true })
    .fill('Sandcastle playback only #309');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Preferred Address Type')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wallet restored' })).toBeVisible();
}

function listingPsbt() {
  const tx = new Transaction();
  tx.addInput({
    txid: hex.decode(replay.ordinal.txid),
    index: replay.ordinal.vout,
    witnessUtxo: {
      script: outputScript(replay.addresses.ordinals),
      amount: BigInt(replay.ordinal.value),
    },
    sighashType: SigHash.SINGLE_ANYONECANPAY,
    tapInternalKey: hex.decode(replay.keys.ordinals),
  });
  tx.addOutput({ script: outputScript(replay.addresses.payment), amount: 150_000n });
  return base64.encode(tx.toPSBT());
}

function completeOrdinalPsbt(amount: bigint) {
  const tx = Transaction.fromPSBT(base64.decode(listingPsbt()));
  tx.updateInput(0, { sighashType: SigHash.DEFAULT });
  tx.updateOutput(0, { amount });
  return base64.encode(tx.toPSBT());
}

function multiPartyPsbt() {
  const seller = hex.decode(replay.keys.ordinals);
  const approver = schnorr.getPublicKey(new Uint8Array(32).fill(7));
  const leaf = Script.encode([seller, 'CHECKSIGVERIFY', approver, 'CHECKSIG']);
  const protectedOutput = p2tr(TAPROOT_UNSPENDABLE_KEY, { script: leaf }, regtest, true);
  const tx = new Transaction();
  tx.addInput({
    txid: unknownParent,
    index: 0,
    witnessUtxo: { script: protectedOutput.script, amount: 10_000n },
    tapLeafScript: protectedOutput.tapLeafScript,
    sighashType: SigHash.SINGLE_ANYONECANPAY,
  });
  tx.addOutput({ script: outputScript(replay.addresses.payment), amount: 150_000n });
  return base64.encode(tx.toPSBT());
}

function watchRpcReplies(page: Page) {
  return page.addInitScript(() => {
    const replies: string[] = [];
    Object.assign(window, { sandcastleTestReplies: replies });
    window.addEventListener('message', ({ data }) => {
      if (data?.source === 'sandcastle-extension' && data.channel === 'sandcastle-rpc-response') {
        replies.push(data.data.id);
      }
    });
  });
}

function getRpcReplies(page: Page) {
  return page.evaluate(
    () => (window as unknown as { sandcastleTestReplies: string[] }).sandcastleTestReplies,
  );
}

function dispatchRpc(page: Page, id: string, method: string, params = {}) {
  return page.evaluate(
    ({ id, method, params }) => {
      document.dispatchEvent(
        new CustomEvent('sandcastle_rpc_request', {
          detail: { jsonrpc: '2.0', id, method, params },
        }),
      );
    },
    { id, method, params },
  );
}

function verifyTaprootMessage(message: string, signature: string) {
  const script = outputScript(replay.addresses.ordinals);
  const toSpend = new Transaction({ version: 0 });
  toSpend.addOutput({ script, amount: 0n });
  toSpend.addInput({
    txid: new Uint8Array(32),
    index: 0xffffffff,
    sequence: 0,
    finalScriptSig: Script.encode([
      'OP_0',
      tagSchnorr('BIP0322-signed-message', Buffer.from(message)),
    ]),
  });

  const toSign = new Transaction({ version: 0, allowUnknownOutputs: true });
  toSign.addInput({ txid: toSpend.id, index: 0, sequence: 0, witnessUtxo: { script, amount: 0n } });
  toSign.addOutput({ script: Script.encode(['RETURN']), amount: 0n });
  const [witness] = RawWitness.decode(base64.decode(signature));
  const digest = toSign.preimageWitnessV1(0, [script], SigHash.DEFAULT, [0n]);
  return witness?.length === 64 && schnorr.verify(witness, digest, script.slice(2));
}

test('Regtest restores locally, renders an inscription and approves marketplace signing', async () => {
  test.setTimeout(180_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'sandcastle-regtest-'));
  const fixture = await startRegtestReplay();
  const replacementOrigin = fixture.url.replace('127.0.0.1', 'localhost');
  const fixtureOrigins = [fixture.url, replacementOrigin];
  const paymentRoute = `/api/address/${replay.addresses.payment}/utxo`;
  const detailRoute = `/inscription/${replay.inscription.id}`;
  let context: BrowserContext | undefined;
  const unexpectedHosts: string[] = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    context.setDefaultTimeout(15_000);
    const httpRequests: string[] = [];
    const workerRequests: string[] = [];
    context.on('request', (request) => {
      const url = request.url();
      if (!/^https?:/.test(url)) return;
      httpRequests.push(url);
      if (request.serviceWorker()) workerRequests.push(url);
      if (!fixtureOrigins.includes(new URL(url).origin)) unexpectedHosts.push(url);
    });
    await context.route('**/*', (route) => {
      const requestUrl = route.request().url();
      return /^https?:/.test(requestUrl) && !fixtureOrigins.includes(new URL(requestUrl).origin)
        ? route.abort()
        : route.continue();
    });

    const [worker = await context.waitForEvent('serviceworker')] = context.serviceWorkers();
    const extensionOrigin = worker.url().replace(/\/background\.js$/, '');
    const landing = await context.newPage();
    await landing.goto(`${extensionOrigin}/options.html#/landing`);
    await restoreWallet(landing);
    const wallet = await context.newPage();
    await wallet.goto(`${extensionOrigin}/popup.html`);
    await expect(wallet.getByText('Set your regtest API URLs in Settings → Network')).toBeVisible();
    expect(httpRequests).toEqual([]);

    const site = await context.newPage();
    await site.goto(`${fixture.url}/site`);
    await expect.poll(() => site.evaluate(() => !!window.SandcastleProviders)).toBe(true);
    expect(await site.evaluate(() => 'agorixRegtestWallet' in window)).toBe(false);

    await wallet.getByTestId('nav-settings').click();
    await wallet.getByText('Network', { exact: true }).click();
    const bitcoinField = wallet.getByLabel('Bitcoin API URL (esplora-style)');
    const ordField = wallet.getByLabel('Ord API URL');
    await expect(bitcoinField).toHaveValue('');
    await expect(ordField).toHaveValue('');
    await wallet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(wallet.getByText('Required', { exact: true })).toHaveCount(2);
    await wallet.getByRole('button', { name: 'Save anyway', exact: true }).click();
    await expect(wallet).toHaveURL(/#\/settings$/);
    await wallet.getByText('Network', { exact: true }).click();
    await bitcoinField.fill(`${fixture.url.slice('http://'.length)}/api/`);
    await ordField.fill(`${fixture.url}/`);
    await wallet.getByRole('checkbox', { name: 'Expose local regtest test connector' }).check();
    fixture.json('/r/blockhash/0', 'ab'.repeat(32));
    await wallet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      wallet.getByText('The Ord endpoint does not report the Regtest genesis block.'),
    ).toBeVisible();
    await expect(wallet.getByRole('button', { name: 'Save anyway' })).toHaveCount(0);
    fixture.json(
      '/r/blockhash/0',
      '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206',
    );
    fixture.text('/r/blockheight', String(replay.height - 2));
    await wallet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(wallet).toHaveURL(/#\/settings$/);
    await expect(
      wallet.getByText('The Ord index is more than one block behind the Bitcoin endpoint.'),
    ).toBeVisible();
    fixture.text('/r/blockheight', String(replay.height));
    await wallet.getByText('Network', { exact: true }).click();
    await expect(bitcoinField).toHaveValue(`${fixture.url}/api`);
    await expect(ordField).toHaveValue(fixture.url);
    fixture.json(`/r/blockhash/${replay.height}`, 'cd'.repeat(32));
    await wallet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(wallet).toHaveURL(/#\/settings$/);
    await expect(
      wallet.getByText('The Bitcoin and Ord endpoints report different blocks at the same height.'),
    ).toBeVisible();
    fixture.json(`/r/blockhash/${replay.height}`, replay.tip);
    await wallet.getByTestId('nav-dashboard').click();
    await expect(wallet.getByLabel(/Total balance: .*0\.0085/)).toBeVisible();
    await expect(wallet.getByText('Stacks', { exact: true })).toHaveCount(0);
    await wallet.getByRole('button', { name: 'Receive', exact: true }).click();
    await expect(wallet.getByText(/bcrt1q/).first()).toBeVisible();
    await expect(wallet.getByText(/bcrt1p/).first()).toBeVisible();

    await wallet.goto(`${extensionOrigin}/popup.html#/nft-dashboard`);
    const missingTile = wallet
      .getByTestId('collection-container')
      .filter({ hasText: missingInscriptionId });
    await expect(missingTile.getByTestId('inscription-name')).toHaveText(missingInscriptionId);
    await expect(
      missingTile.getByText('Inscription details unavailable', { exact: true }),
    ).toBeVisible();
    await missingTile.getByTestId('inscription-container').click();
    await expect(wallet.getByText(missingInscriptionId, { exact: true })).toBeVisible();
    await expect(
      wallet.getByText('Inscription details unavailable', { exact: true }),
    ).toBeVisible();
    await wallet.goto(`${extensionOrigin}/popup.html#/nft-dashboard`);
    const tile = wallet
      .getByTestId('collection-container')
      .filter({
        has: wallet.getByTestId('inscription-name').filter({ hasText: /^0$/ }),
      })
      .getByTestId('inscription-container');
    const thumbnail = tile.getByTestId('token-image').locator('img');
    await expect(thumbnail).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
    await tile.click();
    await expect(wallet.getByText(replay.inscription.id, { exact: true })).toBeVisible();
    await expect(wallet.getByText(ordinalOutpoint, { exact: true })).toBeVisible();
    await expect(wallet.getByText('image/png', { exact: true })).toBeVisible();
    const detailImage = wallet.getByTestId('token-image').first().locator('img');
    await expect
      .poll(() => detailImage.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);

    await expect.poll(() => site.evaluate(() => !!window.agorixRegtestWallet)).toBe(true);
    const claimed = await context.newPage();
    await claimed.addInitScript(() => {
      Object.defineProperty(window, 'agorixRegtestWallet', {
        value: { existing: true },
        configurable: true,
      });
    });
    await claimed.goto(`${fixture.url}/site`);
    await expect.poll(() => claimed.evaluate(() => !!window.SandcastleProviders)).toBe(true);

    const before = await site.evaluate(() => window.agorixRegtestWallet!.getState());
    expect(before).toMatchObject({
      available: true,
      connected: false,
      address: null,
      publicKey: null,
    });
    const connectionPopup = context.waitForEvent('page');
    const connectResult = site.evaluate(() => window.agorixRegtestWallet!.connect());
    await (await connectionPopup).getByRole('button', { name: 'Accept', exact: true }).click();
    const state = await connectResult;
    expect(state).toEqual({
      available: true,
      configured: true,
      connected: true,
      address: replay.addresses.ordinals,
      paymentAddress: replay.addresses.payment,
      publicKey: replay.keys.ordinals,
      paymentPublicKey: replay.keys.payment,
      label: 'Sandcastle Wallet',
      provider: 'agorix-regtest-extension',
      network: 'regtest',
      version: expect.any(String),
    });
    expect(await claimed.evaluate(() => window.agorixRegtestWallet)).toEqual({ existing: true });
    await claimed.close();

    // Confirm an established connection takes the worker fast path.
    expect(await site.evaluate(() => window.agorixRegtestWallet!.connect())).toEqual(state);
    const connectRace = await context.newPage();
    await watchRpcReplies(connectRace);
    await connectRace.goto(`${fixture.url}/site`);
    await expect.poll(() => connectRace.evaluate(() => !!window.agorixRegtestWallet)).toBe(true);
    await worker.evaluate(() => {
      const storage = chrome.storage.local;
      const original = storage.get;
      const read = (key: string) => Reflect.apply(original, storage, [key]);
      Object.assign(storage, {
        async get(key: string) {
          if (key === 'client-permissions') {
            storage.get = original;
            await new Promise<void>((resolve) =>
              Object.assign(globalThis, { releaseConnect: resolve }),
            );
          }
          return read(key);
        },
      });
    });
    await dispatchRpc(connectRace, 'stale-connect', 'sandcastle_regtestConnect');
    await expect.poll(() => worker.evaluate(() => 'releaseConnect' in globalThis)).toBe(true);
    await connectRace.goto(`${replacementOrigin}/site`);
    await worker.evaluate(() =>
      (globalThis as unknown as { releaseConnect: () => void }).releaseConnect(),
    );
    await expect.poll(() => connectRace.evaluate(() => !!window.agorixRegtestWallet)).toBe(true);
    expect(await getRpcReplies(connectRace)).not.toContain('stale-connect');
    await connectRace.close();
    const balances = await site.evaluate(() =>
      window.SandcastleProviders!.BitcoinProvider.request!('getBalance', undefined),
    );
    expect(balances).toMatchObject({
      result: { confirmed: '850000', unconfirmed: '0', total: '850000' },
    });
    const inscriptions = await site.evaluate(() =>
      window.SandcastleProviders!.BitcoinProvider.request!('ord_getInscriptions', {
        offset: 0,
        limit: 10,
      }),
    );
    expect(inscriptions).toMatchObject({
      result: { total: 1, inscriptions: [{ inscriptionId: replay.inscription.id }] },
    });
    const utxos = await site.evaluate(() => window.agorixRegtestWallet!.getUtxos());
    expect(utxos).toEqual([
      {
        txid: replay.payment.txid,
        vout: replay.payment.vout,
        valueSats: replay.payment.value,
        blockHeight: replay.payment.status.block_height,
        value: replay.payment.value,
        status: { confirmed: true, block_height: replay.payment.status.block_height },
      },
    ]);

    fixture.redirects.set(paymentRoute, '/redirect-target');
    await expect(site.evaluate(() => window.agorixRegtestWallet!.getUtxos())).rejects.toThrow();
    fixture.redirects.delete(paymentRoute);

    const signingPopup = context.waitForEvent('page');
    const signed = site.evaluate(
      ({ tx, address }) =>
        window.agorixRegtestWallet!.signPsbt({
          tx,
          finalize: false,
          broadcast: false,
          inputsToSign: [{ address, index: 0, sighashTypes: [0x83] }],
        }),
      { tx: listingPsbt(), address: state.address! },
    );
    await (await signingPopup).getByRole('button', { name: 'Confirm', exact: true }).click();
    const psbt = Transaction.fromPSBT(base64.decode(await signed));
    const sig = psbt.getInput(0).tapKeySig!;
    expect(sig).toHaveLength(65);
    expect(sig[64]).toBe(SigHash.SINGLE_ANYONECANPAY);
    const prevout = psbt.getInput(0).witnessUtxo!;
    const digest = psbt.preimageWitnessV1(0, [prevout.script], sig[64], [prevout.amount]);
    expect(schnorr.verify(sig.slice(0, 64), digest, prevout.script.slice(2))).toBe(true);
    expect(psbt.isFinal).toBe(false);
    expect(fixture.broadcasts).toHaveLength(0);

    const mixed = Transaction.fromPSBT(base64.decode(listingPsbt()));
    const externalKey = new Uint8Array(32).fill(7);
    const externalPubKey = schnorr.getPublicKey(externalKey);
    mixed.addInput({
      txid: unknownParent,
      index: 0,
      witnessUtxo: { script: p2tr(externalPubKey).script, amount: 10_000n },
      tapInternalKey: externalPubKey,
    });
    mixed.signIdx(externalKey, 1);
    const preserved = hex.encode(mixed.getInput(1).tapKeySig!);
    const legacyRequest = createUnsecuredToken({
      network: { type: 'Regtest' },
      psbtBase64: base64.encode(mixed.toPSBT()),
      inputsToSign: [{ address: replay.addresses.ordinals, signingIndexes: [0], sigHash: 0x83 }],
      broadcast: false,
      message: 'Legacy Regtest approval',
    });
    const legacyPopup = context.waitForEvent('page');
    const legacyResult = site.evaluate(
      (token) => window.SandcastleProviders!.BitcoinProvider.signTransaction(token),
      legacyRequest,
    );
    const legacyApproval = await legacyPopup;
    await legacyApproval.getByRole('button', { name: 'Inputs & Outputs' }).click();
    await expect(legacyApproval.getByText('Unknown input', { exact: true })).toBeVisible();
    await legacyApproval.getByRole('button', { name: 'Confirm', exact: true }).click();
    const legacySigned = Transaction.fromPSBT(base64.decode((await legacyResult).psbtBase64));
    expect(hex.encode(legacySigned.getInput(1).tapKeySig!)).toBe(preserved);
    expect(legacySigned.getInput(0).tapKeySig).toHaveLength(65);
    expect(legacySigned.isFinal).toBe(false);

    const approve = async (
      tx: string,
      options: { finalize?: boolean; broadcast?: boolean } = {},
    ) => {
      const popup = context!.waitForEvent('page');
      const result = site.evaluate(
        ({ tx, options, address }) =>
          window
            .agorixRegtestWallet!.signPsbt({
              tx,
              ...options,
              inputsToSign: [{ address, index: 0 }],
            })
            .then(
              (value) => ({ value, error: undefined }),
              (error: Error) => ({ value: undefined, error: error.message }),
            ),
        { tx, options, address: replay.addresses.ordinals },
      );
      return { popup: await popup, result };
    };
    const confirm = (popup: Page) =>
      popup.getByRole('button', { name: 'Confirm', exact: true }).click();
    const reject = async (approval: Awaited<ReturnType<typeof approve>>, message: RegExp) => {
      await expect(approval.popup.getByText(message)).toBeVisible();
      await approval.popup.getByRole('button', { name: 'Close', exact: true }).click();
      expect(await approval.result).toMatchObject({ error: expect.stringMatching(message) });
    };

    const protectedSignOnly = await approve(multiPartyPsbt());
    await confirm(protectedSignOnly.popup);
    const protectedResult = await protectedSignOnly.result;
    expect(
      Transaction.fromPSBT(base64.decode(protectedResult.value!)).getInput(0).tapScriptSig,
    ).toHaveLength(1);
    for (const options of [{ finalize: true }, { broadcast: true }]) {
      const multiParty = await approve(multiPartyPsbt(), options);
      await confirm(multiParty.popup);
      await reject(multiParty, /Cannot finalize or broadcast tapscript input 0/);
    }
    expect(fixture.broadcasts).toHaveLength(0);

    const burnsInscription = completeOrdinalPsbt(9000n);
    const burn = await approve(burnsInscription);
    await expect(burn.popup.getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled();
    fixture.json(detailRoute, { ...replay.inscription, satpoint: `${ordinalOutpoint}:9900` });
    await confirm(burn.popup);
    await reject(burn, /may be lost to fees/);

    const batchPopup = context.waitForEvent('page');
    const batchResult = site.evaluate(
      (token) =>
        window
          .SandcastleProviders!.BitcoinProvider.signMultipleTransactions(token)
          .catch(() => 'cancel'),
      createUnsecuredToken({
        network: { type: 'Regtest' },
        psbts: [
          {
            psbtBase64: burnsInscription,
            inputsToSign: [{ address: replay.addresses.ordinals, signingIndexes: [0] }],
          },
        ],
      }),
    );
    const batch = await batchPopup;
    await confirm(batch);
    await expect(batch.getByText(/may be lost to fees/)).toBeVisible();
    await batch.close();
    expect(await batchResult).toBe('cancel');

    const safe = await approve(completeOrdinalPsbt(9999n));
    await confirm(safe.popup);
    const safeResult = await safe.result;
    expect(
      Transaction.fromPSBT(base64.decode(safeResult.value!)).getInput(0).tapKeySig,
    ).toHaveLength(64);

    fixture.absent(detailRoute);
    const missingDetails = await approve(completeOrdinalPsbt(9999n));
    await missingDetails.popup.getByRole('button', { name: 'Inputs & Outputs' }).click();
    await expect(
      missingDetails.popup.getByText(`Inscription details unavailable (${replay.inscription.id})`),
    ).toBeVisible();
    await confirm(missingDetails.popup);
    await reject(missingDetails, /may be lost to fees/);
    fixture.json(detailRoute, replay.inscription);
    fixture.redirects.set(`/output/${ordinalOutpoint}`, '/redirect-target');
    const unknownFacts = await approve(completeOrdinalPsbt(9999n));
    await confirm(unknownFacts.popup);
    await reject(unknownFacts, /inscription information is unavailable/);
    fixture.redirects.delete(`/output/${ordinalOutpoint}`);

    const challenge = 'Sign in to the local replay: ☀';
    const messagePopup = context.waitForEvent('page');
    const signature = site.evaluate(
      (message) => window.agorixRegtestWallet!.signMessage(message),
      challenge,
    );
    await (await messagePopup).getByRole('button', { name: 'Sign', exact: true }).click();
    expect(verifyTaprootMessage(challenge, await signature)).toBe(true);

    fixture.redirects.set('/api/tx', '/redirect-target');
    const redirectPopup = context.waitForEvent('page');
    const redirectResult = site.evaluate(
      (to) =>
        window.agorixRegtestWallet!.send({ to, amount: 25000 }).then(
          () => 'sent',
          (error: Error) => error.message,
        ),
      replay.addresses.nested,
    );
    await confirm(await redirectPopup);
    expect(await redirectResult).toMatch(/network error/i);
    await (await redirectPopup).close();
    fixture.redirects.delete('/api/tx');
    expect(fixture.requests.some((request) => request.includes('/redirect-target'))).toBe(false);
    expect(fixture.broadcasts).toHaveLength(0);

    const broadcastRace = await context.newPage();
    await watchRpcReplies(broadcastRace);
    await broadcastRace.goto(`${fixture.url}/site`);
    await expect.poll(() => broadcastRace.evaluate(() => !!window.agorixRegtestWallet)).toBe(true);
    const sendPopup = context.waitForEvent('page');
    await dispatchRpc(broadcastRace, 'stale-broadcast', 'sandcastle_regtestSend', {
      to: replay.addresses.nested,
      amount: 25000,
    });
    const resumeBroadcast = fixture.pauseBroadcast();
    try {
      await confirm(await sendPopup);
      await expect.poll(() => fixture.broadcasts.length).toBe(1);
      await broadcastRace.goto(`${replacementOrigin}/site`);
      await expect
        .poll(() => broadcastRace.evaluate(() => !!window.agorixRegtestWallet))
        .toBe(true);
    } finally {
      resumeBroadcast();
    }
    await expect(await sendPopup).toHaveURL(/#\/tx-status$/);
    expect(await getRpcReplies(broadcastRace)).not.toContain('stale-broadcast');
    await broadcastRace.close();
    await (await sendPopup).close();
    expect(hex.encode(fixture.broadcasts[0].getInput(0).txid!)).toBe(replay.payment.txid);
    expect(fixture.broadcasts[0].getOutput(0).amount).toBe(25000n);
    expect(await site.evaluate(() => window.agorixRegtestWallet!.getUtxos())).toEqual([]);

    const newCoin = { ...replay.payment, txid: '77'.repeat(32) };
    fixture.json(paymentRoute, [newCoin]);
    fixture.json(`/output/${newCoin.txid}:0`, {
      indexed: true,
      spent: false,
      value: newCoin.value,
      address: replay.addresses.payment,
      inscriptions: [],
    });
    fixture.json(`/api/tx/${newCoin.txid}`, { status: newCoin.status, vin: [], vout: [] });
    fixture.json(`/api/tx/${newCoin.txid}/outspend/0`, { spent: false });
    expect(await site.evaluate(() => window.agorixRegtestWallet!.getUtxos())).toMatchObject([
      { txid: newCoin.txid },
    ]);

    await wallet.getByRole('button', { name: 'Send', exact: true }).click();
    await wallet.getByPlaceholder('Enter address').fill(replay.addresses.nested);
    await wallet.getByRole('button', { name: 'Next', exact: true }).click();
    await wallet.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(() => fixture.broadcasts.length).toBe(2);
    const ordinalSend = fixture.broadcasts[1];
    expect(hex.encode(ordinalSend.getInput(0).txid!)).toBe(replay.ordinal.txid);
    expect(ordinalSend.getOutput(0).script).toEqual(outputScript(replay.addresses.nested));

    const disconnected = await site.evaluate(() => window.agorixRegtestWallet!.disconnect());
    expect(disconnected).toMatchObject({ available: true, connected: false, address: null });
    expect(await site.evaluate(() => window.agorixRegtestWallet!.getAccounts())).toEqual([]);

    await site.evaluate(() => {
      const connector = window.agorixRegtestWallet!;
      const unavailable = new Promise((resolve) => {
        const onState = (event: Event) => {
          const state = (event as CustomEvent).detail;
          if (state.available) return;
          window.removeEventListener('agorix:btc-regtest-wallet-state', onState);
          resolve(state);
        };
        window.addEventListener('agorix:btc-regtest-wallet-state', onState);
      });
      Object.assign(window, { savedConnector: connector, unavailable });
    });
    await wallet.goto(`${extensionOrigin}/popup.html#/settings/change-network`);
    await wallet.getByRole('checkbox', { name: 'Expose local regtest test connector' }).uncheck();
    await wallet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => site.evaluate(() => 'agorixRegtestWallet' in window)).toBe(false);
    expect(
      await site.evaluate(
        () => (window as unknown as { unavailable: Promise<unknown> }).unavailable,
      ),
    ).toMatchObject({ available: false, connected: false, address: null });
    const stale = await site.evaluate(async () => {
      const { savedConnector } = window as unknown as {
        savedConnector: NonNullable<Window['agorixRegtestWallet']>;
      };
      try {
        await savedConnector.getUtxos();
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(stale).toMatch(/disabled/i);

    expect(fixture.requests).toContain(`GET /content/${replay.inscription.id}`);
    expect(workerRequests).toContain(`${fixture.url}/api/address/${replay.addresses.payment}/utxo`);
  } finally {
    await context?.close();
    await fixture.close();
    await rm(profile, { recursive: true, force: true });
    expect(fixture.unexpected).toEqual([]);
    expect(unexpectedHosts).toEqual([]);
  }
});
