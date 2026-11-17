/* eslint-disable import/prefer-default-export */
import { RpcErrorCode, type SignMessageRequestMessage } from '@sats-connect/core';
import SuperJSON from 'superjson';
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

export const handleSignMessage = async (
  message: SignMessageRequestMessage,
  port: chrome.runtime.Port,
  connector = false,
) => {
  const requestPayload = SuperJSON.stringify(message.params);

  const requestParams: ParamsKeyValueArray = [
    ...bitcoinApprovalParams(connector),
    ['payload', requestPayload],
    ['requestId', message.id as string],
  ];

  const { urlParams, tabId } = makeSearchParamsWithDefaults(port, requestParams);

  const { id } = await triggerRequestWindowOpen(RequestsRoutes.SignMessageRequest, urlParams);
  listenForPopupClose({
    tabId,
    id,
    response: makeRPCError(message.id, {
      code: RpcErrorCode.USER_REJECTION,
      message: 'User rejected request to sign Message',
    }),
  });
  listenForOriginTabClose({ tabId });
};
