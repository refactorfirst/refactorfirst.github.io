// /{username} — repository listing page for a GitHub user/org. Statically
// generated per username; pagination and the post-deploy listing refresh
// happen client-side in RepoList.

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { loadListedRepositories } from '../../lib/repositories';
import { userStaticParams } from '../../lib/static-params';
import { reposForUser } from '../../lib/utils';
import { isValidGitHubName } from '../../lib/routes';
import RepoList from '../../components/repo-list';
import ReportWarmup from '../../components/report-warmup';

export const dynamicParams = false;

export function generateStaticParams() {
  return userStaticParams(loadListedRepositories());
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `${username} - RefactorFirst` };
}

export default async function UserPage({ params }) {
  const { username } = await params;
  if (!isValidGitHubName(username)) {
    notFound();
  }
  const repositories = reposForUser(loadListedRepositories(), username);
  return (
    <Suspense fallback={<p className="loading" role="status">Loading&hellip;</p>}>
      <RepoList username={username} initialRepositories={repositories} />
      {/* Directory page: warm the shared report rendering libraries during
          idle time (vizdom wasm, Chart.js, svg-pan-zoom, the template —
          never report data) so the first report a visitor opens renders
          from local caches. */}
      <ReportWarmup />
    </Suspense>
  );
}
