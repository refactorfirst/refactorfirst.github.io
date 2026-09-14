import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';
import fs from 'node:fs';
import path from 'node:path';

// The full JUnit4 report published by RefactorFirst — the real data shape.
const sampleJson = JSON.parse(
  fs.readFileSync(path.join(import.meta.dir, '../fixtures/junit4-report.json'), 'utf8')
);
// The bundled fallback template is the same template the RefactorFirst
// report viewer uses; tests render the real thing.
const reportTemplate = fs.readFileSync(
  path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
);

describe('Report rendering integration', () => {
  let mockFetch, app, root;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    mockFetch = spyOn(global, 'fetch');
  });

  afterEach(() => mockFetch.mockRestore());

  function respondJsonFor(data, { remoteTemplate = '<article>remote-template</article>' } = {}) {
    mockFetch.mockImplementation(requested => {
      // The bundled template is authoritative — always serve the real asset.
      if (requested.endsWith('assets/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      if (requested.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }
      // Any repository-provided template request answers with a marker that
      // must never reach the DOM.
      if (requested.endsWith('.refactorfirst/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(remoteTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  }

  async function renderSampleReport(route = '/junit-team/junit4') {
    respondJsonFor(sampleJson);
    app = createApp({ root });
    history.replaceState(null, '', route);
    await app.handleRoute();
    await app.pendingSubmissions();
  }

  it('renders all report sections for /user/repo', async () => {
    await renderSampleReport();

    expect(root.querySelector('h1').textContent).toContain('RefactorFirst');
    expect(root.textContent).toContain('JUnit 4.13.3-SNAPSHOT');
    // Class map + counts
    expect(root.textContent).toContain('Number of classes: 335');
    expect(root.querySelector('#classGraph')).not.toBeNull();
    // Class/package relationships-to-remove tables
    expect(root.textContent).toContain('Class Relationship Removal Priority');
    expect(root.textContent).toContain('Package Relationship Removal Priority');
    // Disharmonies with chart canvases and tables
    expect(root.textContent).toContain('God Classes');
    expect(root.querySelector('canvas#chart_GOD')).not.toBeNull();
    expect(root.textContent).toContain('Change Proneness Rank');
    // Cycles
    expect(root.textContent).toContain('Largest Class Cycle');
    // Footer timestamp
    expect(root.textContent).toContain('Last Published:');
  });

  it('runs enhanceReport: dots exposed and popup globals wired', async () => {
    await renderSampleReport();
    expect(window.classGraph_dot).toContain('strict digraph');
    expect(window.packageGraph_dot).toContain('strict digraph');
    expect(typeof window.showPopup).toBe('function');
    expect(typeof window.createForceGraph).toBe('function');
    expect(typeof window.hidePopup).toBe('function');
  });

  it('shows the analysis-incomplete alert when project.analysisFailed is set', async () => {
    const failedReport = JSON.parse(JSON.stringify(sampleJson));
    failedReport.project.analysisFailed = true;
    respondJsonFor(failedReport);
    app = createApp({ root });
    history.replaceState(null, '', '/junit-team/junit4');
    await app.handleRoute();
    await app.pendingSubmissions();
    expect(root.textContent).toContain('Analysis incomplete');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('escapes renderedLabel in class relationships (upstream escaping hardening)', async () => {
    await renderSampleReport();
    // The report data carries HTML in renderedLabel; the template must escape it.
    const table = root.querySelector('.rf-report');
    const raw = root.innerHTML;
    expect(raw).toContain('&lt;a href=https://github.com/junit-team/junit4');
    expect(table).not.toBeNull();
  });

  it('falls back from main to master', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.includes('/main/.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (requested.includes('/master/.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      // The bundled template is always used; only JSON branch fallback matters.
      if (requested.endsWith('assets/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/junit-team/junit4');
    await app.handleRoute();
    await app.pendingSubmissions();
    expect(root.textContent).toContain('JUnit');
    expect(mockFetch.mock.calls.some(c => c[0].includes('/master/'))).toBe(true);
  });

  it('shows the not-found error page when no branch has a report', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('assets/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    app = createApp({ root });
    history.replaceState(null, '', '/ghost/missing');
    await app.handleRoute();
    expect(root.querySelector('.error-page')).not.toBeNull();
    expect(root.textContent).toContain('Not Found');
  });

  it('ignores any repository-provided template and always uses the bundled one', async () => {
    respondJsonFor(sampleJson, { remoteTemplate: '<article>malicious: {{project.name}}</article>' });
    app = createApp({ root });
    history.replaceState(null, '', '/junit-team/junit4');
    await app.handleRoute();
    await app.pendingSubmissions();
    expect(root.innerHTML).toContain('Class Map');
    expect(root.innerHTML).not.toContain('malicious');
    // The remote template endpoint must not even be requested
    expect(mockFetch.mock.calls.some(c => String(c[0]).endsWith('refactor-first-report.mustache')
      && !String(c[0]).endsWith('assets/refactor-first-report.mustache'))).toBe(false);
  });

  it('uses the bundled template when the repo has none', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      if (requested.endsWith('assets/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/junit-team/junit4');
    await app.handleRoute();
    await app.pendingSubmissions();
    expect(root.textContent).toContain('Class Map');
  });
});
