import { DomEventName } from '@common/types/inpage-types';
import { PAGE_EXTENSION_SOURCE } from '@common/types/message-types';
import {
  connectorIdentity,
  disconnectedRegtestState,
  regtestMethods,
  regtestSettingsChannel,
  regtestStateEvent,
  type RegtestFundingUtxo,
  type RegtestPsbtRequest,
  type RegtestWalletState,
} from '@common/types/regtestConnector';
import { contentScriptRpcResponseMessageName } from '@common/utils/messages/extensionToContentScript/schemas';
import { rpcResponseMessageSchema } from '@sats-connect/core';
import { nanoid } from 'nanoid';
import * as v from 'valibot';
import { waitForPageResponse } from './utils';

async function request<Result>(
  method: (typeof regtestMethods)[keyof typeof regtestMethods],
  params: Record<string, unknown> = {},
) {
  const id = nanoid();
  const event = new CustomEvent(DomEventName.rpcRequest, {
    detail: { jsonrpc: '2.0', id, method, params },
  });
  const response = await waitForPageResponse(
    contentScriptRpcResponseMessageName,
    () => document.dispatchEvent(event),
    (data) => {
      const result = v.safeParse(rpcResponseMessageSchema, data);
      return result.success && result.output.id === id ? result.output : undefined;
    },
    method === regtestMethods.state ? 5000 : undefined,
  );
  if ('result' in response) return response.result as Result;
  const error = v.safeParse(v.object({ message: v.string() }), response.error);
  throw new Error(error.success ? error.output.message : 'Sandcastle Wallet rejected the request.');
}

function makeConnector(updateState: (state: RegtestWalletState) => void) {
  const getState = () => request<RegtestWalletState>(regtestMethods.state);
  const connector = {
    ...connectorIdentity,
    getState,
    async connect() {
      await request(regtestMethods.connect);
      const state = await getState();
      if (!state.connected) throw new Error('Sandcastle Wallet did not connect.');
      updateState(state);
      return state;
    },
    async disconnect() {
      const state = await request<RegtestWalletState>(regtestMethods.disconnect);
      updateState(state);
      return state;
    },
    async getAddress() {
      return (await getState()).paymentAddress;
    },
    async getAccounts() {
      const state = await getState();
      return state.address && state.paymentAddress ? [state.address, state.paymentAddress] : [];
    },
    getUtxos: (address?: string) =>
      request<RegtestFundingUtxo[]>(regtestMethods.getUtxos, { address }),
    async signMessage(
      message: string,
      options?: { toSignAddress?: string; protocol?: 'bip322' | 'ecdsa' },
    ) {
      const { signature } = await request<{ signature: string }>(regtestMethods.signMessage, {
        message,
        address: options?.toSignAddress,
        protocol: options?.protocol,
      });
      return signature;
    },
    async signPsbt(payload: string | RegtestPsbtRequest) {
      const { psbt } = await request<{ psbt: string }>(
        regtestMethods.signPsbt,
        typeof payload === 'string' ? { tx: payload } : payload,
      );
      return psbt;
    },
    async send(payload: { to: string; amount: number }) {
      const { txid } = await request<{ txid: string }>(regtestMethods.send, payload);
      return txid;
    },
  };
  return Object.freeze(connector);
}

export default function installRegtestConnector() {
  let lastState: RegtestWalletState | undefined;
  let refreshId = 0;
  function publish(state: RegtestWalletState) {
    if (window.agorixRegtestWallet !== connector) return;
    if (JSON.stringify(state) === JSON.stringify(lastState)) return;
    lastState = state;
    window.dispatchEvent(new CustomEvent(regtestStateEvent, { detail: state }));
  }
  const connector = makeConnector(publish);

  async function refresh() {
    const id = ++refreshId;
    try {
      const state = await connector.getState();
      if (id !== refreshId) return;
      if (!state.available) {
        if (window.agorixRegtestWallet === connector) {
          publish(disconnectedRegtestState(false));
          if (window.agorixRegtestWallet === connector) delete window.agorixRegtestWallet;
          lastState = undefined;
        }
        return;
      }
      if (!('agorixRegtestWallet' in window)) {
        Object.defineProperty(window, 'agorixRegtestWallet', {
          value: connector,
          configurable: true,
        });
      }
      publish(state);
    } catch {
      // A worker restart can interrupt a read. The next settings or focus event retries it.
    }
  }

  window.addEventListener('message', ({ source, origin, data }) => {
    if (
      source === window &&
      origin === window.location.origin &&
      data?.source === PAGE_EXTENSION_SOURCE &&
      data.channel === regtestSettingsChannel
    ) {
      void refresh();
    }
  });
  const refreshInstalled = () => {
    if (window.agorixRegtestWallet === connector) void refresh();
  };
  window.addEventListener('focus', refreshInstalled);
  window.addEventListener('pageshow', refreshInstalled);
  document.addEventListener('visibilitychange', refreshInstalled);
  // Session expiry can occur without a storage write when the popup is closed.
  window.setInterval(() => {
    if (window.agorixRegtestWallet === connector) void refresh();
  }, 15_000);
}

declare global {
  interface Window {
    agorixRegtestWallet?: ReturnType<typeof makeConnector>;
  }
}
