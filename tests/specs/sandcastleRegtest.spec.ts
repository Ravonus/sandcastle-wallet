import { schnorr } from '@noble/curves/secp256k1';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { base64, hex } from '@scure/base';
import { p2tr, RawWitness, Script, SigHash, Transaction } from '@scure/btc-signer';
import { tagSchnorr } from '@scure/btc-signer/utils';
import { createUnsecuredToken } from 'jsontokens';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {} from '../../src/inpage/regtestConnector';
import replay from '../fixtures/sandcastle-regtest/replay.json';
import {
  ordinalOutpoint,
  outputScript,
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
  test.setTimeout(120_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'sandcastle-regtest-'));
  const fixture = await startRegtestReplay();
  let context: BrowserContext | undefined;
  const unexpectedHosts: string[] = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    const httpRequests: string[] = [];
    const workerRequests: string[] = [];
    context.on('request', (request) => {
      const url = request.url();
      if (!/^https?:/.test(url)) return;
      httpRequests.push(url);
      if (request.serviceWorker()) workerRequests.push(url);
      if (new URL(url).origin !== fixture.url) unexpectedHosts.push(url);
    });
    await context.route('**/*', (route) => {
      const requestUrl = route.request().url();
      return /^https?:/.test(requestUrl) && new URL(requestUrl).origin !== fixture.url
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
    await bitcoinField.fill(`${fixture.url}/api`);
    await ordField.fill(fixture.url);
    await wallet.getByRole('checkbox', { name: 'Expose local regtest test connector' }).check();
    await wallet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(wallet).toHaveURL(/#\/settings$/);
    await wallet.getByTestId('nav-dashboard').click();
    await expect(wallet.getByLabel(/Total balance: .*0\.0085/)).toBeVisible();
    await expect(wallet.getByText('Stacks', { exact: true })).toHaveCount(0);
    await wallet.getByRole('button', { name: 'Receive', exact: true }).click();
    await expect(wallet.getByText(/bcrt1q/).first()).toBeVisible();
    await expect(wallet.getByText(/bcrt1p/).first()).toBeVisible();

    await wallet.goto(`${extensionOrigin}/popup.html#/nft-dashboard`);
    const tile = wallet.getByTestId('inscription-container').first();
    const thumbnail = tile.getByTestId('token-image').locator('img');
    await expect(thumbnail).toHaveAttribute(
      'src',
      `${fixture.url}/content/${replay.inscription.id}`,
    );
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
      witnessUtxo: { script: p2tr(externalPubKey).script, amount: 160000n },
      tapInternalKey: externalPubKey,
    });
    mixed.signIdx(externalKey, 1);
    const preserved = hex.encode(mixed.getInput(1).tapKeySig!);
    const legacyRequest = createUnsecuredToken({
      payload: {
        network: { type: 'Regtest' },
        psbtBase64: base64.encode(mixed.toPSBT()),
        inputsToSign: [{ address: replay.addresses.ordinals, signingIndexes: [0], sigHash: 0x83 }],
        broadcast: false,
        message: 'Legacy Regtest approval',
      },
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

    const challenge = 'Sign in to the local replay: ☀';
    const messagePopup = context.waitForEvent('page');
    const signature = site.evaluate(
      (message) => window.agorixRegtestWallet!.signMessage(message),
      challenge,
    );
    await (await messagePopup).getByRole('button', { name: 'Sign', exact: true }).click();
    expect(verifyTaprootMessage(challenge, await signature)).toBe(true);

    const sendPopup = context.waitForEvent('page');
    const transfer = site.evaluate(
      (to) => window.agorixRegtestWallet!.send({ to, amount: 25000 }),
      replay.addresses.nested,
    );
    await (await sendPopup).getByRole('button', { name: 'Confirm', exact: true }).click();
    expect(await transfer).toBe(fixture.broadcasts[0].id);
    await (await sendPopup).close();
    expect(hex.encode(fixture.broadcasts[0].getInput(0).txid!)).toBe(replay.payment.txid);
    expect(fixture.broadcasts[0].getOutput(0).amount).toBe(25000n);

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
