'use client';

// Loads the vendored Sentry bridge (public/widgets/sentry-bridge.js) on
// every page. The bridge is a no-op unless a <meta name="sentry-dsn"> tag
// is present, so deployments without a DSN pay nothing.

import Script from 'next/script';
import { withBasePath } from '../lib/base-path';

export default function SentryProvider() {
  return <Script type="module" src={withBasePath('/widgets/sentry-bridge.js')} strategy="lazyOnload" />;
}
