import type { RpcId } from '@sats-connect/core';

export type BaseArgs = {
  recipient: number | chrome.runtime.Port;
  messageId: RpcId;
};
