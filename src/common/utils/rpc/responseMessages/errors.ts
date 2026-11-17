/* eslint-disable import/prefer-default-export */
import { RpcErrorCode } from '@sats-connect/core';
import { makeRPCError, sendRpcResponse } from '../helpers';
import type { BaseArgs } from './types';

type InvalidParametersMessageArgs = BaseArgs & {
  error?: unknown;
};
export function sendInvalidParametersResponseMessage({
  recipient,
  messageId,
  error,
}: InvalidParametersMessageArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.INVALID_PARAMS,
      message: `Invalid parameters.`,
      data: { error },
    }),
  );
}

export function sendInvalidStacksTransactionMessage({ recipient, messageId }: BaseArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.INVALID_PARAMS,
      message: 'Invalid Stacks transaction.',
    }),
  );
}

export function sendNetworkMismatchMessage({ recipient, messageId }: BaseArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.INVALID_REQUEST,
      message: 'Network mismatch.',
    }),
  );
}

export function sendAddressMismatchMessage({ recipient, messageId }: BaseArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.INVALID_REQUEST,
      message: 'Address mismatch.',
    }),
  );
}

export function sendInternalErrorMessage({
  recipient,
  messageId,
  message,
  data,
}: BaseArgs & { message?: string; data?: unknown }) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.INTERNAL_ERROR,
      message: message ?? 'Internal error.',
      data,
    }),
  );
}

export function sendUserRejectionMessage({ recipient, messageId }: BaseArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.USER_REJECTION,
      message: 'User rejected the request.',
    }),
  );
}

export function sendMissingFunctionArgumentsMessage({ recipient, messageId }: BaseArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.INVALID_REQUEST,
      message: 'Missing function arguments.',
    }),
  );
}
export function sendAccessDeniedResponseMessage({ recipient, messageId }: BaseArgs) {
  sendRpcResponse(
    recipient,
    makeRPCError(messageId, {
      code: RpcErrorCode.ACCESS_DENIED,
      message: 'Access denied.',
    }),
  );
}
