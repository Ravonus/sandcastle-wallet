import { RpcErrorCode, type RpcRequestMessage } from '@sats-connect/core';
import { safePromise } from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import { getTabIdFromPort } from '..';
import { router } from './handlerRouter';
import { router as runesRouter } from './handlerRouter/runes';
import { router as stacksRouter } from './handlerRouter/stacks';
import { makeRPCError, sendRpcResponse, updateClientLastUsedTime } from './helpers';

async function handleRPCRequest(message: RpcRequestMessage, port: chrome.runtime.Port) {
  const { network } = rootStore.store.getState().walletState;
  const unsupported =
    network.type === 'Regtest' &&
    (Object.hasOwn(stacksRouter, message.method) || Object.hasOwn(runesRouter, message.method));
  const handler =
    !unsupported && Object.hasOwn(router, message.method) ? router[message.method] : undefined;
  if (!handler)
    return sendRpcResponse(
      getTabIdFromPort(port),
      makeRPCError(message.id as string, {
        code: RpcErrorCode.METHOD_NOT_FOUND,
        message: `"${message.method}" is not supported.`,
      }),
    );

  const [updateLastUsedTimeError] = await updateClientLastUsedTime(port);
  if (updateLastUsedTimeError) {
    sendRpcResponse(
      getTabIdFromPort(port),
      makeRPCError(message.id as string, {
        code: RpcErrorCode.INTERNAL_ERROR,
        message: 'Error updating client last used time.',
      }),
    );
    return;
  }

  const [handlerError] = await safePromise(handler(message, port));
  if (handlerError)
    return sendRpcResponse(
      getTabIdFromPort(port),
      makeRPCError(message.id as string, {
        code: RpcErrorCode.INTERNAL_ERROR,
        message: 'RPC handler error',
        data: handlerError.data,
      }),
    );
}

export default handleRPCRequest;
