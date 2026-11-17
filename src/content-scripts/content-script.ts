import {
  DomEventName,
  type AuthenticationRequestEvent,
  type CreateInscriptionEvent,
  type CreateRepeatInscriptionsEvent,
  type GetAddressRequestEvent,
  type SendBtcRequestEvent,
  type SignBatchPsbtRequestEvent,
  type SignMessageRequestEvent,
  type SignPsbtRequestEvent,
  type SignatureRequestEvent,
  type TransactionRequestEvent,
} from '@common/types/inpage-types';
import {
  CONTENT_SCRIPT_PORT,
  LEGACY_RESPONSE_CHANNEL,
  MESSAGE_SOURCE,
  PAGE_APP_SOURCE,
  PAGE_EXTENSION_SOURCE,
  SatsConnectMethods,
  StacksLegacyMethods,
  type LegacyMessageFromContentScript,
  type SatsConnectMessageFromContentScript,
} from '@common/types/message-types';
import { regtestSettingsChannel } from '@common/types/regtestConnector';
import {
  contentScriptRpcResponseMessageSchema,
  contentScriptWalletEventMessageSchema,
} from '@common/utils/messages/extensionToContentScript/schemas';
import { walletEventName } from '@common/walletEvents';
import { rpcRequestMessageSchema } from '@sats-connect/core';
import * as v from 'valibot';

function postPageResponse(channel: string, data: unknown) {
  window.postMessage({ source: PAGE_EXTENSION_SOURCE, channel, data }, window.location.origin);
}

window.addEventListener('message', (event) => {
  const { data } = event;
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (data?.source === PAGE_APP_SOURCE && data.method === 'getURL' && typeof data.id === 'string') {
    postPageResponse(LEGACY_RESPONSE_CHANNEL, {
      id: data.id,
      method: 'getURLResponse',
      url: chrome.runtime.getURL('options.html'),
    });
  }
});

// Connection to background script - fires onConnect event in background script
// and establishes two-way communication
let backgroundPort: chrome.runtime.Port;

function connect() {
  backgroundPort = chrome.runtime.connect({ name: CONTENT_SCRIPT_PORT });
  backgroundPort.onDisconnect.addListener(connect);
}

connect();

const legacyResponseSchema = v.object({
  source: v.literal(MESSAGE_SOURCE),
  method: v.string(),
  payload: v.record(v.string(), v.unknown()),
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (v.is(contentScriptWalletEventMessageSchema, message)) {
    window.dispatchEvent(new CustomEvent(walletEventName, { detail: message.data }));
  } else if (v.is(contentScriptRpcResponseMessageSchema, message)) {
    postPageResponse(message.type, message.data);
  } else if (v.is(legacyResponseSchema, message) && message.method.endsWith('Response')) {
    postPageResponse(LEGACY_RESPONSE_CHANNEL, message);
  }
});

function forwardDomEventToBackground(
  method: LegacyMessageFromContentScript['method'] | SatsConnectMessageFromContentScript['method'],
  payload: unknown,
) {
  if (typeof payload !== 'string') return;
  backgroundPort.postMessage({ method, payload, source: MESSAGE_SOURCE });
}

