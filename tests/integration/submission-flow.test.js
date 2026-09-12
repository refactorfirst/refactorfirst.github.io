import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';
import { storeToken, logout } from '../../js/oauth-handler.js';

describe('Repository submission flow integration', () => {
  let mockFetch, app, root;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    sessionStorage.clear();
    mockFetch = spyOn(global, 'fetch');
  });

  afterEach(() => {
    mockFetch.mockRestore();
    logout();
  });

  it('requires login before showing the submission form', async () => {
    app = createApp({ root });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();
    expect(root.querySelector('#login-github')).not.toBeNull();
    expect(root.querySelector('form#repo-form')).toBeNull();
  });

  it('renders the form with user info when authenticated', async () => {
    storeToken('token');
    mockFetch.mockImplementation(requested => {
      if (requested === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/1' })
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    expect(root.querySelector('form#repo-form')).not.toBeNull();
    expect(root.textContent).toContain('octocat');
    expect(root.querySelector('img.user-avatar')).not.toBeNull();
  });

  it('shows validation errors for empty input without API calls', async () => {
    storeToken('token');
    mockFetch.mockImplementation(requested => {
      if (requested === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ login: 'octocat', avatar_url: '' })
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    root.querySelector('form#repo-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.textContent).toContain('required');
    // Only the profile fetch should have happened
    expect(mockFetch.mock.calls.filter(c => c[0] === 'https://api.github.com/user').length).toBe(1);
  });

  it('submits and shows success feedback', async () => {
    storeToken('token');
    mockFetch.mockImplementation(requested => {
      if (requested === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ login: 'octocat', avatar_url: '' })
        });
      }
      if (requested.includes('/collaborators/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ permission: 'admin' }) });
      }
      if (requested.endsWith('api.github.com/repos/octocat/hello-world')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (requested.includes('raw.githubusercontent.com/octocat/hello-world/main/')) {
        return Promise.resolve({ ok: true });
      }
      if (requested.endsWith('/dispatches')) {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    root.querySelector('#repo-owner').value = 'octocat';
    root.querySelector('#repo-name').value = 'hello-world';
    root.querySelector('form#repo-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('success')).toBe(true);
    expect(root.querySelector('button[type="submit"]').disabled).toBe(false);
  });

  it('requires .refactorfirst/refactor-first.json on main or the default branch', async () => {
    storeToken('token');
    mockFetch.mockImplementation(requested => {
      if (requested === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ login: 'octocat', avatar_url: '' })
        });
      }
      if (requested.includes('/collaborators/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ permission: 'write' }) });
      }
      if (requested.endsWith('api.github.com/repos/octocat/no-report')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'develop' }) });
      }
      // All raw content requests 404: no report on main or the default branch
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    root.querySelector('#repo-owner').value = 'octocat';
    root.querySelector('#repo-name').value = 'no-report';
    root.querySelector('form#repo-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe(
      'The repository specified must have a .refactorfirst/refactor-first.json file present.'
    );
    // The main branch was checked before the default branch
    const rawCalls = mockFetch.mock.calls.map(c => c[0]).filter(u => u.includes('raw.githubusercontent.com'));
    expect(rawCalls[0]).toContain('/main/');
    expect(rawCalls[1]).toContain('/develop/');
    expect(mockFetch.mock.calls.some(c => c[0].endsWith('/dispatches'))).toBe(false);
  });

  it('shows an error when access is denied', async () => {
    storeToken('token');
    mockFetch.mockImplementation(requested => {
      if (requested === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ login: 'octocat', avatar_url: '' })
        });
      }
      if (requested.includes('/collaborators/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    root.querySelector('#repo-owner').value = 'other';
    root.querySelector('#repo-name').value = 'private-repo';
    root.querySelector('form#repo-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await app.pendingSubmissions();

    const status = root.querySelector('.form-status');
    expect(status.classList.contains('error')).toBe(true);
    expect(mockFetch.mock.calls.some(c => c[0].endsWith('/dispatches'))).toBe(false);
  });
});
