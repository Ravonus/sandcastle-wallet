import {
  DomEventName,
  type AuthenticationRequestEventDetails,
  type SignatureRequestEventDetails,
  type TransactionRequestEventDetails,
} from '@common/types/inpage-types';
import {
  StacksLegacyMethods,
  type AuthenticationResponseMessage,
  type SignatureResponseMessage,
  type TransactionResponseMessage,
} from '@common/types/message-types';
import type { StacksProvider } from '@stacks/connect';
import { getExtensionUrl, requestLegacy } from './utils';

declare const VERSION: string;

const StacksMethodsProvider: Partial<StacksProvider> = {
  getURL: getExtensionUrl,
  structuredDataSignatureRequest: async (signatureRequest) => {
    const event = new CustomEvent<SignatureRequestEventDetails>(
      DomEventName.structuredDataSignatureRequest,
      {
        detail: { signatureRequest },
      },
    );
    const { signatureResponse } = await requestLegacy<SignatureResponseMessage>(
      event,
      StacksLegacyMethods.signatureResponse,
      { signatureRequest },
    );
    if (signatureResponse === 'cancel') return Promise.reject(signatureResponse);
    if (typeof signatureResponse === 'string') throw new Error('Invalid wallet response');
    return signatureResponse;
  },
  signatureRequest: async (signatureRequest) => {
    const event = new CustomEvent<SignatureRequestEventDetails>(DomEventName.signatureRequest, {
      detail: { signatureRequest },
    });
    const { signatureResponse } = await requestLegacy<SignatureResponseMessage>(
      event,
      StacksLegacyMethods.signatureResponse,
      { signatureRequest },
    );
    if (signatureResponse === 'cancel') return Promise.reject(signatureResponse);
    if (typeof signatureResponse === 'string') throw new Error('Invalid wallet response');
    return signatureResponse;
  },
  authenticationRequest: async (authenticationRequest) => {
    const event = new CustomEvent<AuthenticationRequestEventDetails>(
      DomEventName.authenticationRequest,
      {
        detail: { authenticationRequest },
      },
    );
    const { authenticationResponse } = await requestLegacy<AuthenticationResponseMessage>(
      event,
      StacksLegacyMethods.authenticationResponse,
      { authenticationRequest },
    );
    if (authenticationResponse === 'cancel') return Promise.reject(authenticationResponse);
    if (typeof authenticationResponse !== 'string') throw new Error('Invalid wallet response');
    return authenticationResponse;
  },
  transactionRequest: async (transactionRequest) => {
    const event = new CustomEvent<TransactionRequestEventDetails>(DomEventName.transactionRequest, {
      detail: { transactionRequest },
    });
    const { transactionResponse } = await requestLegacy<TransactionResponseMessage>(
      event,
      StacksLegacyMethods.transactionResponse,
      { transactionRequest },
    );
    if (transactionResponse === 'cancel') return Promise.reject(transactionResponse);
    if (typeof transactionResponse === 'string') throw new Error('Invalid wallet response');
    return transactionResponse;
  },
  getProductInfo() {
    return {
      version: VERSION,
      name: 'Sandcastle Wallet',
    };
  },
  request(): Promise<Record<string, any>> {
    throw new Error('`request` function is not implemented');
  },
};

export default StacksMethodsProvider;
