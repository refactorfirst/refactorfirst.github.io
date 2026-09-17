import Link from 'next/link';

export default function FaqPage() {
  return (
    <section className="content-page">
      <h1>Frequently Asked Questions</h1>

      <h2>What do the different priority colors mean?</h2>
      <p>Priority is ranked by XRank: higher priority classes give the most benefit per unit
         of refactoring effort. Colors range from red (highest priority) to green.</p>

      <h2>How often should I run RefactorFirst?</h2>
      <p>On every merge to your default branch. The provided GitHub Actions workflow does
         this automatically.</p>

      <h2>What if my repository doesn&apos;t have a report?</h2>
      <p>Generate one with <code>mvn refactorfirst:jsonReport</code> and commit the
         <code>.refactorfirst/refactor-first.json</code> file. See
         <Link href="/getting-started">Getting Started</Link>.</p>

      <h2>How do I add my repository to the listing?</h2>
      <p>Use the <Link href="/add-repo">Add Your Repo</Link> page. It opens a
         pre-filled issue on this site&apos;s platform (GitHub, GitLab or Bitbucket);
         submitting that issue is all you need to do. You must have write access
         to the repository.</p>

      <h2>How long until my repository appears after submission?</h2>
      <p>The CI validation picks issues up shortly after they are created (the
         GitHub deployment reacts immediately; GitLab and Bitbucket deployments
         poll on a schedule), and the site redeploys on a 10-minute schedule —
         so in the worst case about 20 minutes.</p>

      <h2>Why is there no sign-in on this site?</h2>
      <p>Your identity is captured by your platform when you create the submission
         issue: the issue author is a verified account, and the CI job
         independently confirms that account has write access to the submitted
         repository. That proves ownership without any tokens or apps.</p>

      <h2>Is my platform data safe?</h2>
      <p>Yes. This site never receives credentials, tokens or permissions from you.
         The validation runs entirely in this project&apos;s own CI.</p>

      <h2>What are disharmonies like God Class and Brain Method?</h2>
      <p>Disharmonies are design flaws detected from metrics: a <em>God Class</em> does too
         much, a <em>Brain Method</em> is an overly complex method, <em>Feature Envy</em>
         means a method relies on another class&apos;s data more than its own.</p>

      <h2>Can I compare branches?</h2>
      <p>You can view the report on any branch via the URL
         <code>/&lt;user&gt;/&lt;repo&gt;/&lt;branch&gt;</code>, but side-by-side comparison is
         not currently supported.</p>
    </section>
  );
}
