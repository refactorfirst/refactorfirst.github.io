export const metadata = { title: 'Privacy Policy - RefactorFirst' };

export default function PrivacyPolicyPage() {
  return (
    <section className="content-page">
      <h1>Privacy Policy</h1>

      <h2>Data Collected</h2>
      <p>RefactorFirst does not run analytics, tracking or logins. This site does not ask for
         or store your platform credentials or access tokens.</p>

      <h2>Submissions</h2>
      <p>When you add a repository, you create an issue on this site&apos;s platform
         (GitHub, GitLab or Bitbucket). Your platform username (the issue author)
         and the repository name are recorded in the public
         <code>repositories.txt</code> file, the public issue and CI logs for
         auditing. The validation job uses platform credentials to verify that
         you have write access to the submitted repository by checking membership
         and permission status via the platform API. This check is performed by the
         CI system and the results are retained in CI logs and issue comments.</p>

      <h2>Cookies</h2>
      <p>This site does not use cookies.</p>

      <h2>Your rights</h2>
      <p>To have a submission removed, open an issue in the RefactorFirst repository.</p>
    </section>
  );
}
