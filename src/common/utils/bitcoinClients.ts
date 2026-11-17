import {
  BitcoinEsploraApiProvider,
  RegtestOrdinalsApi,
  type SettingsNetwork,
} from '@secretkeylabs/xverse-core';

const clientsBySettings = new WeakMap<
  SettingsNetwork,
  { bitcoin: BitcoinEsploraApiProvider; regtestOrdinals?: RegtestOrdinalsApi }
>();

export default function getBitcoinClients(settings: SettingsNetwork) {
  const existing = clientsBySettings.get(settings);
  if (existing) return existing;
  const bitcoin = BitcoinEsploraApiProvider.fromSettings(settings);
  const clients = {
    bitcoin,
    regtestOrdinals: settings.type === 'Regtest' ? new RegtestOrdinalsApi(bitcoin) : undefined,
  };
  clientsBySettings.set(settings, clients);
  return clients;
}
