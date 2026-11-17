/* eslint-disable import/prefer-default-export */
import getSelectedAccount, { embellishAccountWithDetails } from '@common/utils/getSelectedAccount';
import { initPermissionsStore } from '@common/utils/permissionsStore';
import { makeContext, openPopup } from '@common/utils/popup';
import { AddressPurpose, type ConnectRequestMessage, type ConnectResult } from '@sats-connect/core';
import { permissions } from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import RequestsRoutes from '../../route-urls';
import { accountPurposeAddresses } from '../btc/getAddresses/utils';
import {
  bitcoinApprovalSnapshot,
  connectorEnabled,
  getRegtestOriginPermission,
  isRegtestSessionUnlocked,
} from '../btc/regtestApproval';
import { makeSendPopupClosedUserRejectionMessage } from '../helpers';
import { sendInternalErrorMessage } from '../responseMessages/errors';
import { sendConnectSuccessResponseMessage } from '../responseMessages/wallet';

export const handleConnect = async (
  message: ConnectRequestMessage,
  port: chrome.runtime.Port,
  localRegtestConnector = false,
) => {
  const context = makeContext(port);
  const { origin } = context;
  const state = rootStore.store.getState().walletState;
  // Check if the user already has account & network read permissions, and if
  // so, return the account data without opening the popup.
  //
  // Note: the checks performed in this file for the default permissions that
  // `wallet_connect` is expected to grant is decoupled from and needs to be
  // manually kept in sync with those granted in
  // `src/app/screens/connect/connectionRequest/hooks.ts`.

  const [error, store] = await initPermissionsStore();
  if (error) {
    sendInternalErrorMessage({
      recipient: port,
      messageId: message.id,
      message: 'Error loading permissions store.',
    });
    return;
  }

  const {
    selectedAccountIndex,
    selectedAccountType,
    accountsList: softwareAccountsList,
    ledgerAccountsList,
    keystoneAccountsList,
    network,
    btcPaymentAddressType,
  } = state;

  const account = getSelectedAccount({
    selectedAccountIndex,
    selectedAccountType,
    softwareAccountsList,
    ledgerAccountsList,
    keystoneAccountsList,
  });

  if (!account) {
    sendInternalErrorMessage({
      recipient: port,
      messageId: message.id,
      message: 'Failed to get selected account.',
    });
    return;
  }

  const [clientIdError, clientId] = permissions.utils.store.makeClientId({ origin });
  if (clientIdError) {
    sendInternalErrorMessage({
      recipient: port,
      messageId: message.id,
      message: 'Failed to create client ID during permissons check.',
    });
    return;
  }

  const accountId = permissions.utils.account.makeAccountId({
    accountId: account.id,
    masterPubKey: account.masterPubKey,
    networkType: network.type,
  });
  const resourceId = permissions.resources.account.makeAccountResourceId(accountId);

  const hasAccountReadPermissions = permissions.utils.store.hasPermission(store, {
    type: 'account',
    clientId,
    resourceId,
    actions: { read: true },
  });
  const hasNetworkReadPermissions = permissions.utils.store.hasPermission(store, {
    type: 'wallet',
    clientId,
    resourceId: 'wallet',
    actions: { readNetwork: true },
  });

  const isRegtest = network.type === 'Regtest';
  const purposes = (message.params?.addresses ?? Object.values(AddressPurpose)).filter(
    (purpose) => !isRegtest || purpose !== AddressPurpose.Stacks,
  );
  if (
    (isRegtest && !(await isRegtestSessionUnlocked(state))) ||
    !hasAccountReadPermissions ||
    !hasNetworkReadPermissions
  ) {
    await openPopup({
      path: RequestsRoutes.ConnectionRequest,
      data: { ...message, params: { ...message.params, addresses: purposes } },
      context: {
        ...context,
        localRegtestConnector,
        bitcoinApproval: localRegtestConnector ? bitcoinApprovalSnapshot(state) : undefined,
      },
      onClose: makeSendPopupClosedUserRejectionMessage({
        port,
        messageId: message.id,
      }),
    });
    return;
  }

  if (localRegtestConnector) {
    const latest = rootStore.store.getState().walletState;
    if (
      !connectorEnabled(latest) ||
      bitcoinApprovalSnapshot(latest) !== bitcoinApprovalSnapshot(state) ||
      !(await getRegtestOriginPermission(latest, origin))?.allowed ||
      latest !== rootStore.store.getState().walletState
    ) {
      throw new Error('The Regtest connection changed.');
    }
  }

  const embellishedAccount = embellishAccountWithDetails(account, btcPaymentAddressType);
  const addresses = accountPurposeAddresses(embellishedAccount, { type: 'select', purposes });
  const result: ConnectResult = {
    id: accountId,
    walletType: account.accountType ?? 'software',
    addresses,
    network: {
      bitcoin: {
        name: network.type,
      },
      stacks: {
        name: network.type,
      },
    },
  };
  sendConnectSuccessResponseMessage({
    recipient: port,
    messageId: message.id,
    result,
  });
};
