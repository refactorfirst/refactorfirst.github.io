'use client';

// Breadcrumb trail rendered under the top menu: mirrors the current
// /<user>/<repo>/<branch> route so report viewers can navigate back up the
// hierarchy. Ancestor crumbs are links; the last crumb is the current page
// (plain text with aria-current="page"). Non-report routes render nothing.
//
// The report fetch announces the branch it actually loaded (a main 404 falls
// back to master) via BRANCH_RESOLVED_EVENT; the current crumb is relabelled
// to the resolved branch so the trail identifies the displayed report.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  breadcrumbsFor,
  reportMatchesFor,
  BRANCH_RESOLVED_EVENT
} from '../lib/breadcrumbs.js';

export default function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams ? searchParams.toString() : '';
  const routeKey = `${pathname}?${search}`;
  // The announced branch is keyed to the route it was announced on; a route
  // change resets it during render (the React-sanctioned alternative to a
  // setState call inside an effect).
  const [resolved, setResolved] = useState({ key: routeKey, branch: null });
  if (resolved.key !== routeKey) {
    setResolved({ key: routeKey, branch: null });
  }

  useEffect(() => {
    const onBranchResolved = event => {
      if (!reportMatchesFor(pathname || '/', event.detail)) return;
      const { branch } = event.detail;
      if (branch) setResolved({ key: routeKey, branch });
    };
    window.addEventListener(BRANCH_RESOLVED_EVENT, onBranchResolved);
    return () => window.removeEventListener(BRANCH_RESOLVED_EVENT, onBranchResolved);
  }, [pathname, routeKey]);

  const crumbs = breadcrumbsFor(
    pathname || '/',
    search,
    resolved.key === routeKey ? resolved.branch : null
  );
  if (crumbs.length === 0) return null;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map(crumb => (
          <li key={crumb.label}>
            {crumb.current ? (
              <span aria-current="page">{crumb.label}</span>
            ) : crumb.href ? (
              <Link href={crumb.href}>{crumb.label}</Link>
            ) : (
              <span>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
