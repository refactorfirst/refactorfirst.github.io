// /add-repo — repository submission form. Config comes from the same <meta>
// tags (submission-target, platform-base-url) so self-managed GitLab
// deployments keep working by editing the layout.

import RepoSubmissionForm from '../../components/repo-submission-form';

export const metadata = { title: 'Add Your Repository - RefactorFirst' };

export default function AddRepoPage() {
  return <RepoSubmissionForm />;
}
