import {
  disconnectedRegtestState,
  regtestMethods,
  type RegtestFundingUtxo,
} from '@common/types/regtestConnector';
import getBitcoinClients from '@common/utils/bitcoinClients';
import { contentScriptRpcResponseMessageName } from '@common/utils/messages/extensionToContentScript/schemas';
import { saveStore } from '@common/utils/permissionsStore';
import { makeContext } from '@common/utils/popup';
import { validateRegtestOrdEndpoint } from '@common/utils/regtestEndpoints';
import { sendPageReply } from '@common/utils/replyTarget';
import {
  AddressPurpose,
  MessageSigningProtocols,
  RpcErrorCode,
  rpcSuccessResponseMessageSchema,
  type RpcRequestMessage,
} from '@sats-connect/core';
import { base64, hex } from '@scure/base';
import { permissions, validateBtcAddress, type InputToSign } from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import type { WalletState } from '@stores/wallet/actions/types';
import * as v from 'valibot';
import { makeRPCError, sendRpcResponse } from '../helpers';
import { handleConnect } from '../wallet/connect';
import {
  bitcoinApprovalSnapshot,
  connectorEnabled,
  getRegtestOriginPermission,
  isRegtestSessionUnlocked,
  regtestEndpointsReady,
} from './regtestApproval';
import { handleSendTransfer } from './sendTransfer';
import { handleSignMessage } from './signMessage';
import { handleSignPsbt } from './signPsbt';

const inputsSchema = v.array(
  v.object({
    address: v.string(),
    index: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
    publicKey: v.optional(v.string()),
    sigHash: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(255))),
    sighashTypes: v.optional(
      v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(255))),
    ),
  }),
);

const psbtSchema = v.object({
  tx: v.string(),
  finalize: v.optional(v.boolean()),
  broadcast: v.optional(v.boolean()),
  inputsToSign: v.optional(inputsSchema),
  display: v.optional(
    v.object({
      kind: v.literal('btc_purchase'),
      assetOutpoint: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}:\d+$/i)),
      paymentAddress: v.string(),
      receiveAddress: v.string(),
    }),
  ),
});

const getState = (): WalletState => rootStore.store.getState().walletState;

async function getConnectorState(state: WalletState, origin: string) {
  const available = connectorEnabled(state);
  const disconnected = disconnectedRegtestState(available);
  if (!available || !(await isRegtestSessionUnlocked(state))) return disconnected;

  const grant = await getRegtestOriginPermission(state, origin);
  if (!grant?.allowed || state !== getState()) return disconnected;
  const { account } = grant;
  return {
    ...disconnected,
    connected: true,
    configured: true,
    address: account.ordinalsAddress,
    paymentAddress: account.btcAddress,
    publicKey: account.ordinalsPublicKey.slice(-64),
    paymentPublicKey: account.btcPublicKey,
  };
}

