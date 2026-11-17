import { regtestApiUrl, type SettingsNetwork } from '@secretkeylabs/xverse-core';

export function normalizeRegtestEndpoint(value: string, endpoint: 'bitcoin' | 'ord') {
  if (!value.trim()) return '';
  try {
    return regtestApiUrl(value, endpoint);
  } catch {
    return undefined;
  }
}

async function check(
  base: string,
  route: string,
  pattern: RegExp,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const endpoint = route.startsWith('/r/') ? 'ord' : 'bitcoin';
    const response = await fetch(`${regtestApiUrl(base, endpoint)}${route}`, {
      signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    return response.ok && pattern.test((await response.text()).trim());
  } catch {
    return false;
  }
}

export function validateRegtestOrdEndpoint(value: string, signal = AbortSignal.timeout(4900)) {
  return check(value, '/r/blockheight', /^\d+$/, signal);
}

export async function validateRegtestEndpoints(settings: SettingsNetwork) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4900);
  try {
    const [bitcoin, ord] = await Promise.all([
      Promise.any(
        [
          check(settings.btcApiUrl, '/blocks/tip/hash', /^[a-f0-9]{64}$/i, controller.signal),
          // Leave room for a slow but supported hash endpoint before trying the height route.
          new Promise<boolean>((resolve) => {
            const fallback = setTimeout(() => {
              resolve(check(settings.btcApiUrl, '/blocks/tip/height', /^\d+$/, controller.signal));
            }, 1000);
            controller.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(fallback);
                resolve(false);
              },
              { once: true },
            );
          }),
        ].map(async (result) => {
          if (!(await result)) throw new Error('Invalid Bitcoin API response');
          return true;
        }),
      ).catch(() => false),
      validateRegtestOrdEndpoint(settings.ordApiUrl ?? '', controller.signal),
    ]);
    return { bitcoin, ord };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
