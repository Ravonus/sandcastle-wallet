// For the Sandcastle-first case, wait until document-start scripts have loaded.
if (new URLSearchParams(location.search).get('first') === 'sandcastle') {
  window.addEventListener(
    'load',
    () => {
      const script = document.createElement('script');
      script.id = 'xverse-wallet-provider';
      script.src = chrome.runtime.getURL('inpage.js');
      document.head.appendChild(script);
    },
    { once: true },
  );
}