export default async function handleRegtestConnector(
  message: RpcRequestMessage,
  port: chrome.runtime.Port,
) {
  const { origin } = makeContext(port);
  const state = getState();
  // All results except the normal approval results are generated in the worker.
  const reply = (result: unknown) => {
    const response = v.parse(rpcSuccessResponseMessageSchema, {
      jsonrpc: '2.0',
      id: message.id,
      result,
    });
    sendPageReply(port, { type: contentScriptRpcResponseMessageName, data: response });
  };
  const request = { jsonrpc: '2.0', id: message.id } as const;

  try {
    if (typeof message.id !== 'string') throw new Error('Invalid request ID');
    if (message.method === regtestMethods.state) {
      reply(await getConnectorState(state, origin));
      return;
    }
    if (!connectorEnabled(state)) throw new Error('The local regtest test connector is disabled.');

    const approval = { ...request, id: message.id };
    if (message.method === regtestMethods.connect) {
      await handleConnect(
        {
          ...approval,
          method: 'wallet_connect',
          params: { addresses: [AddressPurpose.Ordinals, AddressPurpose.Payment] },
        },
        port,
        true,
      );
      return;
    }

    const grant = await getRegtestOriginPermission(state, origin);
    if (message.method === regtestMethods.disconnect) {
      if (grant) await saveStore(permissions.utils.store.removeClient(grant.store, grant.clientId));
      reply(disconnectedRegtestState(connectorEnabled(getState())));
      return;
    }
    if (!grant?.allowed || !(await isRegtestSessionUnlocked(state))) {
      throw new Error('Connect and unlock the selected Regtest software wallet first.');
    }
    const current = getState();
    if (
      !connectorEnabled(current) ||
      bitcoinApprovalSnapshot(current) !== bitcoinApprovalSnapshot(state)
    ) {
      throw new Error('Wallet settings changed. Retry the request.');
    }

    const { account } = grant;
    switch (message.method) {
      case regtestMethods.getUtxos: {
        const { address = account.btcAddress } = v.parse(
          v.object({ address: v.optional(v.string()) }),
          message.params,
        );
        if (address !== account.btcAddress) throw new Error('Use the connected payment address');
        if (!regtestEndpointsReady(state.network))
          throw new Error('Configure both Regtest API URLs');
        const { bitcoin, regtestOrdinals } = getBitcoinClients(state.network);
        const utxos = await bitcoin.getUnspentUtxos(address);
        const confirmed = utxos.filter(({ status }) => status.confirmed);
        const verdicts = await Promise.all(
          confirmed.map((utxo) => regtestOrdinals!.getSpendStatus(utxo)),
        );
        if (
          confirmed.length &&
          verdicts.every((verdict) => verdict === 'unknown') &&
          !(await validateRegtestOrdEndpoint(state.network.ordApiUrl ?? ''))
        ) {
          throw new Error('The configured Ord API is unavailable.');
        }
        const available = await Promise.all(
          confirmed.map(
            (utxo, index) => verdicts[index] === 'clean' && bitcoin.isRegtestFundingAvailable(utxo),
          ),
        );
        const eligible = confirmed.flatMap<RegtestFundingUtxo>((utxo, index) => {
          const height = utxo.status.block_height;
          if (
            height === undefined ||
            !Number.isSafeInteger(height) ||
            height < 0 ||
            !Number.isSafeInteger(utxo.value) ||
            utxo.value <= 0 ||
            !available[index]
          )
            return [];
          return [
            {
              txid: utxo.txid,
              vout: utxo.vout,
              valueSats: utxo.value,
              blockHeight: height,
              value: utxo.value,
              status: { confirmed: true, block_height: height },
            },
          ];
        });
        const latest = getState();
        if (
          !connectorEnabled(latest) ||
          bitcoinApprovalSnapshot(latest) !== bitcoinApprovalSnapshot(state) ||
          !(await getConnectorState(latest, origin)).connected
        ) {
          throw new Error('Wallet connection changed. Retry the request.');
        }
        reply(eligible);
        return;
      }
      case regtestMethods.signMessage: {
        const {
          address = account.ordinalsAddress,
          message: text,
          protocol = 'bip322',
        } = v.parse(
          v.object({
            address: v.optional(v.string()),
            message: v.string(),
            protocol: v.optional(v.picklist(['bip322', 'ecdsa'])),
          }),
          message.params,
        );
        if (address !== account.btcAddress && address !== account.ordinalsAddress) {
          throw new Error('The signing address is outside the connected account.');
        }
        if (address === account.ordinalsAddress && protocol !== 'bip322') {
          throw new Error('Taproot message signing requires BIP322.');
        }
        await handleSignMessage(
          {
            ...approval,
            method: 'signMessage',
            params: {
              address,
              message: text,
              protocol:
                protocol === 'bip322'
                  ? MessageSigningProtocols.BIP322
                  : MessageSigningProtocols.ECDSA,
            },
          },
          port,
          true,
        );
        return;
      }
      case regtestMethods.signPsbt: {
        const { tx, finalize, broadcast, inputsToSign, display } = v.parse(
          psbtSchema,
          message.params,
        );
        if (broadcast && finalize === false) throw new Error('Broadcast requires finalization.');
        const psbt = /^70736274ff[0-9a-f]*$/i.test(tx) ? base64.encode(hex.decode(tx)) : tx;
        const inputs: InputToSign[] | undefined = inputsToSign?.map((input) => {
          const key =
            input.address === account.btcAddress
              ? account.btcPublicKey
              : input.address === account.ordinalsAddress
              ? account.ordinalsPublicKey.slice(-64)
              : undefined;
          if (
            !key ||
            (input.publicKey !== undefined && input.publicKey.toLowerCase() !== key.toLowerCase())
          ) {
            throw new Error('A PSBT signing descriptor does not match the connected account.');
          }
          return {
            address: input.address,
            signingIndexes: [input.index],
            sigHash: input.sigHash,
            sighashTypes: input.sighashTypes,
          };
        });
        await handleSignPsbt(
          {
            ...approval,
            method: 'signPsbt',
            params: { psbt, signInputs: {}, broadcast },
          },
          port,
          {
            connector: true,
            inputsToSign: inputs,
            finalize,
            purchaseOutpoint:
              display?.paymentAddress === account.btcAddress &&
              display.receiveAddress === account.ordinalsAddress
                ? display.assetOutpoint
                : undefined,
          },
        );
        return;
      }
      case regtestMethods.send: {
        const { to, amount } = v.parse(
          v.object({
            to: v.string(),
            amount: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
          }),
          message.params,
        );
        if (!validateBtcAddress({ btcAddress: to, network: 'Regtest' })) {
          throw new Error('Invalid Regtest Bitcoin address.');
        }
        await handleSendTransfer(
          {
            ...approval,
            method: 'sendTransfer',
            params: { recipients: [{ address: to, amount }] },
          },
          port,
          true,
        );
        return;
      }
      default:
        throw new Error('Unsupported local regtest test connector method.');
    }
  } catch (error) {
    sendRpcResponse(
      port,
      makeRPCError(message.id, {
        code: RpcErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
