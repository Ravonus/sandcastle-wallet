import { hex } from '@scure/base';
import { Address, OutScript, TEST_NETWORK, Transaction } from '@scure/btc-signer';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import replay from './replay.json';

export const regtest = { ...TEST_NETWORK, bech32: 'bcrt' };
export const outputScript = (address: string) => OutScript.encode(Address(regtest).decode(address));
export const unknownParent = '44'.repeat(32);
export const ordinalOutpoint = `${replay.ordinal.txid}:${replay.ordinal.vout}`;
const paymentOutpoint = `${replay.payment.txid}:${replay.payment.vout}`;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS+0AAAAASUVORK5CYII=',
  'base64',
);

export async function startRegtestReplay() {
  const routes = new Map<string, [number, string, string | Buffer]>();
  const json = (route: string, value: unknown) =>
    routes.set(route, [200, 'application/json', JSON.stringify(value)]);
  const text = (route: string, value: string) => routes.set(route, [200, 'text/plain', value]);
  const absent = (route: string) => routes.set(route, [404, 'text/plain', 'not indexed']);
  text('/api/blocks/tip/hash', replay.tip);
  text('/api/blocks/tip/height', String(replay.height));
  absent('/api/fee-estimates');
  absent(`/api/tx/${unknownParent}`);
  json('/api/v1/fees/recommended', replay.fees);
  text('/r/blockheight', String(replay.height));
  json(`/r/blockhash/${replay.height}`, replay.tip);
  absent(`/api/block-height/${replay.height}`);
  for (const address of Object.values(replay.addresses)) {
    const utxos =
      address === replay.addresses.ordinals
        ? [replay.ordinal]
        : address === replay.addresses.payment
        ? [replay.payment]
        : [];
    json(`/api/address/${address}/utxo`, utxos);
    absent(`/api/address/${address}`);
    absent(`/api/address/${address}/txs`);
    absent(`/api/address/${address}/txs/mempool`);
  }
  for (const [outpoint, coin, address, inscriptions] of [
    [ordinalOutpoint, replay.ordinal, replay.addresses.ordinals, [replay.inscription.id]],
    [paymentOutpoint, replay.payment, replay.addresses.payment, []],
  ] as const) {
    json(`/output/${outpoint}`, {
      address,
      indexed: true,
      spent: false,
      inscriptions,
      value: coin.value,
      runes: null,
    });
    json(`/api/tx/${coin.txid}`, {
      txid: coin.txid,
      status: coin.status,
      vin: [],
      vout: [
        {
          scriptpubkey: hex.encode(outputScript(address)),
          scriptpubkey_address: address,
          value: coin.value,
        },
      ],
    });
    absent(`/api/tx/${coin.txid}/outspends`);
    json(`/api/tx/${coin.txid}/outspend/${coin.vout}`, { spent: false });
  }
  json(`/inscription/${replay.inscription.id}`, replay.inscription);
  routes.set(`/content/${replay.inscription.id}`, [200, 'image/png', png]);
  routes.set('/site', [200, 'text/html', '<!doctype html><title>Local Regtest test dApp</title>']);
  routes.set('/favicon.ico', [204, 'image/x-icon', '']);

  const requests: string[] = [];
  const unexpected: string[] = [];
  const broadcasts: Transaction[] = [];
  const server = createServer(async (request, response) => {
    const route = request.url ?? '';
    requests.push(`${request.method} ${route}`);
    if (request.method === 'POST' && route === '/api/tx') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk);
        const tx = Transaction.fromRaw(hex.decode(Buffer.concat(chunks).toString()));
        broadcasts.push(tx);
        response.writeHead(200, { 'content-type': 'text/plain' }).end(tx.id);
      } catch {
        response.writeHead(400).end('Expected raw transaction hex');
      }
      return;
    }
    const recorded = request.method === 'GET' ? routes.get(route) : undefined;
    if (!recorded) {
      unexpected.push(`${request.method} ${route}`);
      response.writeHead(404).end('Unexpected route');
      return;
    }
    const [status, contentType, body] = recorded;
    response
      .writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' })
      .end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    unexpected,
    broadcasts,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
