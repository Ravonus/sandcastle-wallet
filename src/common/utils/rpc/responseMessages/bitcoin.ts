/* eslint-disable import/prefer-default-export */
/* eslint-disable import/prefer-default-export */
import type { Return } from '@sats-connect/core';
import { makeRpcSuccessResponse, sendRpcResponse } from '../helpers';
import type { BaseArgs } from './types';

type GetBalanceSuccess = BaseArgs & {
  result: Return<'getBalance'>;
};
export function sendGetBalanceSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetBalanceSuccess) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetAddressesSuccess = BaseArgs & {
  result: Return<'getAddresses'>;
};
export function sendGetAddressesSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetAddressesSuccess) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type SignMessageSuccess = BaseArgs & {
  result: Return<'signMessage'>;
};
export function sendSignMessageSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: SignMessageSuccess) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}
