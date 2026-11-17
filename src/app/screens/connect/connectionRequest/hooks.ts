/* eslint-disable import/prefer-default-export */
import { initPermissionsStore, saveStore } from '@common/utils/permissionsStore';
import { type Context } from '@common/utils/popup';
import { accountPurposeAddresses } from '@common/utils/rpc/btc/getAddresses/utils';
import {
  bitcoinApprovalSnapshot,
  connectorEnabled,
  isRegtestSessionUnlocked,
} from '@common/utils/rpc/btc/regtestApproval';
import { sendInternalErrorMessage } from '@common/utils/rpc/responseMessages/errors';
import {
  sendConnectSuccessResponseMessage,
  sendRequestPermissionsSuccessResponseMessage,
} from '@common/utils/rpc/responseMessages/wallet';
import useSelectedAccount from '@hooks/useSelectedAccount';
import useWalletSelector from '@hooks/useWalletSelector';
import type { ConnectRequestMessage, RequestPermissionsRequestMessage } from '@sats-connect/core';
import { AddressPurpose } from '@sats-connect/core';
import { permissions, type Permissions as TPermissions } from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import { useCallback } from 'react';

type Args = {
  context: Context;
  data: ConnectRequestMessage | RequestPermissionsRequestMessage;
};
export function useMakeHandleAccept({ context, data }: Args) {
  const account = useSelectedAccount();
  const { network } = useWalletSelector();

  return useCallback(async () => {
    if (context.localRegtestConnector) {
      const wallet = rootStore.store.getState().walletState;
      const tab = await chrome.tabs.get(context.tabId).catch(() => undefined);
      if (
        !connectorEnabled(wallet) ||
        context.bitcoinApproval !== bitcoinApprovalSnapshot(wallet) ||
        !(await isRegtestSessionUnlocked(wallet)) ||
        !tab?.url ||
        new URL(tab.url).origin !== context.origin
      ) {
        sendInternalErrorMessage({
          tabId: context.tabId,
          messageId: data.id,
          message: 'The Regtest connection changed.',
        });
        window.close();
        return;
      }
    }

    const [clientIdError, clientId] = permissions.utils.store.makeClientId({
      origin: context.origin,
    });
    if (clientIdError) {
      sendInternalErrorMessage({
        tabId: context.tabId,
        messageId: data.id,
        message: 'Error creating client ID.',
      });
      window.close();
      return;
    }

    const client: TPermissions.Store.Client = {
      id: clientId,
      origin: context.origin,
    };

    const accountId = permissions.utils.account.makeAccountId({
      accountId: account.id,
      networkType: network.type,
      masterPubKey: account.masterPubKey,
    });
    const resource = permissions.resources.account.makeAccountResource({
      accountId,
      masterPubKey: account.masterPubKey,
      networkType: network.type,
    });

    const accountPermission: TPermissions.Store.Permission = {
      type: 'account',
      clientId: client.id,
      resourceId: resource.id,
      actions: {
        read: true,
      },
    };

    const walletResource: TPermissions.Store.Resource = {
      type: 'wallet',
      id: 'wallet',
      name: 'Wallet',
    };

    const walletPermission: TPermissions.Store.Permission = {
      type: 'wallet',
      clientId: client.id,
      resourceId: 'wallet',
      actions: {
        readNetwork: true,
      },
    };

    try {
      const [error, store] = await initPermissionsStore();
      if (error) throw new Error('Could not load site permissions');
      const withClient = permissions.utils.store.addClient(store, client);
      const withAccount = permissions.utils.store.addResource(withClient, resource);
      const withWallet = permissions.utils.store.addResource(withAccount, walletResource);
      const nextStore = permissions.utils.store.setPermission(withWallet, accountPermission);
      await saveStore(permissions.utils.store.setPermission(nextStore, walletPermission));
    } catch (error) {
      sendInternalErrorMessage({
        tabId: context.tabId,
        messageId: data.id,
        message: error instanceof Error ? error.message : 'Could not save site permissions',
      });
      window.close();
      return;
    }

    if (data.method === 'wallet_requestPermissions')
      sendRequestPermissionsSuccessResponseMessage({
        messageId: data.id,
        tabId: context.tabId,
        result: true,
      });
    else {
      const purposes = (data.params?.addresses ?? Object.values(AddressPurpose)).filter(
        (purpose) => network.type !== 'Regtest' || purpose !== AddressPurpose.Stacks,
      );
      const addresses = accountPurposeAddresses(account, { type: 'select', purposes });

      sendConnectSuccessResponseMessage({
        messageId: data.id,
        tabId: context.tabId,
        result: {
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
        },
      });
    }

    window.close();
  }, [account, context, data.id, data.method, data.params, network.type]);
}
