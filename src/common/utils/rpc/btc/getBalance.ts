/* eslint-disable import/prefer-default-export */
import getBitcoinClients from '@common/utils/bitcoinClients';
import getSelectedAccount, { embellishAccountWithDetails } from '@common/utils/getSelectedAccount';
import { safePromise, type Result } from '@common/utils/safe';
import type { GetBalanceRequestMessage } from '@sats-connect/core';
import { type SettingsNetwork } from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import { sendGetBalanceSuccessResponseMessage } from '../responseMessages/bitcoin';
import { sendInternalErrorMessage } from '../responseMessages/errors';

async function getBalance(
  address: string,
  settings: SettingsNetwork,
): Promise<
  Result<{
    confirmed: number;
    unconfirmed: number;
    total: number;
  }>
> {
  const api = getBitcoinClients(settings).bitcoin;

  const [error, data] = await safePromise(api.getBalance(address));
  if (error) {
    return [error, null];
  }

  const confirmedBalance = data.finalBalance;
  const { unconfirmedBalance } = data;

  return [
    null,
    {
      confirmed: confirmedBalance,
      unconfirmed: unconfirmedBalance,
      total: confirmedBalance + unconfirmedBalance,
    },
  ];
}

export async function handleGetBalance(
  message: GetBalanceRequestMessage,
  port: chrome.runtime.Port,
) {
  const {
    selectedAccountIndex,
    selectedAccountType,
    accountsList: softwareAccountsList,
    ledgerAccountsList,
    keystoneAccountsList,
    network,
    btcPaymentAddressType,
  } = rootStore.store.getState().walletState;

  const account = getSelectedAccount({
    selectedAccountIndex,
    selectedAccountType,
    softwareAccountsList,
    ledgerAccountsList,
    keystoneAccountsList,
  });

  if (!account) {
    sendInternalErrorMessage({ recipient: port, messageId: message.id });
    return;
  }

  const detailedAccount = embellishAccountWithDetails(account, btcPaymentAddressType);

  const address = detailedAccount.btcAddress;
  const [getBalanceError, balances] = await getBalance(address, network);
  if (getBalanceError) {
    sendInternalErrorMessage({
      recipient: port,
      messageId: message.id,
      message: 'Error retrieving balance.',
    });
    return;
  }

  sendGetBalanceSuccessResponseMessage({
    recipient: port,
    messageId: message.id,
    result: {
      confirmed: balances.confirmed.toString(),
      unconfirmed: balances.unconfirmed.toString(),
      total: balances.total.toString(),
    },
  });
}
