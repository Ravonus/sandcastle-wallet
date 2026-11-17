declare const VERSION: string;

export const connectorIdentity = {
  isAgorixRegtestWallet: true,
  id: 'agorix-regtest-extension',
  name: 'Sandcastle Wallet',
  network: 'regtest',
  version: VERSION,
} as const;

export const regtestStateEvent = 'agorix:btc-regtest-wallet-state';
export const regtestSettingsChannel = 'sandcastle-regtest-settings';

export const regtestMethods = {
  state: 'sandcastle_regtestState',
  connect: 'sandcastle_regtestConnect',
  disconnect: 'sandcastle_regtestDisconnect',
  getUtxos: 'sandcastle_regtestGetUtxos',
  signMessage: 'sandcastle_regtestSignMessage',
  signPsbt: 'sandcastle_regtestSignPsbt',
  send: 'sandcastle_regtestSend',
} as const;

export const disconnectedRegtestState = (available: boolean) => ({
  available,
  configured: false,
  connected: false,
  address: null as string | null,
  paymentAddress: null as string | null,
  publicKey: null as string | null,
  paymentPublicKey: null as string | null,
  label: connectorIdentity.name,
  provider: connectorIdentity.id,
  network: connectorIdentity.network,
  version: connectorIdentity.version,
});

export type RegtestWalletState = ReturnType<typeof disconnectedRegtestState>;

export type RegtestPsbtRequest = {
  tx: string;
  finalize?: boolean;
  broadcast?: boolean;
  inputsToSign?: {
    address: string;
    index: number;
    publicKey?: string;
    sighashTypes?: number[];
  }[];
  display?: {
    kind: 'btc_purchase';
    title: string;
    subtitle: string;
    assetOutpoint: string;
    amountSats: number;
    networkFeeSats: number;
    totalSats: number;
    paymentAddress: string;
    receiveAddress: string;
  };
};

export type RegtestFundingUtxo = {
  txid: string;
  vout: number;
  valueSats: number;
  blockHeight: number;
  value: number;
  status: { confirmed: true; block_height: number };
};
