import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Static-export parity (Technical Appendix §9): every repositories.txt entry
// must resolve to generated HTML; unknown paths serve the app 404 with a
// real 404 status; branch deep links render the requested branch after the
// client-side redirect.

const repositories = readFileSync('repositories.txt', 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean);

test('every listed repo page and user listing exists in the export', async ({ request }) => {
  for (const fullName of repositories) {
    const [username, repository] = fullName.split('/');
    const repoResponse = await request.get(`/${username}/${repository}`);
    expect(repoResponse.status(), `/${username}/${repository}`).toBe(200);
    const userResponse = await request.get(`/${username}`);
    expect(userResponse.status(), `/${username}`).toBe(200);
    // Default branches are pre-generated too
    for (const branch of ['main', 'master']) {
      const branchResponse = await request.get(`/${username}/${repository}/${branch}`);
      expect(branchResponse.status(), `/${username}/${repository}/${branch}`).toBe(200);
    }
  }
});

test('unknown paths get the app 404 with a real 404 status', async ({ request }) => {
  const response = await request.get('/definitely/unlisted-repo');
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).toContain('Page Not Found');
});

const SAMPLE_REPORT = {
  project: {
    name: 'refactorfirst', version: '1.0.0',
    repoUrl: 'https://github.com/refactorfirst/refactorfirst',
    scanTimestamp: '9/9/26, 8:06 PM', hasAnyDisharmony: false
  },
  classMap: { graphId: 'classGraph', classCount: 0, relationshipCount: 0, dotThreshold: 4000, dotThresholdExceeded: false, dot: '', hasEdges: false },
  packageMap: { graphId: 'packageGraph', classCount: 0, relationshipCount: 0, dotThreshold: 4000, dotThresholdExceeded: false, dot: '', hasEdges: false },
  classRelationshipsToRemove: { cycleCount: 0, relationshipsToRemoveCount: 0, hasRelationships: false, relationships: [] },
  packageRelationshipsToRemove: { cycleCount: 0, relationshipsToRemoveCount: 0, hasRelationships: false, relationships: [] },
  hasDisharmonies: false,
  disharmonies: [],
  classCycles: { hasCycles: false, summary: [], largestCycle: { hasCycleMap: false } }
};

test('branch deep link redirects to the repo shell and renders that branch', async ({ page }) => {
  const requested = [];
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    requested.push(url);
    if (url.includes('/develop/.refactorfirst/refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_REPORT) });
    } else {
      route.fulfill({ status: 404 });
    }
  });

  await page.goto('/refactorfirst/refactorfirst/develop');
  // Client redirect rewrites the URL to the repo shell carrying the branch
  await page.waitForURL('**/refactorfirst/refactorfirst/**?branch=develop**');
  await expect(page.locator('h1').first()).toContainText('RefactorFirst Report for refactorfirst');
  expect(requested.some(u => u.includes('/develop/.refactorfirst/refactor-first.json'))).toBe(true);
});

test('recently added repo note shows for unlisted /user/repo 404s', async ({ page }) => {
  await page.goto('/some-user/brand-new-repo');
  await expect(page.locator('.error-page')).toContainText('recently added');
});
