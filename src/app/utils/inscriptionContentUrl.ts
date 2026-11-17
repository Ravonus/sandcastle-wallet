import { getRegtestInscriptionContentUrl, type SettingsNetwork } from '@secretkeylabs/xverse-core';
import { XVERSE_ORDIVIEW_URL } from './constants';

export default function inscriptionContentUrl(settings: SettingsNetwork, id: string) {
  if (settings.type !== 'Regtest') return `${XVERSE_ORDIVIEW_URL(settings.type)}/content/${id}`;
  try {
    return getRegtestInscriptionContentUrl(settings.ordApiUrl, id);
  } catch {
    return undefined;
  }
}
