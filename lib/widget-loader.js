// Widget readiness registry. CDN widgets are loaded via next/script
// (classic scripts) and module bridges in public/widgets/ (vizdom WASM,
// force-graph + sprite labels). Each loader reports completion through
// window.__rfMarkWidgetReady so ReportView can gate widget-dependent
// enhancements on readiness instead of racing script evaluation order.

const readyWidgets = new Set();
const pendingCallbacks = new Map(); // name -> callback[]

// Runtime globals a widget's bridge/library materializes once it is actually
// usable, keyed by normalized widget name. The vizdom bridge assigns
// window.Vizdom once the WASM finishes initializing and the CDN scripts assign
// their globals on evaluation; the bridges then notify this registry through
// window.__rfMarkWidgetReady. A mark can still be lost, though: an idle-time
// warm-up on a directory page (components/report-warmup.jsx) loads the vizdom
// bridge before any report page bundle exists, so the mark fires into a
// registry this page never sees, and a client-side navigation to a report
// reuses the already-materialized module (the browser module map does not
// re-run it). Readiness is therefore also decidable from the materialized
// global itself, so a widget whose runtime already exists is ready even
// without a mark landing in this page.
const WIDGET_RUNTIME_GLOBALS = {
    chart: 'Chart',
    vizdom: 'Vizdom',
    'svg-pan-zoom': 'svgPanZoom',
    sigma: 'Sigma',
    graphology: 'graphology',
    'graphlib-dot': 'graphlibDot',
    '3d-force-graph': 'ForceGraph3D',
    'three-spritetext': 'SpriteText'
};

/** Returns the runtime global name a widget materializes, or null if unknown. */
function widgetGlobalName(name) {
    const key = String(name || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(WIDGET_RUNTIME_GLOBALS, key)
        ? WIDGET_RUNTIME_GLOBALS[key]
        : null;
}

function installGlobalBridge() {
  if (typeof window === 'undefined') return;
  if (typeof window.__rfMarkWidgetReady !== 'function') {
    window.__rfMarkWidgetReady = name => markWidgetReady(name);
  }
}

// Install the browser-global bridge as soon as the registry module exists, so
// marks fired before any report page has mounted (an idle-time warm-up on a
// directory page) reach this registry — client-side navigations to report
// pages share this module instance.
installGlobalBridge();

// Register a callback fired once the named widget is ready. If the widget
// is already ready the callback runs synchronously. Returns an unsubscribe
// function that removes a still-pending callback.
export function onWidgetReady(name, callback) {
  installGlobalBridge();
  if (isWidgetReady(name)) {
    callback();
    return () => {};
  }
  const callbacks = pendingCallbacks.get(name) || [];
  callbacks.push(callback);
  pendingCallbacks.set(name, callbacks);
  let subscribed = true;
  return () => {
    if (!subscribed || pendingCallbacks.get(name) !== callbacks) return;
    subscribed = false;
    callbacks.splice(callbacks.indexOf(callback), 1);
    if (callbacks.length === 0) pendingCallbacks.delete(name);
  };
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
  if (readyWidgets.has(name)) return true;
  const globalName = widgetGlobalName(name);
  if (globalName && typeof window !== 'undefined' && window[globalName]) return true;
  return false;
}

// Wait until a widget is ready (or settles as failed). Returns a promise
// that resolves with `true` when ready and `false` on timeout.
export function waitForWidget(name, { timeoutMs = 5000 } = {}) {
  installGlobalBridge();
  if (isWidgetReady(name)) return Promise.resolve(true);
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
