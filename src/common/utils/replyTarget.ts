import { getOriginFromPort, getTabIdFromPort } from '.';

export const replyTargetParam = 'replyTarget';

type ReplyTarget = {
  tabId: number;
  origin: string;
  frameId: number;
  documentId?: string;
  token: string;
};

const targets = new WeakMap<chrome.runtime.Port, ReplyTarget>();

export function bindReplyTarget(port: chrome.runtime.Port, token: unknown): boolean {
  const existing = targets.get(port);
  if (existing) return existing.token === token;
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return false;
  targets.set(port, {
    token,
    tabId: getTabIdFromPort(port),
    origin: getOriginFromPort(port),
    frameId: port.sender?.frameId ?? 0,
    documentId: port.sender?.documentId,
  });
  return true;
}

export function serializeReplyTarget(port: chrome.runtime.Port): string {
  return JSON.stringify(targets.get(port)) ?? '';
}

function popupReplyTarget(tabId: number): ReplyTarget | undefined {
  const value = new URLSearchParams(globalThis.location.search).get(replyTargetParam);
  if (!value) return undefined;
  const target: ReplyTarget = JSON.parse(value);
  return target.tabId === tabId ? target : undefined;
}

async function sendToDocument(target: ReplyTarget, message: unknown, ping = false) {
  const { tabId, frameId, documentId, origin, token } = target;
  // On Chrome versions without document IDs, the content script checks the original document token.
  const options = documentId ? { documentId } : { frameId };
  return chrome.tabs
    .sendMessage(tabId, { origin, token, message, ping }, options)
    .catch(() => undefined);
}

export async function isReplyDocumentActive(tabId: number): Promise<boolean> {
  const target = popupReplyTarget(tabId);
  return !!target && (await sendToDocument(target, null, true)) === true;
}

export function sendPageReply(recipient: number | chrome.runtime.Port, message: unknown) {
  if (typeof recipient !== 'number') {
    try {
      recipient.postMessage(message);
    } catch {
      // The originating document disconnected while the request was running.
    }
    return;
  }
  const target = popupReplyTarget(recipient);
  if (target) void sendToDocument(target, message);
}
