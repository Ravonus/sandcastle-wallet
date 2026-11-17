/* eslint-disable prefer-destructuring */
import sandcastleIcon from '@assets/img/sandcastle/icon.svg?inline';
import type { Provider } from '@sats-connect/core';
import type { NetworkType } from '@secretkeylabs/xverse-core';

export const GAMMA_URL = 'https://gamma.io/';
export const BTC_TRANSACTION_STATUS_URL = 'https://mempool.space/tx/';
export const BTC_TRANSACTION_TESTNET_STATUS_URL = 'https://mempool.space/testnet/tx/';
export const BTC_TRANSACTION_TESTNET4_STATUS_URL = 'https://mempool.space/testnet4/tx/';
export const BTC_TRANSACTION_SIGNET_STATUS_URL = 'https://mempool.space/signet/tx/';
export const BTC_TRANSACTION_REGTEST_STATUS_URL = 'https://mempool.bitcoin.regtest.hiro.so/tx/';
export const TRANSACTION_STATUS_URL = 'https://explorer.stacks.co/txid/';
export const XVERSE_POOL_ADDRESS = 'SPXVRSEH2BKSXAEJ00F1BY562P45D5ERPSKR4Q33';

const ordiViewSuffixMap: Record<NetworkType, string> = {
  Mainnet: '',
  Testnet4: '-testnet4',
  Testnet: '-testnet',
  Signet: '-signet',
  Regtest: '-signet',
};
export const XVERSE_ORDIVIEW_URL = (network: NetworkType) =>
  `https://ord${ordiViewSuffixMap[network]}.xverse.app`;

export const TRANSAC_URL = 'https://global.transak.com';
export const TRANSAC_API_KEY = process.env.TRANSAC_API_KEY;
export const MOON_PAY_URL = 'https://buy.moonpay.com';
export const MOON_PAY_API_KEY = process.env.MOON_PAY_API_KEY;

export const MAGIC_EDEN_RUNES_URL = 'https://magiceden.io/runes';

export type CurrencyTypes = 'STX' | 'BTC' | 'FT' | 'NFT' | 'Ordinal' | 'brc20-Ordinal' | 'RareSat';
export enum LoaderSize {
  SMALLEST,
  SMALL,
  MEDIUM,
  LARGE,
}

export const BITCOIN_DUST_AMOUNT_SATS = 1500;
export const PAGINATION_LIMIT = 50;

/**
 * contract id of send_many transaction type
 */
export const SEND_MANY_TOKEN_TRANSFER_CONTRACT_PRINCIPAL =
  'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.send-many-memo';

export const DEFAULT_TRANSITION_OPTIONS = {
  from: {
    x: 24,
    opacity: 0,
  },
  enter: {
    x: 0,
    opacity: 1,
  },
};

export const MAX_ACC_NAME_LENGTH = 20;
// UI
export const ANIMATION_EASING = (progress: number) => 1 - (1 - progress) ** 3; // ease out (0, 0, 0.58, 1)
export const EMPTY_LABEL = '--';
export const HIDDEN_BALANCE_LABEL = '••••••';
export const BTC_SYMBOL = '₿';
export const OPTIONS_DIALOG_WIDTH = 179;
export const SPAM_OPTIONS_WIDTH = 244;
export const LONG_TOAST_DURATION = 4000;

export const SandcastleProviderInfo: Provider = {
  id: 'SandcastleProviders.BitcoinProvider',
  name: 'Sandcastle Wallet',
  icon: sandcastleIcon,
  methods: [
    'getInfo',
    'getAddresses',
    'getAccounts',
    'getBalance',
    'signMessage',
    'sendTransfer',
    'signPsbt',
    'stx_callContract',
    'stx_deployContract',
    'stx_getAccounts',
    'stx_getAddresses',
    'stx_signMessage',
    'stx_signStructuredMessage',
    'stx_signTransaction',
    'stx_signTransactions',
    'stx_transferStx',
    'runes_etch',
    'runes_getBalance',
    'runes_mint',
    'runes_transfer',
    'ord_getInscriptions',
    'ord_sendInscriptions',
  ],
};
