// Widget readiness registry. CDN widgets are loaded via next/script
// (classic scripts) and module bridges in public/widgets/ (vizdom WASM,
// three-spritetext). Each loader reports completion through
// window.__rfMarkWidgetReady so ReportView can gate enhanceReport on the
// widgets it needs instead of racing script evaluation order.

const readyWidgets = new Set();
const pendingCallbacks = new Map(); // name -> callback[]

function installGlobalBridge() {
  if (typeof window === 'undefined') return;
  if (typeof window.__rfMarkWidgetReady !== 'function') {
    window.__rfMarkWidgetReady = name => markWidgetReady(name);
  }
}

// Register a callback fired once the named widget is ready. If the widget
// is already ready the callback runs synchronously.
export function onWidgetReady(name, callback) {
  installGlobalBridge();
  if (readyWidgets.has(name)) {
    callback();
    return;
  }
  const callbacks = pendingCallbacks.get(name) || [];
  callbacks.push(callback);
  pendingCallbacks.set(name, callbacks);
}

// Mark a widget as ready and flush its pending callbacks. Subsequent marks
// for the same widget are ignored.
export function markWidgetReady(name) {
  installGlobalBridge();
  if (readyWidgets.has(name)) return;
  readyWidgets.add(name);
  const callbacks = pendingCallbacks.get(name);
  pendingCallbacks.delete(name);
  callbacks?.forEach(callback => callback());
}

export function isWidgetReady(name) {
  return readyWidgets.has(name);
}

// Wait until a widget is ready (or settles as failed). Returns a promise
// that resolves with `true` when ready and `false` on timeout.
export function waitForWidget(name, { timeoutMs = 5000 } = {}) {
  installGlobalBridge();
  if (readyWidgets.has(name)) return Promise.resolve(true);
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    onWidgetReady(name, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

// Test hook: clear all readiness state.
export function resetWidgetRegistry() {
  installGlobalBridge();
  readyWidgets.clear();
  pendingCallbacks.clear();
}
