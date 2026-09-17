// Bridge: loads three-spritetext from esm.sh (allowed by script-src) and
// exposes it as window.SpriteText for the 3D force-graph labels. Bundler
// `import()` rewriting cannot load remote URLs, so this runs as a native
// <script type="module"> from public/.
import('https://esm.sh/three-spritetext')
  .then(module => {
    window.SpriteText = module.default;
    window.__rfMarkWidgetReady?.('three-spritetext');
  })
  .catch(error => {
    console.warn('three-spritetext unavailable:', error);
  });
