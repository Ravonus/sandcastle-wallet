import { type GetInfoRequestMessage, type Return } from '@sats-connect/core';
import { getTabIdFromPort } from '..';
import { makeRpcSuccessResponse, sendRpcResponse } from './helpers';

declare const VERSION: string;

async function handleGetInfo(
  message: GetInfoRequestMessage,
  port: chrome.runtime.Port,
  methods: string[],
) {
  const response: Return<'getInfo'> = {
    version: VERSION,

    methods,
    supports: [],
  };
  sendRpcResponse(getTabIdFromPort(port), makeRpcSuccessResponse(message.id, response));
}

export default handleGetInfo;
