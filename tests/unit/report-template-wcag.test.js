// WCAG 2.2 AA checks for the rendered report template (SC 1.1.1, 1.3.1,
// 2.4.6): heading hierarchy, table semantics, canvas alternative text and
// named landmarks, exercised against the sanitised render of the fixture.
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { renderTemplate, prepareReportData } from '../../lib/renderer.js';

const ROOT = path.join(import.meta.dir, '../..');
const template = readFileSync(
  path.join(ROOT, 'public/assets/refactor-first-report.mustache'),
  'utf8'
);
const fixture = JSON.parse(
  readFileSync(path.join(ROOT, 'tests/fixtures/junit4-report.json'), 'utf8')
);
const doc = new JSDOM(renderTemplate(template, prepareReportData(fixture))).window.document;

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

  it('omits optional navigation links when their report sections are absent', () => {
    const sparseFixture = structuredClone(fixture);
    sparseFixture.classRelationshipsToRemove.hasRelationships = false;
    sparseFixture.packageMap.hasEdges = false;
    sparseFixture.packageRelationshipsToRemove.hasRelationships = false;
    sparseFixture.hasDisharmonies = false;
    sparseFixture.disharmonies = [];
    sparseFixture.classCycles.hasCycles = false;

    const sparseDoc = new JSDOM(renderTemplate(template, sparseFixture)).window.document;
    const optionalTargets = [
      '#CLASSEDGES',
      '#PACKAGEMAP',
      '#PACKAGEEDGES',
      '#DISHARMONIES',
      '#CYCLES',
      '#CYCLEMAP'
    ];

    expect(sparseDoc.querySelector('a[href="#CLASSMAP"]')).not.toBeNull();
    expect(sparseDoc.getElementById('CLASSMAP')).not.toBeNull();
    for (const target of optionalTargets) {
      expect(sparseDoc.querySelector(`a[href="${target}"]`)).toBeNull();
      expect(sparseDoc.getElementById(target.slice(1))).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Enhanced tables (plan: implement-paginated-tables-with-sticky-headers):
// sticky headers, sortable column headers, pagination controls, toolbar
// (search slot + export button) — WCAG 2.2 AA shape of the rendered markup.
// ---------------------------------------------------------------------------

describe('enhanced tables: sticky headers CSS (plan Phase 2)', () => {
  const stickyRule = new RegExp(
    '\\.rf-data-table thead th\\s*\\{[^}]*position:\\s*sticky[^}]*top:\\s*0[^}]*z-index'
  );

  it('gives thead th sticky positioning pinned to the top', () => {
    expect(template).toMatch(stickyRule);
  });

  it('gives sticky headers an explicit background so rows do not show through', () => {
    const rule = template.match(/\.rf-data-table thead th\s*\{([^}]*)\}/s);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background/);
  });

  it('gives sticky headers an explicit text color (base themes style thead text)', () => {
    // mvp.css colours table-head text near-white; without an explicit
    // background + color pairing here the sortable headers render unreadable.
    const rule = template.match(/\.rf-data-table thead th\s*\{([^}]*)\}/s);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
    expect(rule[1]).toMatch(/background:\s*#[0-9a-fA-F]{3,6}/);
  });

  it('gives pagination buttons explicit background and text colors', () => {
    // Same base-theme hazard: plain buttons get near-white text from
    // mvp.css, so Previous/Next need explicit readable colours.
    const rule = template.match(/\.rf-page-btn\s*\{([^}]*)\}/s);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background:\s*#[0-9a-fA-F]{3,6}/);
    expect(rule[1]).toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
  });

  it('puts the outer table border on the scroll wrapper, not the scrolled table', () => {
    // When a table overflows, .rf-table-scroll clips/scrolls it — a border on
    // the <table> itself would scroll away with the content, so the visible
    // bounding box must live on the wrapper instead.
    const wrapperRule = template.match(/\.rf-table-scroll\s*\{([^}]*)\}/s);
    expect(wrapperRule).not.toBeNull();
    expect(wrapperRule[1]).toMatch(/border:\s*5px\s+solid/);
    const nestedRule = template.match(/\.rf-table-scroll\s+\.rf-data-table\s*\{([^}]*)\}/s);
    expect(nestedRule).not.toBeNull();
    expect(nestedRule[1]).toMatch(/border:\s*none/);
  });
});

