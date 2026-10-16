// Layout cleanup: protect the mvp.css section-flex reset and the readability
// rules (plans/layout-cleanup-plan.md). mvp.css makes every `section` a
// wrapping flex row, which smashes prose children together; globals.css must
// neutralize it and give prose pages a readable, centered column.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../app/globals.css'),
  'utf-8'
);

// Naive-but-sufficient block parser: strips comments, then maps each selector
// to its declaration body (e.g. "main section" -> "display: block; ...").
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

const rules = ruleMap(css);

describe('layout styles (mvp.css section-flex reset)', () => {
  test('main sections render as a normal block container, not a flex row', () => {
    const body = rules.get('main section');
    expect(body).toBeTruthy();
    expect(body).toMatch(/display:\s*block\s*;/);
  });

  test('prose pages get a bounded, centered content column via .content-page', () => {
    const body = rules.get('.content-page');
    expect(body).toBeTruthy();
    expect(body).toMatch(/max-width:\s*\d+/);
    expect(body).toMatch(/margin:\s*0\s+auto\s*;/);
  });

  test('landing CTA / featured sections can be centered via .section-center', () => {
    const body = rules.get('.section-center');
    expect(body).toBeTruthy();
    expect(body).toMatch(/text-align:\s*center\s*;/);
  });

  test('the add-repo form is centered on its now block-flowed page', () => {
    const body = rules.get('#repo-form');
    expect(body).toBeTruthy();
    expect(body).toMatch(/margin:\s*0\s+auto\s*;/);
  });

  test('the menu surface spans the viewport, its content stays centered', () => {
    // mvp.css caps every header (and footer/main) at --width-content; the
    // menu surface must reach the page's left/right edges instead, while
    // the inner bar keeps the centered --width-content content column and
    // the margin reset of mvp.css's 7rem nav margin. The .theme-bar row
    // below mirrors the bar's content edges (guarded in
    // tests/unit/theme-css.test.js and the E2E alignment checks).
    // ruleMap keeps only the last block per selector (#top-menu and
    // .menu-bar also appear inside the 900px media query), so scan every
    // block in the raw source instead.
    const menuBlocks = [...css.matchAll(/#top-menu\s*\{([^}]*)\}/g)]
      .map((m) => m[1]);
    expect(menuBlocks.length).toBeGreaterThan(0);
    expect(menuBlocks.some((b) => /max-width:\s*none/.test(b))).toBe(true);
    const barBlocks = [...css.matchAll(/\.menu-bar\s*\{([^}]*)\}/g)]
      .map((m) => m[1]);
    expect(barBlocks.length).toBeGreaterThan(0);
    expect(barBlocks.some((b) => /max-width:\s*var\(--width-content\)/.test(b))).toBe(true);
    // border-box keeps the padding inside the capped column, matching
    // .theme-bar's geometry (guarded in tests/unit/theme-css.test.js).
    expect(barBlocks.some((b) => /box-sizing:\s*border-box/.test(b))).toBe(true);
    expect(barBlocks.some((b) => /margin:\s*0\s+auto/.test(b))).toBe(true);
  });

  test('the breadcrumb trail stretches inside the theme bar row (menu column)', () => {
    // The trail now shares the .theme-bar row with the color theme toggle:
    // the row is edge to edge like the menu bar (guarded in
    // tests/unit/theme-css.test.js), so .breadcrumbs must not add its own
    // box-model offsets — it grows to fill the row's left side, keeping the
    // first crumb's glyph at the menu bar's left content edge while the
    // toggle pins to the right edge.
    const body = rules.get('.breadcrumbs');
    expect(body).toBeTruthy();
    expect(body).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(body).not.toMatch(/max-width/);
    expect(body).not.toMatch(/padding:\s*0\s+0\.8rem/);
  });

  test('crumb links carry no left padding (glyph edge aligns with the brand)', () => {
    const link = rules.get('.breadcrumbs a');
    expect(link).toBeTruthy();
    expect(link).toMatch(/padding:\s*[\d.]+rem\s+0\s*;/);
  });
});
