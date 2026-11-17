import { MESSAGE_SOURCE, SatsConnectMethods } from '@common/types/message-types';
import { assertBitcoinApproval } from '@common/utils/rpc/btc/regtestApproval';
import { makeRPCError, makeRpcSuccessResponse, sendRpcResponse } from '@common/utils/rpc/helpers';
import useTransactionContext from '@hooks/useTransactionContext';
import useWalletSelector from '@hooks/useWalletSelector';
import {
  BitcoinNetworkType,
  RpcErrorCode,
  type Return,
  type SignTransactionOptions,
  type SignTransactionPayload,
} from '@sats-connect/core';
import { base64 } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { btcTransaction, type InputToSign, type SettingsNetwork } from '@secretkeylabs/xverse-core';
import { decodeToken } from 'jsontokens';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import useBtcClient from '../../hooks/apiClients/useBtcClient';

export type PsbtApprovalPayload = Omit<SignTransactionPayload, 'inputsToSign'> & {
  inputsToSign?: InputToSign[];
  finalize?: boolean;
};

const useSignPsbtParams = (network: SettingsNetwork) => {
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const tabId = params.get('tabId') ?? '0';
  const requestId = params.get('requestId') ?? '';
  const location = useLocation();

  const { requestToken, payload } = useMemo(() => {
    const token = params.get('signPsbtRequest') ?? '';
    const magicEdenPsbt = params.get('magicEdenPsbt') ?? '';
    if (token) {
      const request = decodeToken(token) as any as SignTransactionOptions;
      return {
        payload: request.payload,
        requestToken: token,
      };
    }
    if (magicEdenPsbt) {
      const { payload: magicEdenPayload } = location.state;
      return {
        payload: magicEdenPayload,
        requestToken: null,
      };
    }
    const signInputs = JSON.parse(params.get('signInputs') || '{}') as Record<string, number[]>;
    const inputsToSign: InputToSign[] = Object.keys(signInputs).map((address) => ({
      address,
      signingIndexes: signInputs[address],
    }));
    const isConnector = params.get('localRegtestConnector') === 'true';
    const connectorInputs = params.get('connectorInputs');
    const rpcPayload: PsbtApprovalPayload = {
      psbtBase64: params.get('psbt') ?? '',
      inputsToSign: isConnector
        ? connectorInputs
          ? JSON.parse(connectorInputs)
          : undefined
        : inputsToSign,
      broadcast: params.get('broadcast') === 'true',
      finalize: params.get('finalize') === 'true',
      message: params.get('message') ?? '',
      network: {
        type: BitcoinNetworkType[network.type],
      },
    };
    return {
      payload: rpcPayload,
      requestToken: null,
    };
  }, []);

  return { payload: payload as PsbtApprovalPayload, tabId, requestToken, requestId, params };
};

const useSignPsbt = () => {
  const { network } = useWalletSelector();
  const btcClient = useBtcClient();
  const { payload, tabId, requestToken, requestId, params } = useSignPsbtParams(network);

  const txnContext = useTransactionContext();

  const parsedPsbt = useMemo(() => {
    try {
      if (!payload) return;
      return new btcTransaction.EnhancedPsbt(txnContext, payload.psbtBase64, payload.inputsToSign);
    } catch (err) {
      return undefined;
    }
  }, [txnContext, payload]);

  const confirmSignPsbt = async (signingResponse: string) => {
    if (!signingResponse) return;
    await assertBitcoinApproval(params);

    let txId: string = '';

    if (payload.broadcast && signingResponse) {
      const txn = btc.Transaction.fromPSBT(base64.decode(signingResponse), {
        allowUnknownInputs: network.type === 'Regtest',
        allowUnknownOutputs: network.type === 'Regtest',
      });
      const txHex = txn.hex;
      const response = await btcClient.sendRawTransaction(txHex);
      txId = response.tx.hash;
    }

    if (requestToken) {
      const signingMessage = {
        source: MESSAGE_SOURCE,
        method: SatsConnectMethods.signPsbtResponse,
        payload: {
          signPsbtRequest: requestToken,
          signPsbtResponse: {
            psbtBase64: signingResponse,
            txId,
          },
        },
      };
      chrome.tabs.sendMessage(+tabId, signingMessage);
    } else {
      const result: Return<'signPsbt'> = {
        psbt: signingResponse,
        txid: txId,
      };
      const response = makeRpcSuccessResponse(requestId as string, result);
      sendRpcResponse(+tabId, response);
    }

    return {
      txId,
      signingResponse,
    };
  };

  /**
   * User cancels the sign psbt request
   */
  const cancelSignPsbt = () => {
    if (requestToken) {
      const signingMessage = {
        source: MESSAGE_SOURCE,
        method: SatsConnectMethods.signPsbtResponse,
        payload: { signPsbtRequest: requestToken, signPsbtResponse: 'cancel' },
      };
      chrome.tabs.sendMessage(+tabId, signingMessage);
    } else {
      const cancelError = makeRPCError(requestId as string, {
        code: RpcErrorCode.USER_REJECTION,
        message: 'User rejected request to sign Psbt',
      });
      sendRpcResponse(+tabId, cancelError);
    }
  };

  /**
   * User closes request validation error
   */
  const onCloseError = (error: string) => {
    if (requestToken) {
      cancelSignPsbt();
      return;
    }
    const requestError = makeRPCError(requestId, {
      code: RpcErrorCode.INTERNAL_ERROR,
      message: error,
    });
    sendRpcResponse(+tabId, requestError);
  };

  const getSigningAddresses = (inputsToSign: InputToSign[]) => {
    const signingAddresses: Array<string> = [];
    inputsToSign.forEach((inputToSign) => {
      inputToSign.signingIndexes.forEach((signingIndex) => {
        signingAddresses[signingIndex] = inputToSign.address;
      });
    });
    return signingAddresses;
  };

  return {
    payload,
    parsedPsbt,
    tabId,
    requestId,
    requestToken,
    params,
    txnContext,
    getSigningAddresses,
    confirmSignPsbt,
    cancelSignPsbt,
    onCloseError,
  };
};

export default useSignPsbt;
