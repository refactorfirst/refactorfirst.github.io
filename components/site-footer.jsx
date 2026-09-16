import Link from 'next/link';

// Site footer. Ported from legacy index.html.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        <Link href="/privacy-policy">Privacy Policy</Link> &middot;{' '}
        <Link href="/terms-of-service">Terms of Service</Link> &middot; Powered by{' '}
        <a href="https://github.com/refactorfirst/refactorfirst" target="_blank" rel="noopener noreferrer">
          RefactorFirst
        </a>
      </p>
    </footer>
  );
}
