import Link from 'next/link';

export default function ExamplesPage() {
  return (
    <section className="content-page">
      <h1>Example Reports</h1>
      <p>See RefactorFirst reports for real projects. Each link opens the live report
         rendered from that repository.</p>

      <h2>Featured projects</h2>
      <ul className="examples-gallery">
        <li>
          <Link href="/refactorfirst/refactorfirst">refactorfirst/refactorfirst</Link>
          <p>The RefactorFirst project itself &mdash; a medium-sized Maven codebase.</p>
        </li>
      </ul>

      <h2>What to look for</h2>
      <ul>
        <li>Small codebases: short priority lists, quick wins.</li>
        <li>Medium codebases: a handful of high-priority God Classes.</li>
        <li>Large codebases: long tails &mdash; focus on the top of the ranking.</li>
      </ul>

      <h2>Before / after refactoring</h2>
      <p>Compare a report on a release branch (<code>/&lt;user&gt;/&lt;repo&gt;/&lt;branch&gt;</code>)
         before and after addressing the top-ranked class to see the impact of your work.</p>

      <p>Add your project via <Link href="/add-repo">Add Your Repo</Link> to appear in this gallery.</p>
    </section>
  );
}
