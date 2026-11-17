# Sending messages to the content script

To send messages to the content script, the extension environment provides [`chrome.tabs.sendMessage()`](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage). The methods for interacting with the content script or user applications build atop this method.

Each feature provides its own wrappers for sending messages as required,

![Message flow](message-flow.png)

RPC responses, including popup-close errors, use the runtime RPC message type in `schemas.ts`. The content script posts them to the page inside a `sandcastle-extension` envelope. The inpage Bitcoin provider unwraps the envelope and returns the original JSON-RPC result to the caller.
