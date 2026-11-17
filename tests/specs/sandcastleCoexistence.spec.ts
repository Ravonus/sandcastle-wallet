import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { createServer } from 'http';
import { type AddressInfo } from 'net';
import { tmpdir } from 'os';
import path from 'path';
// Include the provider's Window declarations when type-checking this spec alone.
import type {} from '../../src/inpage';

const sandcastle = path.resolve(__dirname, '../../build');
const peer = path.resolve(__dirname, '../fixtures/xverse-peer');
const sandcastleId = 'SandcastleProviders.BitcoinProvider';
const peerId = 'XverseProviders.BitcoinProvider';

type PeerProvider = {
  request(method: string, params?: unknown, id?: string, defer?: boolean): Promise<unknown>;
};

const upstreamEvents = [
  'xverse_stx_authentication_request',
  'xverse_stx_signature_request',
  'xverse_stx_structured_data_signature_request',
  'xverse_stx_transaction_request',
  'xverse_btc_address_request',
  'xverse_btc_sats_psbt_request',
  'xverse_btc_batch_psbt_request',
  'xverse_btc_sign_message_request',
  'xverse_btc_send_request',
  'xverse_btc_create_inscription_Request',
  'xverse_btc_create_repeat_inscriptions_request',
];

(['peer', 'sandcastle'] as const).forEach((first) => {
  test(`Sandcastle coexists with an Xverse-shaped peer (${first} first)`, async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'sandcastle-coexistence-'));
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><head><title>Provider test</title></head></html>');
    });
    let context: BrowserContext | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const { port } = server.address() as AddressInfo;
      const localUrl = `http://127.0.0.1:${port}`;
      const extensionPaths = (first === 'peer' ? [peer, sandcastle] : [sandcastle, peer]).join(',');
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extensionPaths}`,
          `--load-extension=${extensionPaths}`,
        ],
      });
      await context.route('**/*', (route) => {
        const url = route.request().url();
        return url.startsWith(localUrl) || url.startsWith('chrome-extension:')
          ? route.continue()
          : route.abort();
      });

      const [worker = await context.waitForEvent('serviceworker')] = context.serviceWorkers();
      const origin = worker.url().replace(/\/background\.js$/, '');
      const manifest = JSON.parse(await readFile(path.join(sandcastle, 'manifest.json'), 'utf8'));
      const notice = (await readFile(path.join(sandcastle, 'NOTICE'), 'utf8')).trim();

      const landing = await context.newPage();
      await landing.goto(`${origin}/options.html#/landing`);
      await expect(landing).toHaveTitle('Sandcastle Wallet');
      const logo = landing.getByRole('img', { name: 'Sandcastle Wallet' }).first();
      await expect(logo).toBeVisible();
      await expect
        .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
      await landing.getByRole('button', { name: 'Create a new wallet' }).click();
      await expect(landing.getByText(notice, { exact: true })).toBeVisible();
      await landing.close();

      const page = await context.newPage();
      await page.goto(`${localUrl}/?first=${first}`);
      await expect
        .poll(() => page.evaluate(() => window.btc_providers?.map(({ id }) => id)))
        .toEqual(first === 'peer' ? [peerId, sandcastleId] : [sandcastleId, peerId]);

      const discovery = await page.evaluate(async (id) => {
        const fork = window.SandcastleProviders!;
        const upstream = window.XverseProviders!;
        const entries = window.btc_providers;
        const entry = entries?.find((provider) => provider.id === id);
        const script = document.createElement('script');
        script.src = (
          document.querySelector('#sandcastle-wallet-provider') as HTMLScriptElement
        ).src;
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = reject;
          document.head.appendChild(script);
        });
        return {
          isolated:
            (fork as unknown) !== upstream &&
            fork.BitcoinProvider !== upstream.BitcoinProvider &&
            fork.StacksProvider !== window.StacksProvider,
          peerGlobals:
            window.BitcoinProvider === upstream.BitcoinProvider &&
            window.StacksProvider?.getProductInfo?.().name === 'Xverse-shaped test peer',
          defaultsWereFree: document.documentElement.dataset.forkLeftDefaultsFree,
          unchangedNamespace:
            window.SandcastleProviders === fork && window.XverseProviders === upstream,
          unchangedArray: window.btc_providers === entries,
          ids: window.btc_providers?.map((provider) => provider.id),
          name: entry?.name,
          icon: entry?.icon.startsWith('data:image/svg+xml;base64,'),
          stacksInfo: fork.StacksProvider.getProductInfo?.(),
          stacksUrl: await fork.StacksProvider.getURL(),
        };
      }, sandcastleId);
      expect(discovery).toEqual({
        isolated: true,
        peerGlobals: true,
        defaultsWereFree: 'true',
        unchangedNamespace: true,
        unchangedArray: true,
        ids: first === 'peer' ? [peerId, sandcastleId] : [sandcastleId, peerId],
        name: 'Sandcastle Wallet',
        icon: true,
        stacksInfo: { name: 'Sandcastle Wallet', version: manifest.version },
        stacksUrl: `${origin}/options.html`,
      });

      const isolation = await page.evaluate(async (eventNames) => {
        const fork = window.SandcastleProviders!.BitcoinProvider;
        const upstream = window.XverseProviders!.BitcoinProvider as unknown as PeerProvider;
        const traffic: Array<{ source: string; channel?: string; jsonrpc?: string }> = [];
        let forkWalletEvents = 0;
        const stopListening = fork.addListener!('accountChange', () => {
          forkWalletEvents += 1;
        });
        window.addEventListener('message', ({ data }) => traffic.push(data));
        const upstreamResult = await upstream.request('getInfo');
        eventNames.forEach((eventName) => {
          document.dispatchEvent(
            new CustomEvent(eventName, {
              detail: Object.fromEntries(
                [
                  'authenticationRequest',
                  'signatureRequest',
                  'transactionRequest',
                  'btcAddressRequest',
                  'signPsbtRequest',
                  'signBatchPsbtRequest',
                  'signMessageRequest',
                  'sendBtcRequest',
                  'createInscriptionRequest',
                  'createRepeatInscriptionsRequest',
                ].map((key) => [key, 'upstream-token']),
              ),
            }),
          );
        });
        window.dispatchEvent(
          new CustomEvent('xverse-wallet-event', { detail: { type: 'accountChange' } }),
        );
        const legacyPeerReply = new Promise((resolve) => {
          window.addEventListener('message', function onLegacy({ data }) {
            if (data?.source !== 'xverse-extension' || data.method !== 'getURLResponse') return;
            window.removeEventListener('message', onLegacy);
            resolve(data.url);
          });
        });
        window.postMessage(
          { source: 'xverse-app', method: 'getURL', id: 'peer' },
          window.location.origin,
        );
        await legacyPeerReply;
        const forkFirstCount = traffic.filter(
          ({ source }) => source === 'sandcastle-extension',
        ).length;

        let sharedPeerRequest: Promise<unknown> | undefined;
        document.addEventListener(
          'sandcastle_rpc_request',
          (event) => {
            const { id } = (event as CustomEvent<{ id: string }>).detail;
            sharedPeerRequest = upstream.request('getInfo', undefined, id);
          },
          { once: true },
        );
        const forkReply = await fork.request!('getInfo', undefined);
        const peerReply = await sharedPeerRequest;
        const forkOnly = await fork.request!('getInfo', undefined);
        stopListening();
        return {
          upstreamResult,
          forkFirstCount,
          peerReply,
          forkReply,
          forkOnly,
          forkWalletEvents,
          peerRpcCount: traffic.filter(
            ({ source, jsonrpc }) => source === 'xverse-wallet' && jsonrpc,
          ).length,
          forkEnvelopeCount: traffic.filter(
            ({ source, channel }) =>
              source === 'sandcastle-extension' && channel === 'sandcastle-rpc-response',
          ).length,
          bareRpcSources: traffic.filter(({ jsonrpc }) => jsonrpc).map(({ source }) => source),
        };
      }, upstreamEvents);

      expect(isolation.upstreamResult).toMatchObject({ result: { wallet: 'peer' } });
      expect(isolation.forkFirstCount).toBe(0);
      expect(isolation.forkWalletEvents).toBe(0);
      expect(isolation.peerReply).toMatchObject({ result: { wallet: 'peer' } });
      expect(isolation.forkReply).toMatchObject({
        jsonrpc: '2.0',
        result: {
          version: manifest.version,
          methods: expect.arrayContaining(['getInfo']),
          supports: [],
        },
      });
      expect(isolation.forkOnly).toMatchObject({ result: { version: manifest.version } });
      expect(isolation.peerRpcCount).toBe(2);
      expect(isolation.forkEnvelopeCount).toBe(2);
      expect(isolation.bareRpcSources).toEqual(['xverse-wallet', 'xverse-wallet']);
      expect(
        context.pages().filter((candidate) => candidate.url().includes('/popup.html')),
      ).toHaveLength(0);

      // Exercise the two popup-close implementations with an upstream listener
      // waiting on the same ID. Neither fork rejection may settle that listener.
      const popupRequests = [
        { method: 'getAccounts', params: { purposes: ['payment'] } },
        { method: 'signPsbt', params: { psbt: '', signInputs: {} } },
      ];
      // eslint-disable-next-line no-restricted-syntax -- Only one wallet popup can be tested at a time.
      for (const request of popupRequests) {
        const pendingPopup = context.waitForEvent('page', { predicate: (popup) => popup !== page });
        const [replies] = await Promise.all([
          page.evaluate(async ({ method, params }) => {
            const upstream = window.XverseProviders!.BitcoinProvider as unknown as PeerProvider;
            const fork = window.SandcastleProviders!.BitcoinProvider;
            let id = '';
            let peerReply: Promise<unknown> | undefined;
            document.addEventListener(
              'sandcastle_rpc_request',
              (event) => {
                id = (event as CustomEvent<{ id: string }>).detail.id;
                peerReply = upstream.request(method, params, id, true);
              },
              { once: true },
            );
            const call = fork.request as (method: string, params: unknown) => Promise<unknown>;
            const forkReply = await call(method, params);
            document.dispatchEvent(
              new CustomEvent('xverse_rpc_request', { detail: { id, method } }),
            );
            return { id, fork: forkReply, peer: await peerReply };
          }, request),
          pendingPopup.then(async (popup) => {
            await popup.waitForURL(`${origin}/popup.html**`);
            await popup.close();
          }),
        ]);
        expect(replies.fork).toMatchObject({ id: replies.id, error: { code: -32000 } });
        expect(replies.peer).toMatchObject({ id: replies.id, result: { wallet: 'peer' } });
      }
    } finally {
      await context?.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await rm(profile, { recursive: true, force: true });
    }
  });
});
