import type { AnalyticsEventProperties, AnalyticsEvents } from '@secretkeylabs/xverse-core';
import type { Callback, RequestOptions } from 'mixpanel-browser';
import type { getMixpanelInstance } from '../mixpanelSetup';

type InstanceKey = Parameters<typeof getMixpanelInstance>[0];

export function trackMixPanel<E extends keyof AnalyticsEventProperties>(
  event: E,
  properties: AnalyticsEventProperties[E],
  options?: RequestOptions | Callback,
  callback?: Callback,
  instanceKey?: InstanceKey,
): void;
export function trackMixPanel(
  event: Exclude<AnalyticsEvents, keyof AnalyticsEventProperties>,
  properties?: any,
  options?: RequestOptions | Callback,
  callback?: Callback,
  instanceKey?: InstanceKey,
): void;
export function trackMixPanel(): void {}

export const optOutMixPanel = () => {};
export const optInMixPanel = (_masterPubKey?: string) => {};
export const hasOptedInMixPanelTracking = () => false;
export const resetMixPanel = () => {};
