/**
 * SUPER SIMPLE WebSocket Diagnostic
 * Just logs EVERYTHING - no parsing, no patterns, no complexity
 *
 * HOW TO USE:
 * 1. Open OpenFront.io (don't join game yet)
 * 2. Open console (F12)
 * 3. Paste this ENTIRE script
 * 4. THEN join/start a game
 * 5. Watch console for messages
 */

(function() {
  console.log('%c[DIAGNOSTIC] Starting...', 'color: #0f0; font-size: 16px; font-weight: bold');

  let messageCount = 0;
  const OriginalWebSocket = window.WebSocket;
  const OriginalSharedWorker = window.SharedWorker;

  // Patch WebSocket
  window.WebSocket = function(...args) {
    console.log('[DIAGNOSTIC] WebSocket created!', args[0]);
    const socket = new OriginalWebSocket(...args);

    // Intercept ALL messages
    const originalOnMessage = socket.onmessage;
    Object.defineProperty(socket, 'onmessage', {
      set(handler) {
        socket._realHandler = function(event) {
          messageCount++;
          console.log(`%c[MSG #${messageCount}]`, 'color: #ff0', typeof event.data);

          // Try to show preview
          if (typeof event.data === 'string') {
            const preview = event.data.length > 200 ? event.data.substring(0, 200) + '...' : event.data;
            console.log('String:', preview);

            // Try to parse JSON
            try {
              const parsed = JSON.parse(event.data);
              console.log('JSON keys:', Object.keys(parsed));
              console.log('Full object:', parsed);
            } catch (e) {
              console.log('Not JSON');
            }
          } else if (event.data instanceof ArrayBuffer) {
            console.log('ArrayBuffer:', event.data.byteLength, 'bytes');
          } else if (event.data instanceof Blob) {
            console.log('Blob:', event.data.size, 'bytes');
          } else {
            console.log('Other type:', event.data);
          }

          console.log('---');

          // Call original handler
          if (handler) {
            handler.call(this, event);
          }
        };
        socket.addEventListener('message', socket._realHandler);
      },
      get() {
        return socket._realHandler;
      }
    });

    return socket;
  };

  // Copy WebSocket properties
  Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
  for (const prop of Object.getOwnPropertyNames(OriginalWebSocket)) {
    try {
      window.WebSocket[prop] = OriginalWebSocket[prop];
    } catch (e) {}
  }

  // Patch SharedWorker if exists
  if (OriginalSharedWorker) {
    window.SharedWorker = function(...args) {
      console.log('[DIAGNOSTIC] SharedWorker created!', args[0]);
      const worker = new OriginalSharedWorker(...args);

      if (worker.port) {
        worker.port.addEventListener('message', function(event) {
          messageCount++;
          console.log(`%c[WORKER MSG #${messageCount}]`, 'color: #f0f', typeof event.data);

          if (typeof event.data === 'string') {
            const preview = event.data.length > 200 ? event.data.substring(0, 200) + '...' : event.data;
            console.log('String:', preview);

            try {
              const parsed = JSON.parse(event.data);
              console.log('JSON keys:', Object.keys(parsed));
              console.log('Full object:', parsed);
            } catch (e) {
              console.log('Not JSON');
            }
          } else if (typeof event.data === 'object') {
            console.log('Object keys:', Object.keys(event.data));
            console.log('Full object:', event.data);
          } else {
            console.log('Data:', event.data);
          }

          console.log('---');
        });
      }

      return worker;
    };

    Object.setPrototypeOf(window.SharedWorker, OriginalSharedWorker);
  }

  console.log('%c[DIAGNOSTIC] Ready! Join a game and watch for messages.', 'color: #0f0; font-weight: bold');
  console.log('[DIAGNOSTIC] If you see no messages, the script loaded too late - refresh and paste again BEFORE joining');
})();
