import {
  LEGACY_RESPONSE_CHANNEL,
  MESSAGE_SOURCE,
  PAGE_APP_SOURCE,
  PAGE_EXTENSION_SOURCE,
  type LegacyMessageToContentScript,
  type SatsConnectMessageToContentScript,
} from '@common/types/message-types';
import { nanoid } from 'nanoid';

export function waitForPageResponse<Result>(
  channel: string,
  dispatch: () => void,
  match: (data: any) => Result | undefined,
  timeoutMs = 10 * 60 * 1000,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    let timeout: number;

    function onMessage(event: MessageEvent) {
      const { data } = event;
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (data?.source !== PAGE_EXTENSION_SOURCE || data.channel !== channel) return;
      const result = match(data.data);
      if (result === undefined) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(result);
    }

    timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for Sandcastle Wallet'));
    }, timeoutMs);
    window.addEventListener('message', onMessage);
    dispatch();
  });
}

type LegacyResponse = LegacyMessageToContentScript | SatsConnectMessageToContentScript;

export function requestLegacy<Response extends LegacyResponse>(
  event: CustomEvent,
  method: Response['method'],
  request: Partial<Response['payload']>,
): Promise<Response['payload']> {
  return waitForPageResponse(
    LEGACY_RESPONSE_CHANNEL,
    () => document.dispatchEvent(event),
    (data) => {
      if (data?.source !== MESSAGE_SOURCE || data.method !== method || !data.payload) {
        return undefined;
      }
      if (!Object.entries(request).every(([key, token]) => data.payload[key] === token)) {
        return undefined;
      }
      return data.payload;
    },
  );
}

export function getExtensionUrl(): Promise<string> {
  const id = nanoid();
  return waitForPageResponse(
    LEGACY_RESPONSE_CHANNEL,
    () =>
      window.postMessage({ source: PAGE_APP_SOURCE, method: 'getURL', id }, window.location.origin),
    (data) =>
      data?.method === 'getURLResponse' && data.id === id && typeof data.url === 'string'
        ? data.url
        : undefined,
    1000,
  );
}
