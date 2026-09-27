import { Suspense } from 'react';
import SiteHeader from '../components/site-header';
import SiteFooter from '../components/site-footer';
import Breadcrumbs from '../components/breadcrumbs';
import SentryProvider from '../components/sentry-provider';
import ThemeToggle from '../components/theme-toggle';
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

/**
 * Renders the site shell with navigation, breadcrumbs, and page content.
 *
 * @param {object} props - Layout props.
 * @param {import('react').ReactNode} props.children - Content of the active page.
 * @returns {import('react').ReactElement} The root HTML document.
 */
export default function RootLayout({ children }) {
  const repositories = loadListedRepositories();
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="submission-target" content="refactorfirst/refactorfirst.github.io" />
        <meta name="sentry-dsn" content="" />
        {/* Both palettes are supported; declaring it pre-stylesheet keeps
            native UI (scrollbars, form controls, the pre-CSS canvas) from
            flashing light for dark-mode users. */}
        <meta name="color-scheme" content="light dark" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/mvp.css@1.15.0/mvp.css"
        />
      </head>
      <body>
        <SiteHeader repositories={repositories} />
        {/* Color theme toggle on a row below the header: .theme-bar reuses
            the breadcrumbs' alignment formula (--width-content column,
            0.8rem horizontal padding, border-box) so the toggle's right
            edge sits flush with the menu bar's right content edge,
            mirroring how the breadcrumb trail aligns with the bar's left
            edge (plans/css-only-dark-mode.md). */}
        <div className="theme-bar">
          <ThemeToggle />
        </div>
        {/* Theme persistence shim (plans/css-only-dark-mode.md): switching
            itself is pure CSS (radio + :has() in globals.css); this inline
            script only restores the saved choice into the radios before
            first paint and records changes. It must stay AFTER the
            .theme-bar markup (the radios have to be parsed before it can
            check them) and before any meaningful page content. It sets the
            checked *property* (never the attribute), so React hydration
            never sees a mismatch. scripts/fix-csp-hashes.mjs hashes it into
            the CSP at build time; with JS disabled the toggle still works
            per page view. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var r;try{r=localStorage.getItem('rf-theme')}catch(e){}if(r==='light'||r==='dark'){var i=document.getElementById('rf-theme-'+r);if(i)i.checked=true}document.addEventListener('change',function(e){var t=e.target;if(t&&t.name==='rf-theme'){try{localStorage.setItem('rf-theme',t.value)}catch(_){}}})})();"
          }}
        />
        {/* Breadcrumb trail under the menu (report/user routes only). Suspense
            is required because useSearchParams deopts otherwise (static
            export; the fallback keeps prerendered HTML crumb-free). */}
        <Suspense fallback={null}>
          <Breadcrumbs />
        </Suspense>
        <main id="app" tabIndex={-1}>{children}</main>
        <SiteFooter />
        <SentryProvider />
      </body>
    </html>
  );
}
