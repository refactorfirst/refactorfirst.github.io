// Dark mode cascade guards (plans/css-only-dark-mode.md): the light palette
// lives on :root, the dark palette is selected purely in CSS via
// :has(#rf-theme-…:checked) radio state plus prefers-color-scheme, the two
// dark blocks never drift apart, every hardcoded color stays inside the
// palette blocks, and the dark palette passes the same WCAG 2.2 AA math the
// css-a11y.test.js guards apply to the light palette.
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../app/globals.css'),
  'utf-8'
);
const layoutSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../app/layout.jsx'),
  'utf-8'
);

const DARK_RADIO = ':root:has(#rf-theme-dark:checked)';
const DARK_SYSTEM = ':root:has(#rf-theme-system:checked)';
const PALETTE_SELECTORS = new Set([':root', 'html:root', DARK_RADIO, DARK_SYSTEM]);

const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Indexes CSS declaration blocks by selector (same parser as css-a11y).
 *
 * @param {string} source - Stylesheet source.
 * @returns {Map<string, string>} Declaration blocks keyed by selector.
 */
function ruleMap(source) {
  const rules = new Map();
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRe.exec(source)) !== null) {
    for (const selector of match[1].split(',')) {
      rules.set(selector.trim(), match[2]);
    }
  }
  return rules;
}

/**
 * Collects custom property declarations from a declaration block.
 *
 * @param {string} body - Declarations of one CSS rule.
 * @returns {Map<string, string>} Values keyed by custom property name.
 */
function cssVarsOf(body) {
  const vars = new Map();
  const varRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRe.exec(body)) !== null) {
    vars.set(match[1], match[2].trim());
  }
  return vars;
}

const rules = ruleMap(noComments);

/**
 * Resolves a value against a palette, following one var() indirection.
 *
 * @param {string} value - CSS value to resolve.
 * @param {Map<string, string>} palette - Palette values.
 * @returns {string} The resolved value.
 */
function resolveIn(value, palette) {
  const m = String(value).match(/var\((--[\w-]+)\)/);
  return m ? palette.get(m[1]) : value;
}

/**
 * Converts a hex color to normalized RGB channels.
 *
 * @param {string} hex - Hexadecimal CSS color.
 * @returns {number[]} Red, green, and blue channels from 0 to 1.
 */
