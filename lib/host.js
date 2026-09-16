// Hosting-environment and deployment configuration detection.
//
// Three input channels, in priority order:
//   1. <meta name="platform"> tag (explicit deployment override, client only)
//   2. explicit parameter (tests / callers)
//   3. NEXT_PUBLIC_HOSTING_ENVIRONMENT env var (SSR/build-time, plan §8)
//   4. hostname heuristics (*.gitlab.io / *.bitbucket.io / keywords)
//
// Pure resolvers take their inputs explicitly so they are testable without a
// DOM; the convenience wrappers read from the runtime environment.

const PLATFORMS = new Set(['github', 'gitlab', 'bitbucket']);

export function detectFromHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.endsWith('.gitlab.io') || host.split('.').includes('gitlab')) {
    return 'gitlab';
  }
  if (host.endsWith('.bitbucket.io') || host.split('.').includes('bitbucket')) {
    return 'bitbucket';
  }
  // github.io, github.com, GitHub Enterprise domains and anything else
  return 'github';
}

// Pure resolver (no DOM/env access); used by the wrappers below and by tests.
export function resolveHostingEnvironment({ meta, explicit, env, hostname } = {}) {
  for (const candidate of [meta, explicit, env]) {
    const platform = String(candidate || '').toLowerCase();
    if (PLATFORMS.has(platform)) return platform;
  }
  return detectFromHostname(hostname);
}

function readEnv(name) {
  // NEXT_PUBLIC_* vars are inlined by the bundler; guard for bare Node.
  return typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
}

// Detect which hosting environment the site is deployed to.
export function detectHostingEnvironment(hostname, explicitPlatform) {
  // Explicit meta tag (client only; preserved for self-managed deployments)
  if (typeof document !== 'undefined') {
    const platformMeta = document.querySelector('meta[name="platform"]');
    if (platformMeta && platformMeta.content) {
      const platform = String(platformMeta.content).toLowerCase();
      if (PLATFORMS.has(platform)) return platform;
    }
  }

  if (explicitPlatform && PLATFORMS.has(String(explicitPlatform).toLowerCase())) {
    return String(explicitPlatform).toLowerCase();
  }

  // SSR / build time: no window — rely on the deployment env var.
  const env = readEnv('NEXT_PUBLIC_HOSTING_ENVIRONMENT');
  if (env && PLATFORMS.has(String(env).toLowerCase())) {
    return String(env).toLowerCase();
  }
  if (typeof window === 'undefined') {
    return 'github';
  }

  const host = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return detectFromHostname(host);
}

// Deployment configuration from meta tags, with env-var fallbacks (plan §8:
// RSCs read env vars; the client provider reads meta tags as fallback).
export function getSubmissionTarget(readMeta, envValue) {
  const env = envValue ?? readEnv('NEXT_PUBLIC_SUBMISSION_TARGET');
  if (env) return env;
  const meta = typeof readMeta === 'function' ? readMeta('submission-target') : undefined;
  return meta || undefined;
}

export function getPlatformBaseUrl(readMeta, envValue) {
  const env = envValue ?? readEnv('NEXT_PUBLIC_PLATFORM_BASE_URL');
  if (env) return env;
  const meta = typeof readMeta === 'function' ? readMeta('platform-base-url') : undefined;
  return meta || undefined;
}

// Read a meta tag by name (undefined when unavailable).
export function readMetaTag(name) {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || undefined;
}
