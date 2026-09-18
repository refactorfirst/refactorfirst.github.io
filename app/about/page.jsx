export const metadata = { title: 'About - RefactorFirst' };

export default function AboutPage() {
  return (
    <section className="content-page">
      <h1>About RefactorFirst</h1>
      <p>RefactorFirst is a static analysis tool that identifies which classes in your Java
         codebase you should refactor first, ranked by cost-benefit. It is based on the paper
         <em>Prioritized Technical Debt Identification</em> and uses the XRank metric to surface
         the classes with the highest impact on maintainability.</p>
      <h2>How it works</h2>
      <p>Run the RefactorFirst Maven plugin on your project. It generates
         <code>.refactorfirst/refactor-first.json</code> &mdash; a ranked list of classes to
         refactor with effort estimates and recommendations. This site renders those reports
         directly from your GitHub repository.</p>
      <h2>Open Source</h2>
      <p>RefactorFirst is open source. Visit the
         <a href="https://github.com/refactorfirst/refactorfirst" target="_blank" rel="noopener noreferrer">GitHub repository</a>
         to contribute, report issues or learn more.</p>
    </section>
  );
}
