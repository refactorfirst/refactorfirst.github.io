import { test, expect } from '@playwright/test';

// Real RefactorFirst report schema (see tests/fixtures/junit4-report.json
// for a full-size sample published by the plugin).
const SAMPLE_REPORT = {
  project: {
    name: 'refactorfirst',
    version: '0.5.1',
    repoUrl: 'https://github.com/refactorfirst/refactorfirst',
    scanTimestamp: '9/9/26, 8:06 PM',
    hasAnyDisharmony: true
  },
  classMap: {
    graphId: 'classGraph',
    classCount: 3,
    relationshipCount: 2,
    dotThreshold: 4000,
    dotThresholdExceeded: false,
    dot: 'strict digraph G {\nGitLogReader -> CostBenefitCalculator [ label = "2" weight = "2" ];\nGitLogReader -> GitLogEntry [ label = "1" weight = "1" ];\n}',
    hasEdges: true
  },
  packageMap: {
    graphId: 'packageGraph',
    classCount: 2,
    relationshipCount: 1,
    dotThreshold: 4000,
    dotThresholdExceeded: false,
    dot: 'strict digraph G {\ngit -> cbc [ label = "1" weight = "1" ];\n}',
    hasEdges: true
  },
  classRelationshipsToRemove: {
    cycleCount: 0, relationshipsToRemoveCount: 0, hasRelationships: false, relationships: []
  },
  packageRelationshipsToRemove: {
    cycleCount: 0, relationshipsToRemoveCount: 0, hasRelationships: false, relationships: []
  },
  hasDisharmonies: true,
  disharmonies: [
    {
      type: 'God Class',
      anchorId: 'GOD',
      title: 'God Classes',
      methodLevel: false,
      problem: 'God Classes take on too much responsibility,',
      solution: 'Extract related islands of functionality into separate classes.',
      maxPriority: 2,
      chart: {
        canvasId: 'chart_GOD',
        bubbles: [
          {
            id: 'GitLogReader.java', label: 'GitLogReader.java', x: 1, y: 2, r: 24,
            priority: 1, effortRank: 1, changePronenessRank: 2,
            color: 'rgba(235, 64, 52, 0.75)', borderColor: 'rgb(235, 64, 52)'
          }
        ],
        xaxisLabel: 'Effort to refactor',
        yaxisLabel: 'Relative churn (impact)'
      },
      table: {
        headers: ['Class', 'Priority'],
        rows: [
          { cells: [
            { content: '<code>org.hjug.git.GitLogReader</code>', align: 'left' },
            { content: '1', align: 'right' }
          ] }
        ]
      }
    }
  ],
  classCycles: { hasCycles: false, summary: [], largestCycle: { hasCycleMap: false } }
};

test.beforeEach(async ({ page }) => {
  // Mock GitHub raw content so tests never hit the network.
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_REPORT) });
    } else if (url.endsWith('.mustache')) {
      route.fulfill({ status: 404 });
    } else {
      route.continue();
    }
  });
});

test('landing page loads with hero, search and menu', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('#menu-search-input')).toBeVisible();
  await expect(page.locator('#top-menu .menu-links a[href="/about"]')).toBeVisible();
  await expect(page.locator('text=Add My Repo')).toBeVisible();
});

test('search navigates to a repository report', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const search = page.locator('.hero-search input');
  await search.fill('refactor');
  const option = page.locator('.hero-search .search-results li', { hasText: 'refactorfirst/refactorfirst' });
  await option.click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/refactorfirst\/refactorfirst$/);
  await expect(page.locator('#app')).toContainText('refactorfirst');
});

test('report renders all sections from repository JSON with fallback template', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').first()).toContainText('RefactorFirst Report for refactorfirst 0.5.1');
  await expect(page.locator('a#CLASSMAP')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'God Classes', level: 1 })).toBeVisible();
  await expect(page.locator('canvas#chart_GOD')).toBeAttached();
  await expect(page.locator('text=org.hjug.git.GitLogReader')).toBeVisible();
  await expect(page.locator('#publishDate')).toContainText('Last Published:');
});

test('branch fallback shows report from master', async ({ page }) => {
  let requested = [];
  await page.unroute('**/raw.githubusercontent.com/**');
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    requested.push(url);
    if (url.includes('/main/.refactorfirst/refactor-first.json')) {
      route.fulfill({ status: 404 });
    } else if (url.includes('/master/.refactorfirst/refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_REPORT) });
    } else {
      route.fulfill({ status: 404 });
    }
  });

  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').first()).toContainText('refactorfirst');
  expect(requested.some(u => u.includes('/main/'))).toBe(true);
  expect(requested.some(u => u.includes('/master/'))).toBe(true);
});

