import type { BitcoinProvider } from '@sats-connect/core';
import type { StacksProvider } from '@stacks/connect';
import { SandcastleProviderInfo } from '@utils/constants';
import SatsMethodsProvider from './sats.inpage';
import StacksMethodsProvider from './stacks.inpage';

declare global {
  interface Window {
    SandcastleProviders?: {
      BitcoinProvider: BitcoinProvider;
      StacksProvider: StacksProvider;
    };
  }
}

window.SandcastleProviders ??= {
  BitcoinProvider: SatsMethodsProvider,
  StacksProvider: StacksMethodsProvider as StacksProvider,
};

window.btc_providers ??= [];
const providers = window.btc_providers;
if (!providers.some(({ id }) => id === SandcastleProviderInfo.id)) {
  providers.push(SandcastleProviderInfo);
}
