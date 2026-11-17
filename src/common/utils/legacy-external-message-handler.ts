import { type RpcErrorResponse } from '@sats-connect/core';
import { type SignatureData } from '@stacks/connect';
import rootStore from '@stores/index';
import { getOriginFromPort, getTabIdFromPort } from '.';
import {
  InternalMethods,
  MESSAGE_SOURCE,
  SatsConnectMethods,
  StacksLegacyMethods,
  type LegacyMessageFromContentScript,
  type LegacyMessageToContentScript,
  type SatsConnectMessageFromContentScript,
  type SatsConnectMessageToContentScript,
  type SignatureResponseMessage,
} from '../types/message-types';
import { sendMessage } from '../types/messages';
import popupCenter from './popup-center';
import { replyTargetParam, sendPageReply, serializeReplyTarget } from './replyTarget';
import RequestsRoutes from './route-urls';
import { bitcoinApprovalParams } from './rpc/btc/regtestApproval';
import { sendRpcResponse } from './rpc/helpers';

type ParamsObject = Record<string, string | null | undefined>;
export type ParamsKeyValueArray = [string, string | null | undefined][];

type Params = ParamsObject | ParamsKeyValueArray;
export function makeSearchParamsWithDefaults(port: chrome.runtime.Port, additionalParams?: Params) {
  const urlParams = new URLSearchParams();
  // All actions must have a corresponding `origin` and `tabId`
  const origin = getOriginFromPort(port);
  const tabId = getTabIdFromPort(port);
  urlParams.set('origin', origin ?? '');
  urlParams.set('tabId', tabId?.toString() ?? '');
  urlParams.set(replyTargetParam, serializeReplyTarget(port));

  let additionalParamsEntries: ParamsKeyValueArray = [];
  if (Array.isArray(additionalParams)) {
    additionalParamsEntries = additionalParams;
  } else if (typeof additionalParams === 'object') {
    additionalParamsEntries = Object.entries(additionalParams);
  }

  additionalParamsEntries.forEach(
    ([key, value]) => typeof value === 'string' && urlParams.set(key, value),
  );

  return { urlParams, origin, tabId };
}

interface ListenForPopupCloseArgs {
  // ID that comes from newly created window
  id?: number;
  port: chrome.runtime.Port;
  response: LegacyMessageToContentScript | SatsConnectMessageToContentScript | RpcErrorResponse;
}
export function listenForPopupClose({ id, port, response }: ListenForPopupCloseArgs) {
  if (id === undefined) return;
  const onRemoved = (winId: number) => {
    if (winId !== id) return;
    chrome.windows.onRemoved.removeListener(onRemoved);
    if ('jsonrpc' in response) {
      sendRpcResponse(port, response);
    } else {
      sendPageReply(port, response);
    }
  };
  chrome.windows.onRemoved.addListener(onRemoved);
}

interface FormatMessageSigningResponseArgs {
  request: string;
  response: SignatureData | string;
}
function formatMessageSigningResponse({
  request,
  response,
}: FormatMessageSigningResponseArgs): SignatureResponseMessage {
  return {
    source: MESSAGE_SOURCE,
    method: StacksLegacyMethods.signatureResponse,
    payload: { signatureRequest: request, signatureResponse: response },
  };
}

interface ListenForOriginTabCloseArgs {
  tabId?: number;
}
export function listenForOriginTabClose({ tabId }: ListenForOriginTabCloseArgs) {
  chrome.tabs.onRemoved.addListener((closedTabId) => {
    if (tabId !== closedTabId) return;
    sendMessage({ method: InternalMethods.OriginatingTabClosed, payload: { tabId } });
  });
}

export async function triggerRequestWindowOpen(path: RequestsRoutes, urlParams: URLSearchParams) {
  const query = new URLSearchParams({ [replyTargetParam]: urlParams.get(replyTargetParam) ?? '' });
  urlParams.delete(replyTargetParam);
  return popupCenter({ url: `/popup.html?${query}#${path}?${urlParams}` });
}