test('unknown repository shows a friendly 404 page', async ({ page }) => {
  await page.unroute('**/raw.githubusercontent.com/**');
  await page.route('**/raw.githubusercontent.com/**', route => route.fulfill({ status: 404 }));
  await page.goto('/ghost/missing');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.error-page')).toBeVisible();
  await expect(page.locator('.error-page a[href="/"]')).toBeVisible();
});

test('user listing page shows repositories alphabetically', async ({ page }) => {
  await page.goto('/refactorfirst');
  await page.waitForLoadState('networkidle');
  const cards = page.locator('.repo-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('refactorfirst');
});

test('static pages render: about and getting started', async ({ page }) => {
  await page.goto('/about');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('About RefactorFirst');
  await page.goto('/getting-started');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('Getting Started');
  await expect(page.locator('code', { hasText: 'refactorfirst:jsonReport' }).first()).toBeVisible();
});

test('add-repo form renders directly, without any login', async ({ page }) => {
  await page.goto('/add-repo');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('form#repo-form')).toBeVisible();
  await expect(page.locator('#repo-owner')).toBeVisible();
  await expect(page.locator('#repo-name')).toBeVisible();
  // No login button exists anymore
  await expect(page.locator('#login-github')).toHaveCount(0);
});

test('submission validates input client-side before any network call', async ({ page }) => {
  await page.goto('/add-repo');
  await page.waitForLoadState('networkidle');
  await page.click('button[type="submit"]');
  await expect(page.locator('.form-status')).toContainText('required');
});

test('valid submission opens a pre-filled GitHub issue in a new tab', async ({ page, context }) => {
  await page.route('**/api.github.com/repos/octocat/hello-world', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ default_branch: 'main' }) }));
  // Never load the real GitHub issue page; the popup content is irrelevant.
  await context.route(/github\.com/, route => route.fulfill({ status: 200, body: '<html>stub</html>' }));

  await page.goto('/add-repo');
  await page.waitForLoadState('networkidle');
  await page.fill('#repo-owner', 'octocat');
  await page.fill('#repo-name', 'hello-world');

  const popupPromise = page.waitForEvent('popup');
  await page.click('button[type="submit"]');
  const popup = await popupPromise;

  const popupUrl = new URL(popup.url());
  expect(popupUrl.hostname).toBe('github.com');
  expect(popupUrl.pathname).toBe('/refactorfirst/refactorfirst.github.io/issues/new');
  expect(popupUrl.searchParams.get('title')).toBe('Add repository: octocat/hello-world');
  await popup.close();

  await expect(page.locator('.form-status')).toContainText('Continue on GitHub');
});

test('submission of a repository without a report shows an error', async ({ page }) => {
  await page.route('**/api.github.com/repos/ghost/nope', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/add-repo');
  await page.waitForLoadState('networkidle');
  await page.fill('#repo-owner', 'ghost');
  await page.fill('#repo-name', 'nope');
  await page.click('button[type="submit"]');
  await expect(page.locator('.form-status')).toContainText('Repository not found');
});

test('interactive popup buttons work without inline handlers', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForLoadState('networkidle');
  const overlay = page.locator('#overlay');
  await expect(overlay).toBeHidden();
  await page.getByRole('button', { name: 'Show classGraph 2D' }).click();
  await expect(overlay).toBeVisible();
  await page.locator('#popup-classGraph .close-btn').click();
  await expect(overlay).toBeHidden();
});

test('malicious report data cannot inject scripts or handlers', async ({ page }) => {
  const poisoned = JSON.parse(JSON.stringify(SAMPLE_REPORT));
  poisoned.disharmonies[0].solution =
    '<img src=x onerror="window.__xss=1"><script>window.__xss2=1</script>';
  await page.unroute('**/raw.githubusercontent.com/**');
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(poisoned) });
    } else {
      route.fulfill({ status: 404 });
    }
  });

  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'God Classes', level: 1 })).toBeVisible();
  await expect(page.locator('img[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.evaluate(() => window.__xss2)).toBeUndefined();
});

test('top menu height stays within 140px', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const box = await page.locator('#top-menu').boundingBox();
  expect(box.height).toBeLessThanOrEqual(140);
});
