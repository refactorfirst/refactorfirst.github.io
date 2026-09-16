// Optional Sentry error tracking. Replaces assets/sentry-config.js for the
// Next.js build: bundlers rewrite runtime `import('https://...')` URLs, so
// the CDN SDK is loaded from this native module script instead. The DSN is
// read from the <meta name="sentry-dsn"> tag (empty disables reporting).
const dsn = document.querySelector('meta[name="sentry-dsn"]')?.content?.trim() || '';

if (dsn) {
  import('https://cdn.jsdelivr.net/npm/@sentry/browser@7/+esm')
    .then(Sentry => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0
      });
      window.Sentry = Sentry;
    })
    .catch(() => { /* Sentry unavailable - errors fall back to console */ })
    .finally(() => window.__rfMarkWidgetReady?.('sentry'));
} else {
  window.__rfMarkWidgetReady?.('sentry');
}
