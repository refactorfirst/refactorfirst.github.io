// Optional Sentry error tracking. Loaded lazily by index.html when a
// DSN is configured. Keep the DSN empty to disable error reporting.
export const SENTRY_DSN = '';

export function initSentry() {
  if (!SENTRY_DSN || typeof window === 'undefined') return;
  import('https://cdn.jsdelivr.net/npm/@sentry/browser@7/+esm')
    .then(Sentry => {
      Sentry.init({
        dsn: SENTRY_DSN,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0
      });
      window.Sentry = Sentry;
    })
    .catch(() => { /* Sentry unavailable - errors fall back to console */ });
}
