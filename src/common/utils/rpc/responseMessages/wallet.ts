import type { ConnectResult, Return } from '@sats-connect/core';
import { makeRpcSuccessResponse, sendRpcResponse } from '../helpers';
import type { BaseArgs } from './types';

type RequestPermissionsSuccessArgs = BaseArgs & {
  result: Return<'wallet_requestPermissions'>;
};
export function sendRequestPermissionsSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: RequestPermissionsSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type RenouncePermissionsSuccessArgs = BaseArgs & {
  result: Return<'wallet_renouncePermissions'>;
};
export function sendRenouncePermissionsSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: RenouncePermissionsSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetWalletTypeSuccessArgs = BaseArgs & {
  result: Return<'wallet_getWalletType'>;
};
export function sendGetWalletTypeSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetWalletTypeSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetPermissionsSuccessArgs = BaseArgs & {
  result: Return<'wallet_getCurrentPermissions'>;
};
export function sendGetCurrentPermissionsSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetPermissionsSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetAccountSuccessArgs = BaseArgs & {
  result: Return<'wallet_getAccount'>;
};
export function sendGetAccountSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetAccountSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type ConnectSuccessArgs = BaseArgs & {
  result: Return<'wallet_connect'>;
};
export function sendConnectSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: ConnectSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}

type GetNetworkSuccessArgs = BaseArgs & {
  result: Return<'wallet_getNetwork'>;
};
export function sendGetNetworkSuccessResponseMessage({
  recipient,
  messageId,
  result,
}: GetNetworkSuccessArgs) {
  sendRpcResponse(recipient, makeRpcSuccessResponse(messageId, result));
}
