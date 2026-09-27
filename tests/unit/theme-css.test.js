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

  it('the sub-row under the menu bar mirrors the breadcrumb alignment formula', () => {
    // Same invariant layout-styles.test.js pins for .breadcrumbs: the row
    // shares #top-menu's --width-content column and the 0.8rem horizontal
    // padding insets the toggle to the menu bar's right *content* edge at
    // every viewport. Flex-end pins the control to that edge.
    const row = rules.get('.theme-bar');
    expect(row).toBeTruthy();
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/justify-content:\s*flex-end/);
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
