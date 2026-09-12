import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  generateState,
  generatePKCE,
  buildAuthorizationUrl,
  parseCallback,
  exchangeCodeForToken,
  storeToken,
  getToken,
  clearSession,
  isAuthenticated,
  fetchUserProfile,
  logout
} from '../../js/oauth-handler.js';

const CLIENT_CONFIG = {
  clientId: 'test-client-id',
  redirectUri: 'https://refactorfirst.github.io/add-repo/callback',
  scopes: ['public_repo', 'read:user']
};

describe('generateState (CSRF protection)', () => {
  it('generates a random URL-safe state value', () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9\-_]{16,}$/);
  });

  it('generates unique states', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('generatePKCE', () => {
  it('generates a code verifier and S256 challenge', async () => {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });

  it('derives different challenges for different verifiers', async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});

describe('buildAuthorizationUrl', () => {
  beforeEach(() => sessionStorage.clear());

  it('builds a GitHub authorization URL with PKCE parameters', async () => {
    const url = new URL(await buildAuthorizationUrl(CLIENT_CONFIG));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(CLIENT_CONFIG.redirectUri);
    expect(url.searchParams.get('scope')).toBe('public_repo read:user');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('persists state and code verifier in sessionStorage', async () => {
    const url = new URL(await buildAuthorizationUrl(CLIENT_CONFIG));
    expect(sessionStorage.getItem('oauth_state')).toBe(url.searchParams.get('state'));
    expect(sessionStorage.getItem('oauth_code_verifier')).toBeTruthy();
  });
});

describe('parseCallback', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns the code when state matches', () => {
    sessionStorage.setItem('oauth_state', 'expected-state');
    const result = parseCallback('?code=abc123&state=expected-state');
    expect(result.code).toBe('abc123');
  });

  it('throws when the state does not match', () => {
    sessionStorage.setItem('oauth_state', 'expected-state');
    expect(() => parseCallback('?code=abc&state=attacker-state'))
      .toThrow('OAuth state mismatch');
  });

  it('throws when no state was stored (session lost)', () => {
    expect(() => parseCallback('?code=abc&state=some-state'))
      .toThrow('OAuth state mismatch');
  });

  it('throws when the callback omits the state parameter', () => {
    sessionStorage.setItem('oauth_state', 'expected-state');
    expect(() => parseCallback('?code=abc'))
      .toThrow('OAuth state mismatch');
  });

  it('throws when the user denied access', () => {
    sessionStorage.setItem('oauth_state', 's');
    expect(() => parseCallback('?error=access_denied&state=s'))
      .toThrow('access_denied');
  });

  it('throws when no code is present', () => {
    sessionStorage.setItem('oauth_state', 's');
    expect(() => parseCallback('?state=s')).toThrow();
  });
});

describe('token management', () => {
  beforeEach(() => sessionStorage.clear());

  it('stores, retrieves and clears the token in sessionStorage', () => {
    expect(isAuthenticated()).toBe(false);
    storeToken('token-xyz');
    expect(getToken()).toBe('token-xyz');
    expect(isAuthenticated()).toBe(true);
    clearSession();
    expect(getToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});

describe('exchangeCodeForToken', () => {
  let mockFetch;
  beforeEach(() => {
    sessionStorage.clear();
    mockFetch = spyOn(global, 'fetch');
  });
  afterEach(() => mockFetch.mockRestore());

  it('exchanges the code for an access token and stores it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'gho_token', token_type: 'bearer' })
    });

    const token = await exchangeCodeForToken({
      code: 'abc',
      codeVerifier: 'verifier',
      clientId: 'test-client-id',
      redirectUri: CLIENT_CONFIG.redirectUri
    });

    expect(token).toBe('gho_token');
    expect(getToken()).toBe('gho_token');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(options.method).toBe('POST');
    expect(options.headers.Accept).toBe('application/json');
    const body = new URLSearchParams(options.body);
    expect(body.get('code')).toBe('abc');
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('redirect_uri')).toBe(CLIENT_CONFIG.redirectUri);
  });

  it('throws when the exchange fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    await expect(exchangeCodeForToken({
      code: 'abc', codeVerifier: 'v', clientId: 'c', redirectUri: 'r'
    })).rejects.toThrow();
  });

  it('throws when GitHub returns an OAuth error payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: 'bad_verification_code' })
    });
    await expect(exchangeCodeForToken({
      code: 'abc', codeVerifier: 'v', clientId: 'c', redirectUri: 'r'
    })).rejects.toThrow('bad_verification_code');
  });
});

describe('fetchUserProfile', () => {
  let mockFetch;
  beforeEach(() => {
    sessionStorage.clear();
    mockFetch = spyOn(global, 'fetch');
  });
  afterEach(() => mockFetch.mockRestore());

  it('fetches the authenticated user profile', async () => {
    storeToken('valid-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/1' })
    });

    const profile = await fetchUserProfile();
    expect(profile.username).toBe('octocat');
    expect(profile.avatarUrl).toBe('https://avatars.githubusercontent.com/u/1');
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.github.com/user');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer valid-token');
  });

  it('throws when not authenticated', async () => {
    await expect(fetchUserProfile()).rejects.toThrow('Not authenticated');
  });
});

describe('logout', () => {
  it('clears the token and all OAuth session data', () => {
    storeToken('token');
    sessionStorage.setItem('oauth_state', 's');
    sessionStorage.setItem('oauth_code_verifier', 'v');
    logout();
    expect(isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('oauth_state')).toBeNull();
    expect(sessionStorage.getItem('oauth_code_verifier')).toBeNull();
  });
});
