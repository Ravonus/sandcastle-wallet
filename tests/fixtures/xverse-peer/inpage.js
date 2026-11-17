(() => {
  const first = new URLSearchParams(location.search).get('first');
  // Use the main-world document-start injection to guarantee the peer goes first.
  if (first !== 'peer' && !document.currentScript) return;

  const BitcoinProvider = {
    request(method, params, id = crypto.randomUUID(), defer = false) {
      return new Promise((resolve) => {
        function onMessage({ data }) {
          // Mirrors the upstream RPC listener: match the JSON-RPC shape and ID,
          // regardless of the source tag. An envelope must not match it.
          if (data?.jsonrpc !== '2.0' || data.id !== id) return;
          if (!Object.hasOwn(data, 'result') && !Object.hasOwn(data, 'error')) return;
          window.removeEventListener('message', onMessage);
          resolve(data);
        }
        window.addEventListener('message', onMessage);
        if (!defer) {
          document.dispatchEvent(
            new CustomEvent('xverse_rpc_request', {
              detail: { jsonrpc: '2.0', id, method, params },
            }),
          );
        }
      });
    },
  };
  const StacksProvider = { getProductInfo: () => ({ name: 'Xverse-shaped test peer' }) };
  const globalsWereFree = ['XverseProviders', 'BitcoinProvider', 'StacksProvider'].every(
    (key) => !Object.hasOwn(window, key),
  );
  const markInitialGlobals = () => {
    document.documentElement.dataset.forkLeftDefaultsFree = String(globalsWereFree);
  };
  if (document.documentElement) markInitialGlobals();
  else document.addEventListener('DOMContentLoaded', markInitialGlobals, { once: true });

  window.XverseProviders = { BitcoinProvider, StacksProvider };
  Object.defineProperties(window, {
    BitcoinProvider: { get: () => BitcoinProvider, set: () => {} },
    StacksProvider: { get: () => StacksProvider, set: () => {} },
  });
  (window.btc_providers ??= []).push({
    id: 'XverseProviders.BitcoinProvider',
    name: 'Xverse-shaped test peer',
  });

  document.addEventListener('xverse_rpc_request', ({ detail }) => {
    window.postMessage(
      { source: 'xverse-wallet', jsonrpc: '2.0', id: detail.id, result: { wallet: 'peer' } },
      location.origin,
    );
  });
  window.addEventListener('message', ({ data }) => {
    if (data?.source !== 'xverse-app' || data.method !== 'getURL') return;
    window.postMessage(
      { source: 'xverse-extension', method: 'getURLResponse', url: 'peer-options' },
      location.origin,
    );
  });
})();
