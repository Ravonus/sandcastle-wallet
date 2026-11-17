import { contentScriptRpcResponseMessageName } from '@common/utils/messages/extensionToContentScript/schemas';
import {
  RpcErrorCode,
  type Requests,
  type Return,
  type RpcError,
  type RpcErrorResponse,
  type RpcId,
  type RpcSuccessResponse,
} from '@sats-connect/core';
import { error, permissions, success, type Result } from '@secretkeylabs/xverse-core';
import { getOriginFromPort } from '..';
import { initPermissionsStore, saveStore } from '../permissionsStore';
import { sendPageReply } from '../replyTarget';

export const makeRPCError = (id: RpcId, e: RpcError): RpcErrorResponse => ({
  jsonrpc: '2.0',
  id,
  error: e,
});

export const makeRpcSuccessResponse = <Method extends keyof Requests>(
  id: RpcId,
  result: Return<Method>,
): RpcSuccessResponse<Method> => ({
  id,
  result,
  jsonrpc: '2.0',
});

export function sendRpcResponse<Method extends keyof Requests>(
  recipient: number | chrome.runtime.Port,
  response: RpcSuccessResponse<Method> | RpcErrorResponse,
) {
  sendPageReply(recipient, {
    type: contentScriptRpcResponseMessageName,
    data: response,
  });
}

// TODO: this would probably be better off in another file
export function makeSendPopupClosedUserRejectionMessage({
  port,
  messageId,
}: {
  port: chrome.runtime.Port;
  messageId: RpcId;
}) {
  const message = makeRPCError(messageId, {
    code: RpcErrorCode.USER_REJECTION,
    message: 'User closed the wallet popup.',
  });
  return () => sendRpcResponse(port, message);
}

/**
 * Update the last used time for the client. Must be run within the permissions store mutex.
 */
export async function updateClientLastUsedTime(port: chrome.runtime.Port): Promise<Result<void>> {
  const [storeError, store] = await initPermissionsStore();
  if (storeError)
    return error({
      name: 'LoadStoreError',
      message: 'Error loading permissions store.',
    });

  const origin = getOriginFromPort(port);
  const [clientIdError, clientId] = permissions.utils.store.makeClientId({ origin });
  if (clientIdError)
    return error({
      name: 'ClientIdError',
      message: 'Failed to create client ID during permissions check.',
    });

  const nextStore = permissions.utils.store.setClientMetadata(store, {
    clientId,
    lastUsed: new Date().getTime(),
  });
  saveStore(nextStore);

  return success(undefined);
}