export async function handleLegacyExternalMethodFormat(
  message: LegacyMessageFromContentScript | SatsConnectMessageFromContentScript,
  port: chrome.runtime.Port,
) {
  const { payload } = message;
  if (rootStore.store.getState().walletState.network.type === 'Regtest') {
    const unsupported: Record<string, string> = {
      [StacksLegacyMethods.authenticationRequest]: StacksLegacyMethods.authenticationResponse,
      [StacksLegacyMethods.transactionRequest]: StacksLegacyMethods.transactionResponse,
      [StacksLegacyMethods.signatureRequest]: StacksLegacyMethods.signatureResponse,
      [StacksLegacyMethods.structuredDataSignatureRequest]: StacksLegacyMethods.signatureResponse,
      [SatsConnectMethods.createInscriptionRequest]: SatsConnectMethods.createInscriptionResponse,
      [SatsConnectMethods.createRepeatInscriptionsRequest]:
        SatsConnectMethods.createRepeatInscriptionsResponse,
    };
    if (Object.hasOwn(unsupported, message.method)) {
      const method = unsupported[message.method];
      const requestMethod =
        message.method === StacksLegacyMethods.structuredDataSignatureRequest
          ? StacksLegacyMethods.signatureRequest
          : message.method;
      sendPageReply(port, {
        source: MESSAGE_SOURCE,
        method,
        payload: { [requestMethod]: payload, [method]: 'cancel' },
      });
      return;
    }
  }
  switch (message.method) {
    case StacksLegacyMethods.authenticationRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [['authRequest', payload]]);
      const { id } = await triggerRequestWindowOpen(
        RequestsRoutes.AuthenticationRequest,
        urlParams,
      );
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            authenticationRequest: payload,
            authenticationResponse: 'cancel',
          },
          method: StacksLegacyMethods.authenticationResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }

    case StacksLegacyMethods.transactionRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [['request', payload]]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.TransactionRequest, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          method: StacksLegacyMethods.transactionResponse,
          payload: {
            transactionRequest: payload,
            transactionResponse: 'cancel',
          },
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }

    case StacksLegacyMethods.signatureRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ['request', payload],
        ['messageType', 'utf8'],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignatureRequest, urlParams);
      listenForPopupClose({
        id,
        port,
        response: formatMessageSigningResponse({ request: payload, response: 'cancel' }),
      });
      listenForOriginTabClose({ tabId });
      break;
    }

    case StacksLegacyMethods.structuredDataSignatureRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ['request', payload],
        ['messageType', 'structured'],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignatureRequest, urlParams);
      listenForPopupClose({
        id,
        port,
        response: formatMessageSigningResponse({ request: payload, response: 'cancel' }),
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.getAddressRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ['addressRequest', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.AddressRequest, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            addressRequest: payload,
            addressResponse: 'cancel',
          },
          method: SatsConnectMethods.getAddressResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.signPsbtRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ...bitcoinApprovalParams(),
        ['signPsbtRequest', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignBtcTx, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            signPsbtRequest: payload,
            signPsbtResponse: 'cancel',
          },
          method: SatsConnectMethods.signPsbtResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.signBatchPsbtRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ...bitcoinApprovalParams(),
        ['signBatchPsbtRequest', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignBatchBtcTx, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            signBatchPsbtRequest: payload,
            signBatchPsbtResponse: 'cancel',
          },
          method: SatsConnectMethods.signBatchPsbtResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.signMessageRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ...bitcoinApprovalParams(),
        ['signMessageRequest', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignMessageRequest, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            signMessageRequest: payload,
            signMessageResponse: 'cancel',
          },
          method: SatsConnectMethods.signMessageResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.sendBtcRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ...bitcoinApprovalParams(),
        ['sendBtcRequest', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.SendBtcTx, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            sendBtcRequest: payload,
            sendBtcResponse: 'cancel',
          },
          method: SatsConnectMethods.sendBtcResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.createInscriptionRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ['createInscription', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(RequestsRoutes.CreateInscription, urlParams);
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            createInscriptionRequest: payload,
            createInscriptionResponse: 'cancel',
          },
          method: SatsConnectMethods.createInscriptionResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    case SatsConnectMethods.createRepeatInscriptionsRequest: {
      const { urlParams, tabId } = makeSearchParamsWithDefaults(port, [
        ['createRepeatInscriptions', payload],
      ]);

      const { id } = await triggerRequestWindowOpen(
        RequestsRoutes.CreateRepeatInscriptions,
        urlParams,
      );
      listenForPopupClose({
        id,
        port,
        response: {
          source: MESSAGE_SOURCE,
          payload: {
            createRepeatInscriptionsRequest: payload,
            createRepeatInscriptionsResponse: 'cancel',
          },
          method: SatsConnectMethods.createRepeatInscriptionsResponse,
        },
      });
      listenForOriginTabClose({ tabId });
      break;
    }
    default: {
      break;
    }
  }
}