// Listen for a CustomEvent (auth request) coming from the web app
document.addEventListener(DomEventName.authenticationRequest, ((
  event: AuthenticationRequestEvent,
) => {
  forwardDomEventToBackground(
    StacksLegacyMethods.authenticationRequest,
    event.detail?.authenticationRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (transaction request) coming from the web app
document.addEventListener(DomEventName.transactionRequest, ((event: TransactionRequestEvent) => {
  forwardDomEventToBackground(
    StacksLegacyMethods.transactionRequest,
    event.detail?.transactionRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (signature request) coming from the web app
document.addEventListener(DomEventName.signatureRequest, ((event: SignatureRequestEvent) => {
  forwardDomEventToBackground(StacksLegacyMethods.signatureRequest, event.detail?.signatureRequest);
}) as EventListener);

// Listen for a CustomEvent (structured data signature request) coming from the web app
document.addEventListener(DomEventName.structuredDataSignatureRequest, ((
  event: SignatureRequestEvent,
) => {
  forwardDomEventToBackground(
    StacksLegacyMethods.structuredDataSignatureRequest,
    event.detail?.signatureRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (BTC Address request) coming from the web app
document.addEventListener(DomEventName.getAddressRequest, ((event: GetAddressRequestEvent) => {
  forwardDomEventToBackground(
    SatsConnectMethods.getAddressRequest,
    event.detail?.btcAddressRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (PSBT Signing request) coming from the web app
document.addEventListener(DomEventName.signPsbtRequest, ((event: SignPsbtRequestEvent) => {
  forwardDomEventToBackground(SatsConnectMethods.signPsbtRequest, event.detail?.signPsbtRequest);
}) as EventListener);

// Listen for a CustomEvent (Batch PSBT Signing request) coming from the web app
document.addEventListener(DomEventName.signBatchPsbtRequest, ((
  event: SignBatchPsbtRequestEvent,
) => {
  forwardDomEventToBackground(
    SatsConnectMethods.signBatchPsbtRequest,
    event.detail?.signBatchPsbtRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (Message Signing request) coming from the web app
document.addEventListener(DomEventName.signMessageRequest, ((event: SignMessageRequestEvent) => {
  forwardDomEventToBackground(
    SatsConnectMethods.signMessageRequest,
    event.detail?.signMessageRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (Send BTC request) coming from the web app
document.addEventListener(DomEventName.sendBtcRequest, ((event: SendBtcRequestEvent) => {
  forwardDomEventToBackground(SatsConnectMethods.sendBtcRequest, event.detail?.sendBtcRequest);
}) as EventListener);

// Listen for a CustomEvent (Create Text Inscription Request) coming from the web app
document.addEventListener(DomEventName.createInscriptionRequest, ((
  event: CreateInscriptionEvent,
) => {
  forwardDomEventToBackground(
    SatsConnectMethods.createInscriptionRequest,
    event.detail?.createInscriptionRequest,
  );
}) as EventListener);

// Listen for a CustomEvent (Create Repeat Inscriptions Request) coming from the web app
document.addEventListener(DomEventName.createRepeatInscriptionsRequest, ((
  event: CreateRepeatInscriptionsEvent,
) => {
  forwardDomEventToBackground(
    SatsConnectMethods.createRepeatInscriptionsRequest,
    event.detail?.createRepeatInscriptionsRequest,
  );
}) as EventListener);

document.addEventListener(DomEventName.rpcRequest, (event) => {
  const request = v.safeParse(rpcRequestMessageSchema, (event as CustomEvent<unknown>).detail);
  if (request.success) {
    backgroundPort.postMessage({ ...request.output, source: MESSAGE_SOURCE });
  }
});

// Watch only settings relevant to the connector. The page gets a signal, never wallet storage.
let connectorActive = false;

function updateConnectorFlag(value: string | undefined) {
  const wasActive = connectorActive;
  try {
    const wallet = JSON.parse(value ?? '{}');
    connectorActive =
      wallet.exposeLocalRegtestConnector === 'true' &&
      JSON.parse(wallet.network ?? '{}').type === 'Regtest';
  } catch {
    connectorActive = false;
  }
  return connectorActive || wasActive;
}
function connectorSettings(value: string | undefined) {
  if (!value) return '';
  try {
    const wallet = JSON.parse(value);
    return JSON.stringify([
      wallet.network,
      wallet.exposeLocalRegtestConnector,
      wallet.selectedAccountIndex,
      wallet.selectedAccountType,
      wallet.btcPaymentAddressType,
      wallet.isUnlocked,
      wallet.walletLockPeriod,
      wallet.accountsList,
    ]);
  } catch {
    return '';
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  const wallet = changes['persist:walletState'];
  const shouldNotify =
    area === 'local' && wallet ? updateConnectorFlag(wallet.newValue) : connectorActive;
  if (!shouldNotify) return;
  if (
    (area === 'local' &&
      (changes['client-permissions'] ||
        (wallet && connectorSettings(wallet.oldValue) !== connectorSettings(wallet.newValue)))) ||
    (area === 'session' && (changes.passwordHash || changes.sessionStartTime))
  ) {
    postPageResponse(regtestSettingsChannel, null);
  }
});

const inpage = document.createElement('script');
inpage.src = chrome.runtime.getURL('inpage.js');
inpage.id = 'sandcastle-wallet-provider';
inpage.addEventListener(
  'load',
  async () => {
    const wallet = await chrome.storage.local.get('persist:walletState');
    if (updateConnectorFlag(wallet['persist:walletState']))
      postPageResponse(regtestSettingsChannel, null);
  },
  { once: true },
);
(document.head || document.documentElement).appendChild(inpage);
