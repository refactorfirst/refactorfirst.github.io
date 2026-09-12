import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';
import { getToken, logout, isAuthenticated } from '../../js/oauth-handler.js';

describe('OAuth flow integration', () => {
  let mockFetch, app, root, navigations;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    navigations = [];
    sessionStorage.clear();
    mockFetch = spyOn(global, 'fetch');
  });

  afterEach(() => {
    mockFetch.mockRestore();
    logout();
  });

  it('handles the OAuth callback, exchanges the code and returns to /add-repo', async () => {
    sessionStorage.setItem('oauth_state', 'valid-state');
    sessionStorage.setItem('oauth_code_verifier', 'verifier');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-token', token_type: 'bearer' })
    });

    app = createApp({ root, onNavigate: to => navigations.push(to) });
    history.replaceState(null, '', '/add-repo/callback?code=authcode&state=valid-state');
    await app.handleRoute();

    expect(getToken()).toBe('new-token');
    expect(isAuthenticated()).toBe(true);
    expect(navigations).toEqual(['/add-repo']);
  });

  it('shows the OAuth error page on state mismatch', async () => {
    sessionStorage.setItem('oauth_state', 'expected');
    app = createApp({ root });
    history.replaceState(null, '', '/add-repo/callback?code=x&state=tampered');
    await app.handleRoute();

    expect(getToken()).toBeNull();
    expect(root.querySelector('.error-oauth')).not.toBeNull();
  });

  it('shows the OAuth error page when the user denies access', async () => {
    sessionStorage.setItem('oauth_state', 's');
    app = createApp({ root });
    history.replaceState(null, '', '/add-repo/callback?error=access_denied&state=s');
    await app.handleRoute();
    expect(root.querySelector('.error-oauth')).not.toBeNull();
  });

  it('clicking login starts the authorization flow', async () => {
    app = createApp({ root, onExternalRedirect: url => navigations.push(url) });
    history.replaceState(null, '', '/add-repo');
    await app.handleRoute();

    root.querySelector('#login-github').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(navigations.length).toBe(1);
    expect(navigations[0]).toContain('https://github.com/login/oauth/authorize');
    expect(navigations[0]).toContain('client_id=');
    expect(navigations[0]).toContain('code_challenge=');
  });
});
