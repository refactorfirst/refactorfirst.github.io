// Bridge: loads the pinned @hpcc-js/wasm-graphviz module from jsDelivr
// (allowed by script-src; the wasm binary is embedded in the module) and
// exposes it as window.Graphviz for the package graph — the only renderer
// honoring the graph's compound ltail/lhead cluster edges. Bundler
// `import()` rewriting cannot load remote URLs, so this runs as a native
// <script type="module"> from public/.
import('https://cdn.jsdelivr.net/npm/@hpcc-js/wasm-graphviz@1.7.0/dist/index.js')
  .then(module => {
    window.Graphviz = module.Graphviz;
    window.__rfMarkWidgetReady?.('graphviz');
  })
  .catch(error => {
    console.warn('wasm-graphviz package graph renderer unavailable:', error);
  });
