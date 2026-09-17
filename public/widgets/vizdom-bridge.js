// Bridge: loads the vendored vizdom WASM module (static file, allowed by
// script-src 'self' + 'wasm-unsafe-eval') and exposes it as window.Vizdom.
// The wasm binary (vizdom_ts_bg.wasm) resolves via import.meta.url relative
// to this directory. On success, the widget registry is notified.
import('./vizdom_ts.min.js')
  .then(async module => {
    const init = module.init || module.default;
    await init();
    window.Vizdom = { DotParser: module.DotParser };
    window.__rfMarkWidgetReady?.('vizdom');
  })
  .catch(error => {
    console.warn('vizdom WASM graph layout unavailable:', error);
  });
