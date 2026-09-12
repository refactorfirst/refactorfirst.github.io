import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';
import fs from 'node:fs';
import path from 'node:path';

const sampleJson = JSON.parse(
  fs.readFileSync(path.join(import.meta.dir, '../fixtures/sample-refactor-first.json'), 'utf8')
);
const sampleTemplate = fs.readFileSync(
  path.join(import.meta.dir, '../fixtures/sample-mustache-template.mustache'), 'utf8'
);

describe('Report rendering integration', () => {
  let mockFetch, app, root;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    mockFetch = spyOn(global, 'fetch');
  });

  afterEach(() => mockFetch.mockRestore());

  function respondJsonFor(url, data, { template = sampleTemplate } = {}) {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }
      if (requested.endsWith('.refactorfirst/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(template) });
      }
      void url;
      return Promise.resolve({ ok: false, status: 404 });
    });
  }

  it('renders the report for /user/repo', async () => {
    respondJsonFor(null, sampleJson);
    app = createApp({ root });
    history.replaceState(null, '', '/refactorfirst/refactorfirst');
    await app.handleRoute();
    expect(root.innerHTML).toContain('refactorfirst');
    expect(root.querySelector('h1').textContent).toContain('refactorfirst');
  });

  it('falls back from main to master', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.includes('/main/.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (requested.includes('/master/.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      if (requested.endsWith('.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(sampleTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/refactorfirst/refactorfirst');
    await app.handleRoute();
    expect(root.innerHTML).toContain('refactorfirst');
    expect(mockFetch.mock.calls.some(c => c[0].includes('/master/'))).toBe(true);
  });

  it('shows the not-found error page when no branch has a report', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    app = createApp({ root });
    history.replaceState(null, '', '/ghost/missing');
    await app.handleRoute();
    expect(root.querySelector('.error-page')).not.toBeNull();
    expect(root.textContent).toContain('Not Found');
  });

  it('uses the bundled fallback template when the repo has none', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      if (requested.endsWith('refactor-first-report.mustache') && requested.includes('raw.githubusercontent')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (requested.endsWith('assets/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<article>fallback: {{projectName}}</article>') });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/refactorfirst/refactorfirst');
    await app.handleRoute();
    expect(root.innerHTML).toContain('fallback: refactorfirst');
  });
});
