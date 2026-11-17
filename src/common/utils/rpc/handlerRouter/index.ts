/* eslint-disable import/prefer-default-export */
import {
  getInfoMethodName,
  getInfoRequestMessageSchema,
  type RpcRequestMessage,
} from '@sats-connect/core';
import handleGetInfo from '../getInfo';
import { validateMessageSchema } from '../messageMiddlewares';
import { router as bitcoinRouter } from './bitcoin';
import { router as ordinalsRouter } from './ordinals';
import { router as runesRouter } from './runes';
import { router as stacksRouter } from './stacks';
import { router as walletRouter } from './wallet';

export type Handler = (message: RpcRequestMessage, port: chrome.runtime.Port) => Promise<void>;

export const router: Record<string, Handler> = {
  [getInfoMethodName]: validateMessageSchema(getInfoRequestMessageSchema, (message, port) =>
    handleGetInfo(message, port, Object.keys(router)),
  ),
  ...walletRouter,
  ...bitcoinRouter,
  ...stacksRouter,
  ...runesRouter,
  ...ordinalsRouter,
};
