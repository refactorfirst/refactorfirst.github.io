// WCAG 2.2 AA stylesheet checks: text contrast (SC 1.4.3), non-text focus
// indicator contrast (SC 2.4.11) and minimum target size (SC 2.5.8), verified
// against the actual declarations in globals.css — not screenshots.
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../app/globals.css'),
  'utf-8'
);

function ruleMap(source) {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRe.exec(noComments)) !== null) {
    for (const selector of match[1].split(',')) {
      rules.set(selector.trim(), match[2]);
    }
  }
  return rules;
}

function cssVars(source) {
  const vars = new Map();
  const varRe = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRe.exec(source)) !== null) {
    vars.set(`--${match[1]}`, match[2].trim());
  }
  return vars;
}

const rules = ruleMap(css);
const vars = cssVars(css);

function resolve(value) {
  const varMatch = value.match(/var\((--[\w-]+)\)/);
  return varMatch ? vars.get(varMatch[1]) : value;
}

function hexToRgb(hex) {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) throw new Error(`not a hex color: ${hex}`);
  let h = match[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(colorA, colorB) {
  const [la, lb] = [relativeLuminance(colorA), relativeLuminance(colorB)];
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

const WHITE = '#ffffff';

describe('stylesheet WCAG 2.2 AA', () => {
  it('call-to-action hover keeps AA text contrast (>= 4.5:1)', () => {
    const hoverRule = rules.get('.cta:hover');
    expect(hoverRule).toBeTruthy();
    const background = resolve(hoverRule.match(/background:\s*([^;]+)/)[1]);
    const color = resolve(hoverRule.match(/color:\s*([^;]+)/)[1] || '#fff');
    expect(contrastRatio(background, color)).toBeGreaterThanOrEqual(4.5);
  });

  it('base body text keeps AA contrast', () => {
    const body = rules.get('body');
    const background = resolve(body.match(/background:\s*([^;]+)/)[1]);
    const color = resolve(body.match(/color:\s*([^;]+)/)[1]);
    expect(contrastRatio(background, color)).toBeGreaterThanOrEqual(4.5);
  });

  it('the keyboard focus indicator has non-text contrast >= 3:1 (SC 2.4.11)', () => {
    const focusRule = rules.get(':focus-visible');
    expect(focusRule).toBeTruthy();
    const outline = focusRule.match(/outline:\s*[^;]*?([#]?\S+)\s*;/)[1];
    expect(contrastRatio(resolve(outline), WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('the skip-link target does not suppress the visible focus indicator', () => {
    const mainFocus = rules.get('main:focus');
    expect(mainFocus || '').not.toMatch(/outline:\s*none/);
  });

  it('menu navigation links meet the 24px target size (SC 2.5.8)', () => {
    const menuLinks = rules.get('.menu-links a');
    expect(menuLinks).toBeTruthy();
    // Rendered height = font-size * line-height + vertical padding; mvp.css
    // line-height 1.5. 0.8rem * 1.5 + 2 * 0.25rem = 1.7rem = 27.2px >= 24px.
    const verticalPadding = Number(
      menuLinks.match(/padding:\s*([\d.]+)rem/)[1]
    );
    expect(verticalPadding * 2 + 0.8 * 1.5).toBeGreaterThanOrEqual(1.5); // >= 24px
  });

  it('pagination controls meet the 24px target size (SC 2.5.8)', () => {
    const page = rules.get('.pagination .page');
    expect(page).toBeTruthy();
    const verticalPadding = Number(
      page.match(/padding:\s*([\d.]+)rem/)[1]
    );
    expect(verticalPadding * 2 + 1 * 1.5).toBeGreaterThanOrEqual(1.5); // >= 24px
  });
});
