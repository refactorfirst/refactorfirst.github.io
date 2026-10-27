// Bridge: loads the 3D force graph and its sprite-label helper from esm.sh
// as native ES modules and exposes them as window.ForceGraph3D /
// window.SpriteText for the report's 3D popup (lib/report-view.js). Both
// imports pin the SAME three build via ?deps=three@0.186.1: esm.sh rewrites
// each package's whole dependency subtree (three-forcegraph,
// three-render-objects, ...) to the identical /three@0.186.1/es2022/three.mjs
// URL, so the browser's module map evaluates Three.js exactly once. The
// previous wiring loaded the 3d-force-graph UMD — which bundles its own
// internal three — alongside esm.sh's copy for the labels, importing the
// library twice and tripping three's "Multiple instances of Three.js"
// warning. Versions are pinned like every other CDN widget so deploys stay
// reproducible; when bumping, keep both packages' ?deps= three version in
// lockstep so the whole subtree keeps sharing one three build.
import('https://esm.sh/3d-force-graph@1.80.1?deps=three@0.186.1')
  .then(module => {
    window.ForceGraph3D = module.default;
    window.__rfMarkWidgetReady?.('3d-force-graph');
  })
  .catch(error => {
    console.warn('3d-force-graph unavailable:', error);
  });

import('https://esm.sh/three-spritetext@1.10.0?deps=three@0.186.1')
  .then(module => {
    window.SpriteText = module.default;
    window.__rfMarkWidgetReady?.('three-spritetext');
  })
  .catch(error => {
    console.warn('three-spritetext unavailable:', error);
  });
