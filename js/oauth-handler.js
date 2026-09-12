// GitHub OAuth 2.0 authorization code flow with PKCE.
// Tokens live only in sessionStorage and are cleared on logout/session end.

const TOKEN_KEY = 'oauth_access_token';
const STATE_KEY = 'oauth_state';
const VERIFIER_KEY = 'oauth_code_verifier';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_API_URL = 'https://api.github.com/user';

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// Random value used to correlate the OAuth redirect (CSRF protection).
export function generateState() {
  return base64UrlEncode(randomBytes(24));
}

// PKCE code verifier + S256 challenge.
export async function generatePKCE() {
  const codeVerifier = base64UrlEncode(randomBytes(48));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

// Build the GitHub authorization URL and persist state + verifier for the callback.
export async function buildAuthorizationUrl({ clientId, redirectUri, scopes }) {
  const state = generateState();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Validate the OAuth callback query string. Returns the authorization code.
export function parseCallback(search) {
  const params = new URLSearchParams(search || '');
  const error = params.get('error');
  if (error) {
    throw new Error(`OAuth error: ${error}`);
  }

  const state = params.get('state');
  const expected = sessionStorage.getItem(STATE_KEY);
  if (!state || state !== expected) {
    throw new Error('OAuth state mismatch - possible CSRF attack');
  }

  const code = params.get('code');
  if (!code) {
    throw new Error('OAuth callback missing authorization code');
  }
  return { code };
}

// Exchange the authorization code for an access token (PKCE).
export async function exchangeCodeForToken({ code, codeVerifier, clientId, redirectUri }) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }).toString()
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`OAuth error: ${data.error}`);
  }
  if (!data.access_token) {
    throw new Error('Token exchange response missing access token');
  }

  storeToken(data.access_token);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return data.access_token;
}

export function storeToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return getToken() !== null;
}

export async function fetchUserProfile() {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const response = await fetch(USER_API_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }
  const data = await response.json();
  return { username: data.login, avatarUrl: data.avatar_url };
}

// Remove token and any transient OAuth values.
export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
}

export function logout() {
  clearSession();
}
