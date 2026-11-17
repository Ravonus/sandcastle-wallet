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
  const bitcoin = BitcoinEsploraApiProvider.fromSettings(
    settings,
    settings.type === 'Regtest'
      ? {
          get: async (key) => (await chrome.storage.local.get(key))[key] ?? null,
          set: async (key, value) => chrome.storage.local.set({ [key]: value }),
        }
      : undefined,
  );
  const clients = {
    bitcoin,
    regtestOrdinals: settings.type === 'Regtest' ? new RegtestOrdinalsApi(bitcoin) : undefined,
  };
  clientsBySettings.set(settings, clients);
  return clients;
}
