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
});
