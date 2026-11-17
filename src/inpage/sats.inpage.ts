import {
  DomEventName,
  type CreateInscriptionEventDetails,
  type CreateRepeatInscriptionsEventDetails,
  type GetAddressRequestEventDetails,
  type SendBtcRequestEventDetails,
  type SignBatchPsbtRequestEventDetails,
  type SignMessageRequestEventDetails,
  type SignPsbtRequestEventDetails,
} from '@common/types/inpage-types';
import {
  SatsConnectMethods,
  type CreateInscriptionResponseMessage,
  type CreateRepeatInscriptionsResponseMessage,
  type GetAddressResponseMessage,
  type SendBtcResponseMessage,
  type SignBatchPsbtResponseMessage,
  type SignMessageResponseMessage,
  type SignPsbtResponseMessage,
} from '@common/types/message-types';
import { contentScriptRpcResponseMessageName } from '@common/utils/messages/extensionToContentScript/schemas';
import {
  rpcResponseMessageSchema,
  type BitcoinProvider,
  type CreateInscriptionResponse,
  type CreateRepeatInscriptionsResponse,
  type GetAddressResponse,
  type Params,
  type Requests,
  type RpcRequest,
  type RpcResponse,
  type SignMultipleTransactionsResponse,
  type SignTransactionResponse,
} from '@sats-connect/core';
import { nanoid } from 'nanoid';
import * as v from 'valibot';
import { addListener } from './eventHandlers';
import { requestLegacy, waitForPageResponse } from './utils';

const SatsMethodsProvider: BitcoinProvider = {
  connect: async (btcAddressRequest): Promise<GetAddressResponse> => {
    const event = new CustomEvent<GetAddressRequestEventDetails>(DomEventName.getAddressRequest, {
      detail: { btcAddressRequest },
    });
    const { addressResponse } = await requestLegacy<GetAddressResponseMessage>(
      event,
      SatsConnectMethods.getAddressResponse,
      { addressRequest: btcAddressRequest },
    );
    if (addressResponse === 'cancel') return Promise.reject(addressResponse);
    if (typeof addressResponse === 'string') throw new Error('Invalid wallet response');
    return addressResponse;
  },
  signTransaction: async (signPsbtRequest: string): Promise<SignTransactionResponse> => {
    const event = new CustomEvent<SignPsbtRequestEventDetails>(DomEventName.signPsbtRequest, {
      detail: { signPsbtRequest },
    });
    const { signPsbtResponse } = await requestLegacy<SignPsbtResponseMessage>(
      event,
      SatsConnectMethods.signPsbtResponse,
      { signPsbtRequest },
    );
    if (signPsbtResponse === 'cancel') return Promise.reject(signPsbtResponse);
    if (typeof signPsbtResponse === 'string') throw new Error('Invalid wallet response');
    return signPsbtResponse;
  },
  signMultipleTransactions: async (
    signBatchPsbtRequest: string,
  ): Promise<SignMultipleTransactionsResponse> => {
    const event = new CustomEvent<SignBatchPsbtRequestEventDetails>(
      DomEventName.signBatchPsbtRequest,
      {
        detail: { signBatchPsbtRequest },
      },
    );
    const { signBatchPsbtResponse } = await requestLegacy<SignBatchPsbtResponseMessage>(
      event,
      SatsConnectMethods.signBatchPsbtResponse,
      { signBatchPsbtRequest },
    );
    if (signBatchPsbtResponse === 'cancel') return Promise.reject(signBatchPsbtResponse);
    if (typeof signBatchPsbtResponse === 'string') throw new Error('Invalid wallet response');
    return signBatchPsbtResponse;
  },
  signMessage: async (signMessageRequest: string): Promise<string> => {
    const event = new CustomEvent<SignMessageRequestEventDetails>(DomEventName.signMessageRequest, {
      detail: { signMessageRequest },
    });
    const { signMessageResponse } = await requestLegacy<SignMessageResponseMessage>(
      event,
      SatsConnectMethods.signMessageResponse,
      { signMessageRequest },
    );
    if (signMessageResponse === 'cancel') return Promise.reject(signMessageResponse);
    if (typeof signMessageResponse !== 'string') throw new Error('Invalid wallet response');
    return signMessageResponse;
  },
  sendBtcTransaction: async (sendBtcRequest: string): Promise<string> => {
    const event = new CustomEvent<SendBtcRequestEventDetails>(DomEventName.sendBtcRequest, {
      detail: { sendBtcRequest },
    });
    const { sendBtcResponse } = await requestLegacy<SendBtcResponseMessage>(
      event,
      SatsConnectMethods.sendBtcResponse,
      { sendBtcRequest },
    );
    if (sendBtcResponse === 'cancel') return Promise.reject(sendBtcResponse);
    if (typeof sendBtcResponse !== 'string') throw new Error('Invalid wallet response');
    return sendBtcResponse;
  },
  createInscription: async (
    createInscriptionRequest: string,
  ): Promise<CreateInscriptionResponse> => {
    const event = new CustomEvent<CreateInscriptionEventDetails>(
      DomEventName.createInscriptionRequest,
      {
        detail: { createInscriptionRequest },
      },
    );
    const { createInscriptionResponse } = await requestLegacy<CreateInscriptionResponseMessage>(
      event,
      SatsConnectMethods.createInscriptionResponse,
      { createInscriptionRequest },
    );
    if (createInscriptionResponse === 'cancel') return Promise.reject(createInscriptionResponse);
    if (typeof createInscriptionResponse === 'string') throw new Error('Invalid wallet response');
    return createInscriptionResponse;
  },
  createRepeatInscriptions: async (
    createRepeatInscriptionsRequest: string,
  ): Promise<CreateRepeatInscriptionsResponse> => {
    const event = new CustomEvent<CreateRepeatInscriptionsEventDetails>(
      DomEventName.createRepeatInscriptionsRequest,
      {
        detail: { createRepeatInscriptionsRequest },
      },
    );
    const { createRepeatInscriptionsResponse } =
      await requestLegacy<CreateRepeatInscriptionsResponseMessage>(
        event,
        SatsConnectMethods.createRepeatInscriptionsResponse,
        { createRepeatInscriptionsRequest },
      );
    if (createRepeatInscriptionsResponse === 'cancel')
      return Promise.reject(createRepeatInscriptionsResponse);
    if (typeof createRepeatInscriptionsResponse === 'string')
      throw new Error('Invalid wallet response');
    return createRepeatInscriptionsResponse;
  },
  request: async <Method extends keyof Requests>(
    method: Method,
    params: Params<Method>,
  ): Promise<RpcResponse<Method>> => {
    const id = nanoid();
    const rpcRequest: RpcRequest<Method, Params<Method>> = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    const rpcRequestEvent = new CustomEvent(DomEventName.rpcRequest, { detail: rpcRequest });
    return waitForPageResponse(
      contentScriptRpcResponseMessageName,
      () => document.dispatchEvent(rpcRequestEvent),
      (data) => {
        const parsed = v.safeParse(rpcResponseMessageSchema, data);
        // JSON-RPC responses carry the request ID, so the method is bound by that ID.
        if (parsed.success && parsed.output.id === id) {
          return parsed.output as RpcResponse<Method>;
        }
        return undefined;
      },
    );
  },
  addListener,
};
export default SatsMethodsProvider;
