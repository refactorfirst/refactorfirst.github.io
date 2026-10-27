// /{username}/{repository} — report shell. Pre-generated per listed
// repository; ReportView fetches the report client-side.

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { loadListedRepositories } from '../../../lib/repositories';
import { reportStaticParams } from '../../../lib/static-params';
import { isValidGitHubName } from '../../../lib/routes';
import ReportView from '../../../components/report-view';

export const dynamicParams = false;

export function generateStaticParams() {
  return reportStaticParams(loadListedRepositories());
}

export async function generateMetadata({ params }) {
  const { username, repository } = await params;
  return { title: `${username}/${repository} - RefactorFirst` };
}

export default async function RepositoryPage({ params }) {
  const { username, repository } = await params;
  if (!isValidGitHubName(username) || !isValidGitHubName(repository)) {
    notFound();
  }
  return (
    <>
      {/* Warm the connections the client-side report fetch and the lazy CDN
          widgets will use: raw.githubusercontent.com serves the report JSON
          (a CORS fetch, so the preconnect is anonymous too) and cdnjs the
          2D-popup scripts (classic scripts, no CORS). Self-managed
          GitLab/Bitbucket deployments fetch from their own platform host
          instead, where these hints are simply unused. React hoists both
          links into <head>. */}
      <link rel="preconnect" href="https://raw.githubusercontent.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://cdnjs.cloudflare.com" />
      {/* The fallback mirrors the hydrated container (same id + reserved
          height, app/globals.css) so the footer starts below the fold before
          hydration too and the report's arrival causes no layout shift. */}
      <Suspense fallback={(
        <div id="report-container">
          <p className="loading" role="status">Loading report&hellip;</p>
        </div>
      )}>
        <ReportView username={username} repository={repository} />
      </Suspense>
    </>
  );
}
