import SiteHeader from '../components/site-header';
import SiteFooter from '../components/site-footer';
import SentryProvider from '../components/sentry-provider';
import { loadListedRepositories } from '../lib/repositories.js';
import './globals.css';

// frame-ancestors is intentionally served via HTTP header (ignored in meta);
// platform deployment docs list the header. The `submission-target` meta names
// the "<owner>/<repo>" project whose issue tracker receives submissions;
// self-managed GitLab deployments also set a platform-base-url meta.
// NOTE: after `next build`, scripts/fix-csp-hashes.mjs injects sha256 hashes
// of the inline bootstrap scripts into this policy so the strict CSP survives
// the static export (see plans/nextjs-conversion.md Spike Results C).
const CSP =
  "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://esm.sh https://buttons.github.io 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; img-src 'self' https://avatars.githubusercontent.com https://buttons.github.io https://github.githubassets.com data:; connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://cdn.jsdelivr.net https://esm.sh https://gitlab.com https://api.gitlab.com https://bitbucket.org https://api.bitbucket.org; base-uri 'self';";

export const metadata = {
  title: 'RefactorFirst - Know Where to Refactor First',
  icons: { icon: '/assets/logo.png' },
};

export default function RootLayout({ children }) {
  const repositories = loadListedRepositories();
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="submission-target" content="refactorfirst/refactorfirst.github.io" />
        <meta name="sentry-dsn" content="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/mvp.css@1.15.0/mvp.css"
        />
      </head>
      <body>
        <SiteHeader repositories={repositories} />
        <main id="app" tabIndex={-1}>{children}</main>
        <SiteFooter />
        <SentryProvider />
      </body>
    </html>
  );
}
