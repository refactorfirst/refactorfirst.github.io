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
    <Suspense fallback={<p className="loading" role="status">Loading report&hellip;</p>}>
      <ReportView username={username} repository={repository} />
    </Suspense>
  );
}
