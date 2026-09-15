import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';

describe('Repository submission flow integration', () => {
  let mockFetch, app, root, externalRedirects;

  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="submission-target" content="refactorfirst/refactorfirst.github.io">';
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    externalRedirects = [];
    mockFetch = spyOn(global, 'fetch');
  });

  afterEach(() => mockFetch.mockRestore());

  function buildApp(options = {}) {
    app = createApp({
      root,
      onExternalRedirect: url => externalRedirects.push(url),
      ...options
    });
    return app;
  }

  function submitForm(owner, repo) {
    root.querySelector('#repo-owner').value = owner;
    root.querySelector('#repo-name').value = repo;
    root.querySelector('form#repo-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
  }

  it('renders the submission form immediately without any login gate', async () => {
    buildApp();
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    expect(root.querySelector('form#repo-form')).not.toBeNull();
    expect(root.querySelector('#login-github')).toBeNull();
    expect(root.textContent).toContain('issue');
  });

  it('shows validation errors for empty input without API calls', async () => {
    buildApp();
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    submitForm('', '');
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.textContent).toContain('required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('opens the pre-filled GitHub issue after a successful check', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('api.github.com/repos/octocat/hello-world')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (requested.includes('raw.githubusercontent.com/octocat/hello-world/refs/heads/main/')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    buildApp();
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    submitForm('octocat', 'hello-world');
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('success')).toBe(true);
    expect(root.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(externalRedirects.length).toBe(1);
    const issueUrl = new URL(externalRedirects[0]);
    expect(issueUrl.origin + issueUrl.pathname)
      .toBe('https://github.com/refactorfirst/refactorfirst.github.io/issues/new');
    expect(issueUrl.searchParams.get('title')).toBe('Add repository: octocat/hello-world');
  });

  it('opens a GitLab issue on a GitLab deployment', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested === 'https://gitlab.example.com/api/v4/projects/group%2Fproj') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (requested === 'https://gitlab.example.com/group/proj/-/raw/main/.refactorfirst/refactor-first.json') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    document.head.innerHTML =
      '<meta name="submission-target" content="refactorfirst/refactorfirst.gitlab.io">' +
      '<meta name="platform-base-url" content="https://gitlab.example.com">';
    buildApp({ hostEnvironment: 'gitlab' });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    submitForm('group', 'proj');
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('success')).toBe(true);
    expect(externalRedirects.length).toBe(1);
    const issueUrl = new URL(externalRedirects[0]);
    expect(issueUrl.origin + issueUrl.pathname)
      .toBe('https://gitlab.example.com/refactorfirst/refactorfirst.gitlab.io/-/issues/new');
    expect(issueUrl.searchParams.get('issue[title]')).toBe('Add repository: group/proj');
  });

  it('requires .refactorfirst/refactor-first.json on main, default branch or master', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('api.github.com/repos/octocat/no-report')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'develop' }) });
      }
      // All raw content requests 404: no report on main, develop or master
      return Promise.resolve({ ok: false, status: 404 });
    });

    buildApp();
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    submitForm('octocat', 'no-report');
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe(
      'The repository specified must have a .refactorfirst/refactor-first.json file present.'
    );
    const rawCalls = mockFetch.mock.calls.map(c => c[0]).filter(u => u.includes('raw.githubusercontent.com'));
    expect(rawCalls[0]).toContain('/main/');
    expect(rawCalls[1]).toContain('/develop/');
    expect(rawCalls[2]).toContain('/master/');
    expect(externalRedirects.length).toBe(0);
  });

  it('shows an error when the repository does not exist', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    buildApp();
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    submitForm('ghost', 'nope');
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toContain('Repository not found');
    expect(externalRedirects.length).toBe(0);
  });
});
