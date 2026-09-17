// /{username}/{repository}/{branch} — report shell pinned to a branch.
// Pre-generated for main/master; other branches reach this route via the
// not-found client redirect which conveys the branch through the ?branch=
// query parameter handled by ReportView.

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { loadListedRepositories } from '../../../../lib/repositories';
import { branchStaticParams } from '../../../../lib/static-params';
import { isValidGitHubName } from '../../../../lib/routes';
import ReportView from '../../../../components/report-view';

export const dynamicParams = false;

export function generateStaticParams() {
  return branchStaticParams(loadListedRepositories());
}

export async function generateMetadata({ params }) {
  const { username, repository, branch } = await params;
  return { title: `${username}/${repository}@${branch} - RefactorFirst` };
}

export default async function BranchPage({ params }) {
  const { username, repository, branch } = await params;
  if (!isValidGitHubName(username) || !isValidGitHubName(repository)) {
    notFound();
  }
  return (
    <Suspense fallback={<p className="loading" role="status">Loading report&hellip;</p>}>
      <ReportView username={username} repository={repository} branch={branch} />
    </Suspense>
  );
}
