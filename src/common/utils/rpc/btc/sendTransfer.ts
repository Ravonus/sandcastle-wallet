/* eslint-disable import/prefer-default-export */
import { RpcErrorCode, type SendTransferRequestMessage } from '@sats-connect/core';
import { validateBtcAddress } from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import {
  listenForOriginTabClose,
  listenForPopupClose,
  makeSearchParamsWithDefaults,
  triggerRequestWindowOpen,
  type ParamsKeyValueArray,
} from '../../legacy-external-message-handler';
import RequestsRoutes from '../../route-urls';
import { makeRPCError, sendRpcResponse } from '../helpers';
import { bitcoinApprovalParams, regtestEndpointsReady } from './regtestApproval';

export const handleSendTransfer = async (
  message: SendTransferRequestMessage,
  port: chrome.runtime.Port,
  connector = false,
) => {
  const { network } = rootStore.store.getState().walletState;
  if (network.type === 'Regtest') {
    const { recipients } = message.params;
    const error = !regtestEndpointsReady(network)
      ? 'Set your regtest API URLs in Settings → Network'
      : !recipients.length ||
        recipients.some(
          ({ address, amount }) =>
            !validateBtcAddress({ btcAddress: address, network: network.type }) ||
            !Number.isSafeInteger(amount) ||
            amount <= 0,
        )
      ? 'Provide Regtest recipient addresses and positive integer satoshi amounts.'
      : undefined;
    if (error) {
      sendRpcResponse(
        port,
        makeRPCError(message.id, {
          code: RpcErrorCode.INVALID_PARAMS,
          message: error,
        }),
      );
      return;
    }
  }
  const requestParams: ParamsKeyValueArray = [
    ...bitcoinApprovalParams(connector),
    ['recipients', JSON.stringify(message.params.recipients)],
    ['requestId', message.id as string],
  ];

  const { urlParams, tabId } = makeSearchParamsWithDefaults(port, requestParams);

  const { id } = await triggerRequestWindowOpen(RequestsRoutes.SendBtcTx, urlParams);
  listenForPopupClose({
    port,
    id,
    response: makeRPCError(message.id, {
      code: RpcErrorCode.USER_REJECTION,
      message: 'User rejected request to send transfer',
    }),
  });
  listenForOriginTabClose({ tabId });
};
