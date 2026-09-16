import Link from 'next/link';
import MenuToggle from './menu-toggle';
import MenuSearch from './menu-search';
import { withBasePath } from '../lib/base-path';

// Site header: brand logo, hamburger toggle, main navigation links and the
// type-ahead menu search pinned to the right side of the bar.
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
      </header>
    </>
  );
}
