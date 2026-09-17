export default function ApiPage() {
  return (
    <section className="content-page">
      <h1>API for Tool Integrations</h1>

      <h2>Fetching reports programmatically</h2>
      <p>Reports are plain JSON stored in each repository. Fetch them directly from
         GitHub raw content:</p>
      <pre><code>GET https://raw.githubusercontent.com/&lt;user&gt;/&lt;repo&gt;/refs/heads/&lt;branch&gt;/.refactorfirst/refactor-first.json</code></pre>

      <h2>URL patterns</h2>
      <ul>
        <li><code>/&lt;user&gt;/&lt;repo&gt;</code> &mdash; rendered report (default branch)</li>
        <li><code>/&lt;user&gt;/&lt;repo&gt;/&lt;branch&gt;</code> &mdash; rendered report for a branch</li>
        <li><code>/&lt;user&gt;</code> &mdash; all listed repositories of a user</li>
      </ul>

      <h2>JSON schema</h2>
      <p>The report contains <code>projectName</code>, <code>version</code>,
         <code>totalClasses</code>, <code>classesToRefactor</code> and a
         <code>priorities</code> array with per-class <code>rank</code>,
         <code>className</code>, <code>priority</code>, <code>effort</code>,
         <code>disharmonies</code> and <code>recommendation</code> fields.</p>

      <h2>Webhooks &amp; third-party tools</h2>
      <p>Trigger report regeneration from any CI system by calling
         <code>mvn refactorfirst:jsonReport</code> and committing the
         <code>.refactorfirst</code> directory.</p>

      <h2>Rate limiting &amp; caching</h2>
      <p>GitHub raw and API endpoints are rate-limited (5000 requests/hour authenticated,
         60/hour unauthenticated). Cache responses client-side and respect the
         <code>X-RateLimit-*</code> headers.</p>
    </section>
  );
}