function hexToRgb(hex) {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) throw new Error(`not a hex color: ${hex}`);
  let h = match[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

/**
 * Calculates a color's WCAG relative luminance.
 *
 * @param {string} hex - Hexadecimal CSS color.
 * @returns {number} Relative luminance from 0 to 1.
 */
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates the WCAG contrast ratio between two colors.
 *
 * @param {string} colorA - First hexadecimal CSS color.
 * @param {string} colorB - Second hexadecimal CSS color.
 * @returns {number} Contrast ratio from 1 to 21.
 */
function contrastRatio(colorA, colorB) {
  const [la, lb] = [relativeLuminance(colorA), relativeLuminance(colorB)];
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

// Light palette = base :root plus the html:root mvp.css overrides.
const lightPalette = new Map([
  ...cssVarsOf(rules.get(':root') || ''),
  ...cssVarsOf(rules.get('html:root') || '')
]);
const darkBody = rules.get(DARK_RADIO) || '';
const darkPalette = cssVarsOf(darkBody);

/**
 * Reads a contrast ratio between two palette entries.
 *
 * @param {Map<string, string>} palette - Palette to resolve against.
 * @param {string} nameA - First custom property name.
 * @param {string} nameB - Second custom property name.
 * @returns {number} WCAG contrast ratio of the two resolved colors.
 */
function contrastOf(palette, nameA, nameB) {
  return contrastRatio(resolveIn(palette.get(nameA), palette), resolveIn(palette.get(nameB), palette));
}

describe('dark mode cascade structure', () => {
  it('the light palette declares color-scheme: light on :root', () => {
    const base = rules.get(':root');
    expect(base).toBeTruthy();
    expect(base).toMatch(/color-scheme:\s*light/);
    expect(lightPalette.get('--bg-color')).toBe('#ffffff');
  });

  it('mvp.css variables are overridden for the light theme on html:root', () => {
    // mvp.css loads after the bundle, so same-specificity :root overrides
    // would lose the cascade; html:root (0,1,1) beats mvp's :root (0,1,0).
    const mvp = rules.get('html:root');
    expect(mvp).toBeTruthy();
    expect(mvp).toMatch(/--color-bg:\s*var\(--bg-color\)/);
    expect(mvp).toMatch(/--color-link:\s*var\(--link-color\)/);
  });

  it('an explicit dark radio selects the dark palette at any OS setting', () => {
    expect(darkBody).toBeTruthy();
    expect(darkBody).toMatch(/color-scheme:\s*dark/);
    expect(darkPalette.get('--bg-color')).toBeTruthy();
    expect(darkPalette.get('--bg-color')).not.toBe('#ffffff');
  });

  it('the system radio follows the OS preference via prefers-color-scheme', () => {
    const mediaSection = noComments.match(
      /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/
    );
    expect(mediaSection).toBeTruthy();
    expect(mediaSection[1]).toContain(DARK_SYSTEM);
    expect(rules.get(DARK_SYSTEM)).toBeTruthy();
    expect(rules.get(DARK_SYSTEM)).toMatch(/color-scheme:\s*dark/);
  });

  it('the two dark blocks are identical so the palettes cannot drift', () => {
    const normalize = body => body.replace(/\s+/g, ' ').trim();
    expect(normalize(rules.get(DARK_SYSTEM))).toBe(normalize(darkBody));
  });

  it('no hardcoded colors survive outside the palette blocks', () => {
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = ruleRe.exec(noComments)) !== null) {
      const selector = match[1].trim();
      if (PALETTE_SELECTORS.has(selector)) continue;
      expect(match[2]).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
      expect(match[2]).not.toMatch(/rgba?\(/);
    }
  });

  it('report-template light-only rules are re-driven from theme variables', () => {
    const pageBtn = rules.get('main#app .rf-page-btn');
    expect(pageBtn).toBeTruthy();
    expect(pageBtn).toMatch(/background:\s*var\(--card-bg\)/);
    expect(pageBtn).toMatch(/color:\s*var\(--text-color\)/);

    const popup = rules.get('main#app .popup');
    expect(popup).toBeTruthy();
    expect(popup).toMatch(/background-color:\s*var\(--card-bg\)/);

    // The template hardcodes a #1f5273 focus ring that disappears on dark
    // backgrounds; the override must come from the palette.
    const focus = rules.get('main#app .rf-page-btn:focus-visible');
    expect(focus).toMatch(/outline-color:\s*var\(--brand-accent\)/);

    // The cell-copy focus ring must use the focus-indicator role too:
    // --brand-color (the accent *background*) is only 2.9:1 against the
    // dark --surface-color, below the 3:1 of SC 2.4.11.
    const cellCopy = rules.get('main#app .rf-data-table td[data-rf-copy]:focus-visible');
    expect(cellCopy).toMatch(/outline-color:\s*var\(--brand-accent\)/);
  });
});

// vizdom WASM graphs (classGraph/packageGraph/cycle SVGs): the layout bakes
// black stroke/fill presentation attributes onto the edge curves and
// arrowhead polygons, which disappear on the dark page background. Only
// non-red elements re-drive from the palette — red marks cycle edges.
describe('vizdom graph edges in dark mode', () => {
  it('declares a per-palette graph line color (dark mirrors the chart legend text)', () => {
    // The dark value must mirror CHART_LEGEND_TEXT.dark in
    // lib/report-view.js (#9fb0c0 == --muted-color).
    expect(lightPalette.get('--graph-line')).toBeTruthy();
    expect(darkPalette.get('--graph-line')).toBe('#9fb0c0');
    // Perceivable against the dark page (SC 1.4.11, non-text >= 3:1).
    expect(contrastOf(darkPalette, '--graph-line', '--bg-color')).toBeGreaterThanOrEqual(3);
  });

  it('re-drives non-red edge curves and arrowheads from the palette', () => {
    // Edge curves are the stroke-bearing paths (fill-only paths are text
    // glyphs, which must not match: node labels stay black on their white
    // ellipses); red cycle edges stay red.
    const edges = rules.get('main#app .fullscreen-svg path[stroke]:not([stroke="red"])');
    expect(edges).toBeTruthy();
    expect(edges).toMatch(/stroke:\s*var\(--graph-line\)/);
    const arrows = rules.get('main#app .fullscreen-svg polygon:not([fill="red"])');
    expect(arrows).toBeTruthy();
    expect(arrows).toMatch(/stroke:\s*var\(--graph-line\)/);
    expect(arrows).toMatch(/fill:\s*var\(--graph-line\)/);
  });
});

// vizdom renders every package cluster as a g.cluster rect carrying the DOT's
// baked fillcolor (appendPackage emits fillcolor=white for regular packages,
// fillcolor=pink for break-up candidates) with the cluster label drawn as a
// black-filled glyph path following the rect as a sibling (probe against the
// vendored vizdom 0.1.19). The white boxes glare on the dark page, so the
// regular clusters re-drive fill, stroke and label from the palette like the
// edges. The pink break-up boxes need the opposite treatment: baked pink is
// 11.8:1 against the dark page (a glaring pastel slab) but only 1.45:1 against
// the #9fb0c0 edges crossing it, so the dark fill drops to a deep rose that
// keeps the edges visible while a light pink boundary/label ink carries the
// signal. No fill can pass 3:1 against both the near-black page and the light
// edges at once (the optimum balances at ~2.86:1), so the fill prioritizes
// edge visibility and the pink ink provides the perceivable boundary (SC
// 1.4.11). Light values equal vizdom's baked colors, so light mode does not
// change by a pixel.
describe('vizdom package clusters in dark mode', () => {
  it('re-drives regular cluster boxes from the palette', () => {
    const boxes = rules.get('main#app .fullscreen-svg g.cluster rect[fill="white"]');
    expect(boxes).toBeTruthy();
    // The dark fill mirrors the page background, exactly like vizdom's
    // default white on the light page; the baked black stroke follows
    // --graph-line so the boxes stay delineated.
    expect(boxes).toMatch(/fill:\s*var\(--bg-color\)/);
    expect(boxes).toMatch(/stroke:\s*var\(--graph-line\)/);
  });

  it('re-drives cluster labels on the re-themed boxes', () => {
    const labels = rules.get(
      'main#app .fullscreen-svg g.cluster rect[fill="white"] ~ path[fill="black"]');
    expect(labels).toBeTruthy();
    expect(labels).toMatch(/fill:\s*var\(--graph-line\)/);
    // The sibling anchor is the white rect: break-up labels are themed by
    // their own rule below, never by this one.
  });

  it('keeps cluster labels readable on the re-themed boxes (SC 1.4.3, both palettes)', () => {
    for (const palette of [lightPalette, darkPalette]) {
      expect(contrastOf(palette, '--bg-color', '--graph-line')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('re-drives break-up cluster boxes and their labels from the palette', () => {
    const boxes = rules.get('main#app .fullscreen-svg g.cluster rect[fill="pink"]');
    expect(boxes).toBeTruthy();
    expect(boxes).toMatch(/fill:\s*var\(--graph-breakup-fill\)/);
    expect(boxes).toMatch(/stroke:\s*var\(--graph-breakup-line\)/);
    const labels = rules.get(
      'main#app .fullscreen-svg g.cluster rect[fill="pink"] ~ path[fill="black"]');
    expect(labels).toBeTruthy();
    expect(labels).toMatch(/fill:\s*var\(--graph-breakup-line\)/);
  });

  it('keeps the light breakup values equal to vizdom\'s baked pink and black', () => {
    // The light rules must be a visual no-op: the palette values equal the
    // DOT's baked fillcolor=pink and the default black stroke/label glyphs.
    expect(lightPalette.get('--graph-breakup-fill')).toBe('#ffc0cb');
    expect(lightPalette.get('--graph-breakup-line')).toBe('#000000');
  });

  it('tunes the dark breakup surface for the dark page', () => {
    expect(darkPalette.get('--graph-breakup-fill')).toBe('#7f3350');
    expect(darkPalette.get('--graph-breakup-line')).toBe('#f2b8cd');
  });

  it('dark breakup boxes keep the edges visible and read as flagged', () => {
    // Edges (--graph-line) cross the breakup boxes and must stay visible
    // against the fill (SC 1.4.11, >= 3:1) — baked pink only reached 1.45:1.
    expect(contrastOf(darkPalette, '--graph-line', '--graph-breakup-fill'))
      .toBeGreaterThanOrEqual(3);
    // The pink label ink keeps AA text contrast on the rose fill (SC 1.4.3)
    // and the boundary stays perceivable against the page behind the box.
    expect(contrastOf(darkPalette, '--graph-breakup-fill', '--graph-breakup-line'))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(darkPalette, '--bg-color', '--graph-breakup-line'))
      .toBeGreaterThanOrEqual(3);
    // The rose fill reads clearly against the near-black regular clusters
    // (large-area presence plus a warm hue shift; the site's own dark
    // surfaces sit at 1.29:1). The perceivable boundary is the pink ink.
    expect(contrastOf(darkPalette, '--bg-color', '--graph-breakup-fill'))
      .toBeGreaterThanOrEqual(2);
  });
});

// DOT-graph hover highlights (vizdom SVGs): lib/report-view.js toggles the
// rf-hover-* state classes on mouseover/focus — the hovered edge plus both
// endpoint nodes take the amber attention accent, a hovered node takes the
// focus ring while its incoming edges + source nodes go green and its
// outgoing edges + sink nodes go blue. The accents re-stroke the baked
// shapes, so they must stay perceivable on every graph surface of their
// palette (SC 1.4.11) and stand apart from the slate --graph-line edges.
describe('graph hover highlight accents', () => {
  it('declares per-palette amber/green/blue highlight accents', () => {
    expect(lightPalette.get('--graph-hover-edge')).toBe('#b45309');
    expect(lightPalette.get('--graph-hover-in')).toBe('#1e8449');
    expect(lightPalette.get('--graph-hover-out')).toBe('#2a6f97');
    expect(darkPalette.get('--graph-hover-edge')).toBe('#f0b95a');
    expect(darkPalette.get('--graph-hover-in')).toBe('#7ee2a8');
    expect(darkPalette.get('--graph-hover-out')).toBe('#8ed0fa');
    // The on-accent label ink for highlighted nodes: white on the dark
    // light-mode accent fills, black on the bright dark-mode accent fills.
    expect(lightPalette.get('--graph-hover-on')).toBe('#ffffff');
    expect(darkPalette.get('--graph-hover-on')).toBe('#000000');
  });

  it('fills and re-strokes hovered edges and their endpoint nodes with the amber accent', () => {
    const curve = rules.get('main#app .fullscreen-svg g.edge.rf-hover-edge path[stroke]');
    expect(curve).toBeTruthy();
    expect(curve).toMatch(/stroke:\s*var\(--graph-hover-edge\)/);
    expect(curve).toMatch(/stroke-width:\s*2\.5px/);
    const arrow = rules.get('main#app .fullscreen-svg g.edge.rf-hover-edge polygon');
    expect(arrow).toMatch(/stroke:\s*var\(--graph-hover-edge\)/);
    expect(arrow).toMatch(/fill:\s*var\(--graph-hover-edge\)/);
    // Highlighted nodes fill with the accent, not just ring it.
    const ring = rules.get('main#app .fullscreen-svg g.node.rf-hover-edge ellipse');
    expect(ring).toMatch(/stroke:\s*var\(--graph-hover-edge\)/);
    expect(ring).toMatch(/fill:\s*var\(--graph-hover-edge\)/);
    expect(rules.get('main#app .fullscreen-svg g.node.rf-hover-edge rect'))
      .toMatch(/fill:\s*var\(--graph-hover-edge\)/);
  });

  it('fills and rings the hovered node and colors incoming vs outgoing differently', () => {
    const focus = rules.get('main#app .fullscreen-svg g.node.rf-hover-focus ellipse');
    expect(focus).toMatch(/stroke:\s*var\(--graph-hover-edge\)/);
    expect(focus).toMatch(/fill:\s*var\(--graph-hover-edge\)/);
    for (const state of ['in', 'out']) {
      const accent = `--graph-hover-${state}`;
      const curve = rules.get(`main#app .fullscreen-svg g.edge.rf-hover-${state} path[stroke]`);
      expect(curve).toMatch(new RegExp(`stroke:\\s*var\\(${accent}\\)`));
      const arrow = rules.get(`main#app .fullscreen-svg g.edge.rf-hover-${state} polygon`);
      expect(arrow).toMatch(new RegExp(`stroke:\\s*var\\(${accent}\\)`));
      expect(arrow).toMatch(new RegExp(`fill:\\s*var\\(${accent}\\)`));
      const fill = rules.get(`main#app .fullscreen-svg g.node.rf-hover-${state} ellipse`);
      expect(fill).toMatch(new RegExp(`stroke:\\s*var\\(${accent}\\)`));
      expect(fill).toMatch(new RegExp(`fill:\\s*var\\(${accent}\\)`));
      expect(rules.get(`main#app .fullscreen-svg g.node.rf-hover-${state} rect`))
        .toMatch(new RegExp(`fill:\\s*var\\(${accent}\\)`));
    }
    // A node that is both a source and a sink of the hovered node is a
    // bidirectional partner: it fills with the attention accent over the
    // two directional states.
    const both = rules.get('main#app .fullscreen-svg g.node.rf-hover-in.rf-hover-out ellipse');
    expect(both).toMatch(/fill:\s*var\(--graph-hover-edge\)/);
    expect(both).toMatch(/stroke:\s*var\(--graph-hover-edge\)/);
  });

  it('re-inks the labels of highlighted nodes to stay readable on the fill', () => {
    // Node labels are glyph paths with a baked black fill sitting on the
    // shape; once the shape fills with an accent the ink must flip to the
    // palette's on-accent color (SC 1.4.3).
    for (const state of ['edge', 'focus', 'in', 'out']) {
      const label = rules.get(
        `main#app .fullscreen-svg g.node.rf-hover-${state} path[fill="black"]`);
      expect(label).toBeTruthy();
      expect(label).toMatch(/fill:\s*var\(--graph-hover-on\)/);
    }
  });

  it('keeps every accent perceivable on every graph surface of its palette (SC 1.4.11)', () => {
    for (const palette of [lightPalette, darkPalette]) {
      for (const accent of ['--graph-hover-edge', '--graph-hover-in', '--graph-hover-out']) {
        for (const surface of ['--bg-color', '--graph-breakup-fill']) {
          expect(contrastOf(palette, surface, accent)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('keeps node labels readable on every accent fill (SC 1.4.3, both palettes)', () => {
    for (const palette of [lightPalette, darkPalette]) {
      for (const accent of ['--graph-hover-edge', '--graph-hover-in', '--graph-hover-out']) {
        expect(contrastOf(palette, accent, '--graph-hover-on')).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('popup close button', () => {
  it('is a red square re-driven from palette variables', () => {
    // The template ships a bare × button; the red-square chrome must come
    // from main#app overrides (1,1,1) so both palettes stay compatible.
    const close = rules.get('main#app .close-btn');
    expect(close).toBeTruthy();
    expect(close).toMatch(/background:\s*var\(--popup-close-bg\)/);
    expect(close).toMatch(/color:\s*var\(--popup-close-fg\)/);

    // SC 2.5.8: the pointer target is at least 24x24 CSS px.
    const width = Number(close.match(/width:\s*([\d.]+)rem/)[1]);
    const height = Number(close.match(/height:\s*([\d.]+)rem/)[1]);
    expect(width).toBeGreaterThanOrEqual(1.5);
    expect(height).toBeGreaterThanOrEqual(1.5);
  });

  it('the focus ring floats off the red square onto the popup surface', () => {
    // A ring hugging the red fill cannot use --brand-accent (blue on red
    // is ~1:1); offset it so it contrasts with --card-bg instead.
    const focus = rules.get('main#app .close-btn:focus-visible');
    expect(focus).toMatch(/outline-color:\s*var\(--brand-accent\)/);
    expect(focus).toMatch(/outline-offset:\s*2px/);
  });

  for (const [name, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
    it(`the white × keeps AA text contrast on the red square (${name})`, () => {
      expect(contrastOf(palette, '--popup-close-bg', '--popup-close-fg'))
        .toBeGreaterThanOrEqual(4.5);
    });

    it(`the red square is perceivable against the popup surface (${name})`, () => {
      expect(contrastOf(palette, '--card-bg', '--popup-close-bg'))
        .toBeGreaterThanOrEqual(3);
    });
  }
});

describe('toggle styles', () => {
  it('the toggle renders icon pills over appearance-none radios', () => {
    expect(rules.get('.theme-toggle')).toMatch(/display:\s*flex/);
    expect(rules.get('.theme-option-input')).toMatch(/appearance:\s*none/);
    expect(rules.get('.theme-option-input')).toMatch(/position:\s*absolute/);
    expect(rules.get('.theme-option-input:checked')).toMatch(/background:\s*var\(--brand-color\)/);
    expect(rules.get('.theme-option-input:checked + .theme-option-icon'))
      .toMatch(/color:\s*var\(--on-accent-color\)/);
  });

  it('each toggle option meets the 24px minimum target size (SC 2.5.8)', () => {
    const option = rules.get('.theme-option');
    expect(option).toBeTruthy();
    const width = Number(option.match(/width:\s*([\d.]+)rem/)[1]);
    const height = Number(option.match(/height:\s*([\d.]+)rem/)[1]);
    expect(width).toBeGreaterThanOrEqual(1.5);
    expect(height).toBeGreaterThanOrEqual(1.5);
  });

  it('the row below the header mirrors the breadcrumb alignment formula', () => {
    // Same invariant layout-styles.test.js pinned for the standalone
    // .breadcrumbs bar: the row shares #top-menu's --width-content column
    // and the 0.8rem horizontal padding insets its children to the menu
    // bar's content edges at every viewport — the toggle on the right, the
    // breadcrumb trail on the left (flex-grow), vertically centered.
    const row = rules.get('.theme-bar');
    expect(row).toBeTruthy();
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/justify-content:\s*flex-end/);
    expect(row).toMatch(/align-items:\s*center/);
    expect(row).toMatch(/max-width:\s*var\(--width-content\)/);
    expect(row).toMatch(/box-sizing:\s*border-box/);
    expect(row).toMatch(/margin:\s*0\s+auto/);
    expect(row).toMatch(/padding:\s*[^;]*0\.8rem[^;]*;/);
  });
});

describe('dark palette WCAG 2.2 AA', () => {
  it('body text keeps AA contrast (>= 4.5:1)', () => {
    expect(contrastOf(darkPalette, '--bg-color', '--text-color')).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text keeps AA contrast (>= 4.5:1)', () => {
    expect(contrastOf(darkPalette, '--bg-color', '--muted-color')).toBeGreaterThanOrEqual(4.5);
  });

  it('link text keeps AA contrast (>= 4.5:1)', () => {
    expect(contrastOf(darkPalette, '--bg-color', '--link-color')).toBeGreaterThanOrEqual(4.5);
  });

  it('text on surface panels keeps AA contrast (>= 4.5:1)', () => {
    expect(contrastOf(darkPalette, '--surface-color', '--text-color')).toBeGreaterThanOrEqual(4.5);
  });

  it('the keyboard focus indicator has non-text contrast >= 3:1 (SC 2.4.11)', () => {
    expect(contrastOf(darkPalette, '--bg-color', '--brand-accent')).toBeGreaterThanOrEqual(3);
    expect(contrastOf(darkPalette, '--surface-color', '--brand-accent')).toBeGreaterThanOrEqual(3);
  });

  it('accent backgrounds keep AA contrast with their foreground (>= 4.5:1)', () => {
    expect(contrastOf(darkPalette, '--brand-color', '--on-accent-color')).toBeGreaterThanOrEqual(4.5);
  });

  it('input boundaries are perceivable on surfaces (SC 1.4.11, >= 3:1)', () => {
    expect(contrastOf(darkPalette, '--surface-color', '--input-border')).toBeGreaterThanOrEqual(3);
  });

  it('status colors keep AA contrast on the page background (>= 4.5:1)', () => {
    expect(contrastOf(darkPalette, '--bg-color', '--error-color')).toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(darkPalette, '--bg-color', '--success-color')).toBeGreaterThanOrEqual(4.5);
  });

  it('the dark accent also passes the light guards\' vs-white check', () => {
    // css-a11y.test.js resolves custom properties by last occurrence in the
    // file (the dark palette). Its assertions check contrast against white,
    // so the dark --brand-accent must stay >= 3:1 against white too.
    const accent = resolveIn(darkPalette.get('--brand-accent'), darkPalette);
    expect(contrastRatio(accent, '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});

describe('theme persistence bootstrap', () => {
  it('layout restores the saved choice pre-paint and saves changes', () => {
    expect(layoutSource).toContain("localStorage.getItem('rf-theme')");
    expect(layoutSource).toContain("localStorage.setItem('rf-theme'");
    expect(layoutSource).toContain('rf-theme-');
  });

  it('layout advertises both color schemes before stylesheets load', () => {
    expect(layoutSource).toMatch(/<meta\s+name="color-scheme"\s+content="light dark"\s*\/>/);
  });
});

// Keep the new filter controls perceivable in both palettes and retain the
// browser's hidden behavior when an empty filter has no clear action.
describe('table filter accessibility', () => {
  it('does not override hidden on the clear button with an unconditional display', () => {
    const base = rules.get('main#app .rf-table-search .rf-search-clear');
    expect(base).toBeTruthy();
    expect(base).not.toMatch(/(?:^|;)\s*display\s*:/);
    expect(rules.get('main#app .rf-table-search .rf-search-clear:not([hidden])'))
      .toMatch(/display:\s*inline-flex/);
  });

  it('visually hides the label without removing it from the accessibility tree', () => {
    const label = rules.get('main#app .rf-table-search .rf-search-label');
    expect(label).toBeTruthy();
    expect(label).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(label).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it('provides a clear button target at least 24px wide and high', () => {
    const clear = rules.get('main#app .rf-table-search .rf-search-clear');
    for (const dimension of ['width', 'height']) {
      const value = clear.match(new RegExp(`${dimension}:\\s*([\\d.]+)rem`));
      expect(value).not.toBeNull();
      expect(Number(value[1]) * 16).toBeGreaterThanOrEqual(24);
    }
  });

  for (const [name, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
    it(`keeps the filter boundary, clear icon and focus ring perceivable in ${name} mode`, () => {
      const input = rules.get('main#app .rf-table-search input[type="search"]');
      const clear = rules.get('main#app .rf-table-search .rf-search-clear');
      const focus = rules.get('main#app .rf-table-search .rf-search-clear:focus-visible');
      const borderColor = input.match(/border:\s*1px solid (var\([^)]+\))/)[1];
      const iconColor = clear.match(/(?:^|;)\s*color:\s*([^;]+)/)[1];
      const focusColor = focus.match(/outline-color:\s*([^;]+)/)[1];
      for (const surface of ['--bg-color', '--surface-color', '--card-bg']) {
        const background = resolveIn(palette.get(surface), palette);
        expect(contrastRatio(resolveIn(borderColor, palette), background)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(resolveIn(iconColor, palette), background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(resolveIn(focusColor, palette), background)).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

// Hamburger toggle (mobile view): mvp.css paints every button's text in
// var(--color-bg), and .menu-toggle only overrode background/border, so the
// ☰ glyph rendered in the page background color and the 1px --input-border
// edge fell below 3:1 on the menu surface. Both must be re-driven from a
// per-palette variable.
describe('menu toggle contrast', () => {
  /**
   * Concatenates every declaration block for a selector: the rules map keeps
   * only the last occurrence (the responsive block) for repeated selectors,
   * so assertions must run against all of them together.
   *
   * @param {string} selector - CSS selector to collect.
   * @returns {string} Combined declarations.
   */
  function combinedRule(selector) {
    const bodies = [];
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = ruleRe.exec(noComments)) !== null) {
      if (match[1].trim() === selector) bodies.push(match[2]);
    }
    return bodies.join(';');
  }

  it('re-drives the glyph and border from the palette', () => {
    const toggle = combinedRule('.menu-toggle');
    expect(toggle).toMatch(/(?:^|;)\s*color:\s*var\(--menu-toggle-color\)/);
    expect(toggle).toMatch(/border:\s*1px solid var\(--menu-toggle-color\)/);
  });

  for (const [name, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
    it(`declares a ${name} palette color for the toggle`, () => {
      expect(palette.get('--menu-toggle-color')).toBeTruthy();
    });

    it(`the glyph keeps AA text contrast on the menu surface (${name}, SC 1.4.3)`, () => {
      expect(contrastOf(palette, '--surface-color', '--menu-toggle-color'))
        .toBeGreaterThanOrEqual(4.5);
    });

    it(`the border is perceivable on the menu surface (${name}, SC 1.4.11)`, () => {
      expect(contrastOf(palette, '--surface-color', '--menu-toggle-color'))
        .toBeGreaterThanOrEqual(3);
    });
  }
});

describe('report CSS selector boundaries', () => {
  // Mirrors the vizdom SVG structure (probe against the vendored 0.1.19):
  // edge curves (stroke paths), arrowhead polygons, node ellipses with
  // label glyph paths, and package clusters as g.cluster rects whose label
  // glyph path follows the rect as a sibling.
  const graphSvgFixture = () => {
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <main id="app"><svg class="fullscreen-svg">
        <path id="edge" stroke="black"/>
        <path id="cycle-edge" stroke="red"/>
        <path id="node-label" fill="black"/>
        <polygon id="arrow" fill="black"/>
        <polygon id="cycle-arrow" fill="red"/>
        <ellipse id="node" fill="white"/>
        <g class="cluster"><a>
          <rect id="cluster-box" fill="white" stroke="black"/>
          <path id="cluster-label" fill="black"/>
        </a></g>
        <g class="cluster"><a>
          <rect id="breakup-box" fill="pink" stroke="black"/>
          <path id="breakup-label" fill="black"/>
        </a></g>
        <g class="node"><a><rect id="rect-node" fill="white" stroke="black"/></a></g>
      </svg><svg><path id="other-icon" stroke="black"/></svg></main>
      <svg class="fullscreen-svg"><path id="outside-report" stroke="black"/></svg>`;
    return fixture;
  };

  it('themes graph edges, arrowheads and regular clusters; red cycles and node glyphs stay untouched', () => {
    const fixture = graphSvgFixture();
    const selectors = [...rules].filter(([, body]) => /var\(--graph-line\)/.test(body))
      .map(([selector]) => selector);
    expect(selectors.length).toBeGreaterThan(0);
    expect([...fixture.querySelectorAll(selectors.join(','))].map(el => el.id))
      .toEqual(['edge', 'arrow', 'cluster-box', 'cluster-label']);
  });

  it('themes break-up clusters only through the breakup rules', () => {
    const fixture = graphSvgFixture();
    const selectors = [...rules]
      .filter(([, body]) => /var\(--graph-breakup-(?:fill|line)\)/.test(body))
      .map(([selector]) => selector);
    expect(selectors.length).toBeGreaterThan(0);
    expect([...fixture.querySelectorAll(selectors.join(','))].map(el => el.id))
      .toEqual(['breakup-box', 'breakup-label']);
  });

  it('hover highlight rules stay inert until an element carries a hover state', () => {
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <main id="app"><svg class="fullscreen-svg">
        <g class="edge" id="ge-hover"><path id="p-hover" stroke="black"/><polygon id="a-hover" fill="black"/></g>
        <g class="edge" id="ge-in"><path id="p-in" stroke="red"/><polygon id="a-in" fill="red"/></g>
        <g class="edge" id="ge-out"><path id="p-out" stroke="black"/><polygon id="a-out" fill="black"/></g>
        <g class="node" id="gn-hover"><ellipse id="e-hover"/><path id="l-hover" fill="black"/></g>
        <g class="node" id="gn-focus"><ellipse id="e-focus"/><rect id="r-focus"/><path id="l-focus" fill="black"/></g>
        <g class="node" id="gn-in"><ellipse id="e-in"/><path id="l-in" fill="black"/></g>
        <g class="node" id="gn-out"><ellipse id="e-out"/><path id="l-out" fill="black"/></g>
        <g class="node" id="gn-both"><ellipse id="e-both"/><path id="l-both" fill="black"/></g>
        <g class="edge" id="ge-cold"><path id="p-cold" stroke="black"/></g>
        <g class="node" id="gn-cold"><ellipse id="e-cold"/><path id="l-cold" fill="black"/></g>
      </svg></main>`;
    const selectors = [...rules]
      .filter(([, body]) => /var\(--graph-hover-(?:edge|in|out|on)\)/.test(body))
      .map(([selector]) => selector);
    expect(selectors.length).toBeGreaterThan(0);
    // Nothing matches while no element is flagged…
    expect([...fixture.querySelectorAll(selectors.join(','))]).toEqual([]);
    // …including red removal edges and plain shapes once the states are set.
    fixture.querySelector('#ge-hover').classList.add('rf-hover-edge');
    fixture.querySelector('#ge-in').classList.add('rf-hover-in');
    fixture.querySelector('#ge-out').classList.add('rf-hover-out');
    fixture.querySelector('#gn-hover').classList.add('rf-hover-edge');
    fixture.querySelector('#gn-focus').classList.add('rf-hover-focus');
    fixture.querySelector('#gn-in').classList.add('rf-hover-in');
    fixture.querySelector('#gn-out').classList.add('rf-hover-out');
    fixture.querySelector('#gn-both').classList.add('rf-hover-in', 'rf-hover-out');
    expect([...fixture.querySelectorAll(selectors.join(','))].map(el => el.id))
      .toEqual(['p-hover', 'a-hover', 'p-in', 'a-in', 'p-out', 'a-out',
        'e-hover', 'l-hover', 'e-focus', 'r-focus', 'l-focus',
        'e-in', 'l-in', 'e-out', 'l-out', 'e-both', 'l-both']);
  });

  it('applies the unwrapped-table scrolling rule only to report data tables without enhancement', () => {
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <main id="app">
        <table id="problem" class="rf-data-table"></table>
        <table id="solution" class="rf-data-table"></table>
        <table id="enhanced" class="rf-data-table" data-rf-table="class-relationships"></table>
        <table id="ordinary"></table>
      </main><table id="outside-report" class="rf-data-table"></table>`;
    const selectors = [...rules].filter(([selector, body]) =>
      selector.includes('table.rf-data-table') && /overflow-x:\s*auto/.test(body))
      .map(([selector]) => selector);
    expect(selectors.length).toBeGreaterThan(0);
    expect([...fixture.querySelectorAll(selectors.join(','))].map(el => el.id))
      .toEqual(['problem', 'solution']);
  });
});
