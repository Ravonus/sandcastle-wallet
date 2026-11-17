/* eslint-disable import/prefer-default-export */
import { RpcErrorCode, type SignPsbtRequestMessage } from '@sats-connect/core';
import type { InputToSign } from '@secretkeylabs/xverse-core';
import {
  listenForOriginTabClose,
  listenForPopupClose,
  makeSearchParamsWithDefaults,
  triggerRequestWindowOpen,
  type ParamsKeyValueArray,
} from '../../legacy-external-message-handler';
import RequestsRoutes from '../../route-urls';
import { makeRPCError } from '../helpers';
import { bitcoinApprovalParams } from './regtestApproval';

export const handleSignPsbt = async (
  message: SignPsbtRequestMessage,
  port: chrome.runtime.Port,
  options?: {
    connector: true;
    inputsToSign?: InputToSign[];
    finalize?: boolean;
    purchaseOutpoint?: string;
  },
) => {
  const requestParams: ParamsKeyValueArray = [
    ['requestId', message.id as string],
    ...bitcoinApprovalParams(options?.connector),
    ['signInputs', JSON.stringify(message.params.signInputs)],
    ['connectorInputs', JSON.stringify(options?.inputsToSign)],
    ['finalize', options?.finalize ? 'true' : undefined],
    ['purchaseOutpoint', options?.purchaseOutpoint],
    ['psbt', message.params.psbt],
  ];

  if (message.params.broadcast) requestParams.push(['broadcast', String(message.params.broadcast)]);

  const { urlParams, tabId } = makeSearchParamsWithDefaults(port, requestParams);

  const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignBtcTx, urlParams);
  listenForPopupClose({
    port,
    id,
    response: makeRPCError(message.id, {
      code: RpcErrorCode.USER_REJECTION,
      message: 'User rejected request to sign a psbt',
    }),
  });

  listenForOriginTabClose({ tabId });
};
