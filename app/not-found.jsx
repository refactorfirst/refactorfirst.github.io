'use client';

import { Suspense, lazy, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isValidGitHubName, STATIC_PAGES } from '../lib/routes.js';
import { getBasePath } from '../lib/base-path';

// Lazy-loaded so the report-rendering bundle (renderer, table enhancement)
// stays out of the first-party budget of pages that never show a report —
// the chunk is only fetched when a branch deep link actually renders one.
const ReportView = lazy(() => import('../components/report-view'));

// Exported for the 404.html produced by the static export. GitHub Pages (and
// similar static hosts) serve this page for any path that has no exported
// HTML file. Two recovery behaviors:
//  - Branch deep links (/user/repo/<branch>) that are not pre-generated are
//    rendered in place by ReportView at the original URL — the branch is a
//    path parameter, so no redirect is needed (Technical Appendix §6).
//  - Repos added after the last deploy get the "recently added" note
//    (Technical Appendix §5).
export default function NotFound() {
  const pathname = usePathname() || '';
  const basePath = getBasePath();
  const path = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length) || '/'
    : pathname;
  const segments = path.split('/').filter(Boolean);
  const [username, repository] = segments;

  const isRepoLike =
    segments.length >= 2 &&
    username !== 'add-repo' &&
    !STATIC_PAGES.has(username) &&
    isValidGitHubName(username) &&
    isValidGitHubName(repository);

  // Branch names may contain slashes, so any segments beyond user/repo
  // belong to the branch name. Each segment must pass the same validation
  // as classifyRoute's branch guard: the branch is interpolated into raw
  // content URLs, so path-injection values must fall through to the 404
  // copy instead of being fetched.
  const branchSegments = segments.slice(2);
  const isBranchDeepLink =
    segments.length >= 3 &&
    isRepoLike &&
    branchSegments.every(segment => isValidGitHubName(segment));

  // The exported 404.html statically carries the site title; report shells
  // pre-generate `<user>/<repo>@<branch>` titles, so match them here.
  useEffect(() => {
    if (isBranchDeepLink) {
      document.title = `${username}/${repository}@${branchSegments.join('/')} - RefactorFirst`;
    }
  }, [isBranchDeepLink, username, repository, branchSegments]);

  if (isBranchDeepLink) {
    return (
      <Suspense fallback={<p className="loading" role="status">Loading report&hellip;</p>}>
        <ReportView username={username} repository={repository} branch={branchSegments.join('/')} />
      </Suspense>
    );
  }

  return (
    <section className="error-page error-404" role="alert">
      <h1>Page Not Found</h1>
      <p>
        The page or repository you requested does not exist. If you were looking for a
        report, check that the repository contains
        <code>.refactorfirst/refactor-first.json</code> on its default branch.
      </p>
      {segments.length === 2 && isRepoLike && (
        <p className="info">
          This repository may have been recently added. The listing is updated during deployment.
          If you just submitted this repository, please wait a few minutes and try again.
        </p>
      )}
      <p>
        <Link href="/">Back to home</Link> &middot; <Link href="/getting-started">Getting Started</Link>
      </p>
    </section>
  );
}
