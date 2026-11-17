import getSelectedAccount, { embellishAccountWithDetails } from '@common/utils/getSelectedAccount';
import { initPermissionsStore } from '@common/utils/permissionsStore';
import {
  permissions,
  SeedVaultStorageKeys,
  type SettingsNetwork,
} from '@secretkeylabs/xverse-core';
import rootStore from '@stores/index';
import type { WalletState } from '@stores/wallet/actions/types';

export async function waitForWalletState() {
  const { persistor } = rootStore;
  if (persistor.getState().bootstrapped) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        unsubscribe();
        resolve();
      }
    });
  });
}

export function getActiveBitcoinAccount(state: WalletState) {
  const account = getSelectedAccount({
    ...state,
    softwareAccountsList: state.accountsList,
  });
  return account && embellishAccountWithDetails(account, state.btcPaymentAddressType);
}

export function connectorEnabled(state: WalletState) {
  return state.network.type === 'Regtest' && state.exposeLocalRegtestConnector === true;
}

export function regtestEndpointsReady(settings: SettingsNetwork) {
  return !!(settings.btcApiUrl && settings.ordApiUrl);
}

export async function isRegtestSessionUnlocked(state: WalletState) {
  if (!state.isUnlocked) return false;
  const session = await chrome.storage.session.get([
    SeedVaultStorageKeys.PASSWORD_HASH,
    'sessionStartTime',
  ]);
  return (
    !!session[SeedVaultStorageKeys.PASSWORD_HASH] &&
    Date.now() < Number(session.sessionStartTime) + state.walletLockPeriod * 60_000
  );
}

export async function getRegtestOriginPermission(state: WalletState, origin: string) {
  const account = getActiveBitcoinAccount(state);
  const [clientError, clientId] = permissions.utils.store.makeClientId({ origin });
  if (account?.accountType !== 'software' || clientError) return undefined;
  const [storeError, store] = await initPermissionsStore();
  if (storeError) throw new Error('Could not read wallet permissions');
  const accountId = permissions.utils.account.makeAccountId({
    networkType: state.network.type,
    accountId: account.id,
    masterPubKey: account.masterPubKey,
  });
  const resourceId = permissions.resources.account.makeAccountResourceId(accountId);
  return {
    account,
    clientId,
    store,
    allowed: permissions.utils.store.hasPermission(store, {
      type: 'account',
      clientId,
      resourceId,
      actions: { read: true },
    }),
  };
}

export function bitcoinApprovalSnapshot(state: WalletState) {
  const account = getActiveBitcoinAccount(state);
  return JSON.stringify([
    state.network.type,
    state.network.btcApiUrl,
    state.network.fallbackBtcApiUrl ?? '',
    state.network.ordApiUrl ?? '',
    account?.btcAddress,
    account?.ordinalsAddress,
  ]);
}

export function bitcoinApprovalParams(connector = false): [string, string][] {
  return [
    ['bitcoinApproval', bitcoinApprovalSnapshot(rootStore.store.getState().walletState)],
    ['localRegtestConnector', connector ? 'true' : 'false'],
  ];
}

export async function assertBitcoinApproval(params: URLSearchParams) {
  const state: WalletState = rootStore.store.getState().walletState;
  const snapshot = params.get('bitcoinApproval');
  if (snapshot && snapshot !== bitcoinApprovalSnapshot(state)) {
    throw new Error('The Bitcoin account or network settings changed. Request approval again.');
  }
  if (params.get('localRegtestConnector') !== 'true') return;

  const origin = params.get('origin') ?? '';
  const tab = await chrome.tabs.get(Number(params.get('tabId')));
  if (
    !connectorEnabled(state) ||
    !tab.url ||
    new URL(tab.url).origin !== origin ||
    !(await isRegtestSessionUnlocked(state)) ||
    !(await getRegtestOriginPermission(state, origin))?.allowed
  ) {
    throw new Error('The local regtest test connector is disconnected.');
  }

  const latest: WalletState = rootStore.store.getState().walletState;
  if (
    !connectorEnabled(latest) ||
    !latest.isUnlocked ||
    snapshot !== bitcoinApprovalSnapshot(latest)
  ) {
    throw new Error('The Bitcoin account or network settings changed. Request approval again.');
  }
}
