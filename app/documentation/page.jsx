import Link from 'next/link';

export const metadata = { title: 'Documentation - RefactorFirst' };

export default function DocumentationPage() {
  return (
    <section className="content-page">
      <h1>Documentation</h1>

      <h2>Generating Reports</h2>
      <p>Run the Maven plugin:</p>
      <pre><code>mvn refactorfirst:jsonReport</code></pre>
      <p>This writes <code>.refactorfirst/refactor-first.json</code>. A graphical HTML report
         is also generated into the <code>targets/site</code> directory by
         <code>mvn refactorfirst:report</code>.</p>

      <h2>Understanding the Report</h2>
      <ul>
        <li><strong>Priority</strong> &mdash; XRank-based ordering: refactor these classes first.</li>
        <li><strong>Effort</strong> &mdash; estimated relative effort to refactor the class.</li>
        <li><strong>Disharmonies</strong> &mdash; detected design flaws (God Class, Brain Method, Feature Envy, ...).</li>
        <li><strong>Recommendation</strong> &mdash; suggested next step for each class.</li>
      </ul>

      <h2>CI/CD Integration</h2>
      <p>Add the RefactorFirst workflow to your repository so the report regenerates on every
         push to the default branch. See <Link href="/getting-started">Getting Started</Link>
         for a copy-paste workflow.</p>

      <h2>Full Documentation</h2>
      <p>Complete plugin documentation is available in the
         <a href="https://github.com/refactorfirst/refactorfirst" target="_blank" rel="noopener noreferrer">RefactorFirst repository</a>.</p>
    </section>
  );
}
