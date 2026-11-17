import { regtestApiUrl, type SettingsNetwork } from '@secretkeylabs/xverse-core';

export function normalizeRegtestEndpoint(value: string, endpoint: 'bitcoin' | 'ord') {
  if (!value.trim()) return '';
  try {
    return regtestApiUrl(value, endpoint);
  } catch {
    return undefined;
  }
}

const regtestGenesis = '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206';
const hashPattern = /^[a-f0-9]{64}$/i;

async function readEndpoint(
  base: string,
  endpoint: 'bitcoin' | 'ord',
  route: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  try {
    const response = await fetch(`${regtestApiUrl(base, endpoint)}${route}`, {
      signal,
      headers: endpoint === 'ord' ? { Accept: 'application/json' } : undefined,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const value = (await response.text()).trim();
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  } catch {
    return undefined;
  }
}

function parseHeight(value: string | undefined): number | undefined {
  if (value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export async function validateRegtestOrdEndpoint(
  value: string,
  signal = AbortSignal.timeout(4900),
) {
  return parseHeight(await readEndpoint(value, 'ord', '/r/blockheight', signal)) !== undefined;
}

export async function validateRegtestEndpoints(settings: SettingsNetwork) {
  const signal = AbortSignal.timeout(4900);
  const ordUrl = settings.ordApiUrl ?? '';
  const [bitcoinHash, bitcoinHeightRaw, ordHeightRaw, genesis] = await Promise.all([
    readEndpoint(settings.btcApiUrl, 'bitcoin', '/blocks/tip/hash', signal),
    readEndpoint(settings.btcApiUrl, 'bitcoin', '/blocks/tip/height', signal),
    readEndpoint(ordUrl, 'ord', '/r/blockheight', signal),
    readEndpoint(ordUrl, 'ord', '/r/blockhash/0', signal),
  ]);
  const bitcoinHeight = parseHeight(bitcoinHeightRaw);
  const ordHeight = parseHeight(ordHeightRaw);
  const wrongGenesis = genesis !== undefined && genesis.toLowerCase() !== regtestGenesis;
  let warning: 'REGTEST_ORD_BEHIND' | 'REGTEST_TIPS_DIFFER' | undefined;
  if (!wrongGenesis && bitcoinHeight !== undefined && ordHeight !== undefined) {
    if (bitcoinHeight - ordHeight > 1) warning = 'REGTEST_ORD_BEHIND';
    else if (bitcoinHeight === ordHeight && bitcoinHash && hashPattern.test(bitcoinHash)) {
      const ordHash =
        ordHeight === 0
          ? genesis
          : await readEndpoint(ordUrl, 'ord', `/r/blockhash/${ordHeight}`, signal);
      if (
        ordHash &&
        hashPattern.test(ordHash) &&
        ordHash.toLowerCase() !== bitcoinHash.toLowerCase()
      ) {
        warning = 'REGTEST_TIPS_DIFFER';
      }
    }
  }
  return {
    bitcoin: bitcoinHeight !== undefined || !!(bitcoinHash && hashPattern.test(bitcoinHash)),
    ord: ordHeight !== undefined,
    wrongGenesis,
    warning,
  };
}
