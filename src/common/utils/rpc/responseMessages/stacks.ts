import type { Return } from '@sats-connect/core';
import { makeRpcSuccessResponse, sendRpcResponse } from '../helpers';
import type { BaseArgs } from './types';

type SignTransactionSuccessArgs = BaseArgs & {
  result: Return<'stx_signTransaction'>;
};
export function sendSignTransactionSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: SignTransactionSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type CallContractSuccessArgs = BaseArgs & {
  result: Return<'stx_callContract'>;
};
export function sendCallContractSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: CallContractSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type StxTransferSuccessArgs = BaseArgs & {
  result: Return<'stx_transferStx'>;
};
export function sendStxTransferSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: StxTransferSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetAccountsSuccess = BaseArgs & {
  result: Return<'stx_getAccounts'>;
};
export function sendGetAccountsSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetAccountsSuccess) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetAddressesSuccess = BaseArgs & {
  result: Return<'stx_getAddresses'>;
};
export function sendGetAddressesSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetAddressesSuccess) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type DeployContractSuccessArgs = BaseArgs & {
  result: Return<'stx_deployContract'>;
};
export function sendDeployContractSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: DeployContractSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type SignTransactionsSuccessArgs = BaseArgs & {
  result: Return<'stx_signTransactions'>;
};
export function sendSignTransactionsSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: SignTransactionsSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}