describe('enhanced tables: toolbar and controls (plan Phase 4)', () => {
  const VALID_SORT_STATES = ['ascending', 'descending', 'none'];

  it('decorate the four static data tables and dynamic disharmony tables', () => {
    const tables = doc.querySelectorAll('table[data-rf-table]');
    const ids = [...tables].map(t => t.getAttribute('data-rf-table'));
    expect(ids).toContain('class-relationships');
    expect(ids).toContain('package-relationships');
    expect(ids).toContain('class-cycles-summary');
    expect(ids).toContain('largest-cycle-breakdown');
    expect(ids.some(id => id.startsWith('disharmony-'))).toBe(true);
  });

  it('marks up an accessible toolbar with export button and search slot per table', () => {
    const toolbars = doc.querySelectorAll('[data-rf-toolbar]');
    expect(toolbars.length).toBeGreaterThan(0);
    const violations = [];
    for (const toolbar of toolbars) {
      const tableId = toolbar.getAttribute('data-rf-toolbar');
      if (!toolbar.querySelector(`[data-rf-search-slot="${tableId}"]`)) {
        violations.push(`missing search slot for ${tableId}`);
      }
      const exportButton = toolbar.querySelector(`[data-rf-export="${tableId}"]`);
      if (!exportButton) {
        violations.push(`missing export button for ${tableId}`);
        continue;
      }
      const label = exportButton.getAttribute('aria-label') || '';
      if (!/export/i.test(label) || !/csv/i.test(label)) {
        violations.push(`export button for ${tableId} lacks a descriptive ARIA label`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not add toolbars to the problem/solution tables', () => {
    const problemTable = [...doc.querySelectorAll('table')]
      .find(t => t.querySelector('th[scope="row"]'));
    expect(problemTable).toBeTruthy();
    expect(problemTable.hasAttribute('data-rf-table')).toBe(false);
  });

  it('renders labelled pagination controls for large tables only', () => {
    const nav = doc.querySelector('[data-rf-pagination="class-relationships"]');
    expect(nav).not.toBeNull();
    expect(nav.tagName).toBe('NAV');
    expect((nav.getAttribute('aria-label') || '').trim()).not.toBe('');
    expect(doc.querySelector('[data-rf-pagination="package-relationships"]')).toBeNull();
    expect(doc.querySelector('[data-rf-pagination="class-cycles-summary"]')).not.toBeNull();
  });

  it('disables Previous on the first page and enables Next', () => {
    const nav = doc.querySelector('[data-rf-pagination="class-relationships"]');
    const prev = nav.querySelector('[data-page-dir="prev"]');
    const next = nav.querySelector('[data-page-dir="next"]');
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('exposes the page indicator as readable, semantic text', () => {
    const status = doc.querySelector(
      '[data-rf-pagination="class-relationships"] .rf-page-status');
    expect(status).not.toBeNull();
    expect(status.textContent).toContain('Page 1 of');
  });

  it('marks sortable column headers with aria-sort and keyboard-operable buttons', () => {
    const violations = [];
    for (const table of doc.querySelectorAll('table[data-rf-table]')) {
      const tableId = table.getAttribute('data-rf-table');
      const headers = table.querySelectorAll('thead th');
      expect(headers.length).toBeGreaterThan(0);
      for (const th of headers) {
        const sort = th.getAttribute('aria-sort');
        if (!VALID_SORT_STATES.includes(sort)) {
          violations.push(`${tableId}: th without valid aria-sort (${sort})`);
        }
        if (!th.querySelector('button[data-sort-key]')) {
          violations.push(`${tableId}: th without a sort button`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('exposes the current sort state via aria-sort and a visible indicator', () => {
    const sorted = prepareReportData(fixture, {
      'class-relationships': { sortKey: 'priority', sortDir: 'asc' }
    });
    const sortedDoc = new JSDOM(renderTemplate(template, sorted)).window.document;
    const sortedHeader = [...sortedDoc.querySelectorAll(
      'table[data-rf-table="class-relationships"] thead th')]
      .find(th => th.querySelector('[data-sort-key="priority"]'));
    expect(sortedHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(sortedHeader.querySelector('.rf-sort-indicator').textContent).toBe('▲');
    expect(sortedHeader.querySelector('.rf-sort-indicator').getAttribute('aria-hidden')).toBe('true');
  });

  it('announces search match counts via a live region next to each toolbar', () => {
    const region = doc.querySelector('[data-rf-match="class-relationships"]');
    expect(region).not.toBeNull();
    expect(region.getAttribute('role')).toBe('status');
  });
});
