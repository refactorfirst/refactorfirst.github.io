'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isValidGitHubName, STATIC_PAGES } from '../lib/routes.js';
import { getBasePath } from '../lib/base-path';

// Exported for the 404.html produced by the static export. GitHub Pages (and
// similar static hosts) serve this page for any path that has no exported
// HTML file. Two recovery behaviors:
//  - Branch deep links (/user/repo/<branch>) that are not pre-generated are
//    redirected to the repo shell (/user/repo/) which loads the requested
//    branch client-side (Technical Appendix §6).
//  - Repos added after the last deploy get the "recently added" note
//    (Technical Appendix §5).
//
// `performRedirect` is injectable for tests (window.location is not
// configurable under jsdom).
export default function NotFound({ performRedirect }) {
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

  // Branch deep links are redirected to the statically generated repo shell;
  // ReportView picks the requested branch back up from the query parameter
  // (Technical Appendix §6). Branch names may contain slashes, so any
  // segments beyond user/repo belong to the branch name.
  const redirectTarget =
    segments.length >= 3 && isRepoLike
      ? `/${username}/${repository}/?branch=${encodeURIComponent(segments.slice(2).join('/'))}`
      : null;

  useEffect(() => {
    const redirect = performRedirect || (url => window.location.replace(url));
    if (redirectTarget) {
      redirect(`${basePath}${redirectTarget}`);
    }
  }, [redirectTarget, basePath, performRedirect]);

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
