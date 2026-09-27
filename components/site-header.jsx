import Link from 'next/link';
import MenuToggle from './menu-toggle';
import MenuSearch from './menu-search';
import ThemeToggle from './theme-toggle';
import { withBasePath } from '../lib/base-path';

// Site header: brand logo, hamburger toggle, main navigation links and the
// type-ahead menu search in the top bar, plus the three-mode color theme
// toggle on a right-aligned sub-row below the bar.
export default function SiteHeader({ repositories = [] }) {
  return (
    <>
      <a className="skip-link" href="#app">Skip to content</a>
      <header id="top-menu">
        <nav className="menu-bar" aria-label="Main navigation">
          <Link href="/" className="brand">
            <img src={withBasePath('/assets/logo.png')} alt="RefactorFirst logo" className="logo" width="32" height="32" />
          </Link>
          <MenuToggle />
          <ul id="menu-links" className="menu-links">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/add-repo">Add Your Repo</Link></li>
            <li><Link href="/getting-started">Getting Started</Link></li>
            <li><Link href="/documentation">Documentation</Link></li>
            <li><Link href="/faq">FAQ</Link></li>
            <li><Link href="/examples">Examples</Link></li>
            <li><Link href="/api">API</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/feedback">Feedback</Link></li>
            <li>
              <a href="https://github.com/refactorfirst/refactorfirst" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </li>
          </ul>
          <MenuSearch repositories={repositories} />
        </nav>
        {/* Theme sub-row below the menu bar: .theme-bar reuses the
            breadcrumbs' alignment formula (--width-content column, 0.8rem
            horizontal padding, border-box) so the toggle's right edge sits
            flush with the menu bar's right content edge, mirroring how the
            breadcrumb trail aligns with the bar's left edge
            (plans/css-only-dark-mode.md). */}
        <div className="theme-bar">
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
