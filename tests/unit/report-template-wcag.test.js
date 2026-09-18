// WCAG 2.2 AA checks for the rendered report template (SC 1.1.1, 1.3.1,
// 2.4.6): heading hierarchy, table semantics, canvas alternative text and
// named landmarks, exercised against the sanitised render of the fixture.
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { renderTemplate } from '../../lib/renderer.js';

const ROOT = path.join(import.meta.dir, '../..');
const template = readFileSync(
  path.join(ROOT, 'public/assets/refactor-first-report.mustache'),
  'utf8'
);
const fixture = JSON.parse(
  readFileSync(path.join(ROOT, 'tests/fixtures/junit4-report.json'), 'utf8')
);
const doc = new JSDOM(renderTemplate(template, fixture)).window.document;

describe('report template WCAG 2.2 AA (rendered with fixture data)', () => {
  it('has exactly one h1 (the report title)', () => {
    expect(doc.querySelectorAll('h1').length).toBe(1);
  });

  it('heading levels never skip (h1 -> h2 -> h3, one level at a time)', () => {
    const headings = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    expect(headings.length).toBeGreaterThan(0);
    let previous = 0;
    const violations = [];
    for (const heading of headings) {
      const level = Number(heading.tagName[1]);
      if (level > previous + 1) {
        violations.push(`${heading.tagName}: "${heading.textContent.trim().slice(0, 40)}" after h${previous}`);
      }
      previous = level;
    }
    expect(violations).toEqual([]);
  });

  it('every data table has a non-empty <caption>', () => {
    const violations = [];
    for (const table of doc.querySelectorAll('table')) {
      const caption = table.querySelector('caption');
      if (!caption || !caption.textContent.trim()) {
        violations.push(table.outerHTML.slice(0, 80));
      }
    }
    expect(violations).toEqual([]);
  });

  it('every header cell declares its scope', () => {
    const violations = [];
    for (const th of doc.querySelectorAll('th')) {
      if (!/^(col|row|colgroup|rowgroup)$/.test(th.getAttribute('scope') || '')) {
        violations.push(`<th>${th.textContent.trim().slice(0, 30)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('themes the problem/solution table with row headers instead of	td markup', () => {
    const { disharmonies } = fixture;
    if (!disharmonies || disharmonies.length === 0) return;
    const problemLabel = [...doc.querySelectorAll('th')]
      .filter(cell => /^Problem/.test(cell.textContent.trim()));
    expect(problemLabel.length).toBeGreaterThan(0);
    for (const th of problemLabel) {
      expect(th.getAttribute('scope')).toBe('row');
    }
  });

  it('every chart canvas has an accessible name and fallback text', () => {
    const canvases = [...doc.querySelectorAll('canvas')];
    expect(canvases.length).toBeGreaterThan(0);
    const violations = [];
    for (const canvas of canvases) {
      if (!(canvas.getAttribute('aria-label') || '').trim()) {
        violations.push(`<canvas id="${canvas.id}"> without aria-label`);
      }
      if (!canvas.textContent.trim()) {
        violations.push(`<canvas id="${canvas.id}"> without fallback text`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('the report section navigation is a named landmark', () => {
    for (const nav of doc.querySelectorAll('nav')) {
      expect((nav.getAttribute('aria-label') || '').trim()).not.toBe('');
    }
  });

  it('in-page navigation links resolve to actual targets', () => {
    const fixtureWithoutCycleMap = structuredClone(fixture);
    fixtureWithoutCycleMap.classCycles.largestCycle.hasCycleMap = false;
    const docWithoutCycleMap = new JSDOM(
      renderTemplate(template, fixtureWithoutCycleMap)
    ).window.document;

    for (const renderedDoc of [doc, docWithoutCycleMap]) {
      const violations = [];
      for (const anchor of renderedDoc.querySelectorAll('a[href^="#"]')) {
        const target = anchor.getAttribute('href');
        if (target === '#') {
          violations.push(`placeholder link "${anchor.textContent.trim()}"`);
          continue;
        }
        if (!renderedDoc.getElementById(target.slice(1))) {
          violations.push(`unresolved anchor ${target}`);
        }
      }
      expect(violations).toEqual([]);
    }

    expect(docWithoutCycleMap.querySelector('a[href="#CYCLEMAP"]')).toBeNull();
  });
});
