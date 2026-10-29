import Link from 'next/link';
import HeroSearch from './hero-search';
import ReportWarmup from './report-warmup';
import { buildRepositoryListUrl } from '../lib/routes.js';

export const FEATURED_COUNT = 6;

// Landing page content (hero, search, CTA, featured repos). Receives the
// parsed repositories.txt listing from the RSC page.
export default function Landing({ repositories }) {
  const featured = repositories.slice(0, FEATURED_COUNT);
  return (
    <>
      <section className="hero">
        <h1>RefactorFirst</h1>
        <p>Know which parts of your codebase to refactor first. Search for a repository to see its report.</p>
      </section>
      <HeroSearch repositories={repositories} />
      <section className="section-center">
        <Link href="/add-repo" className="cta">Add My Repo</Link>
      </section>
      <section className="section-center">
        <h2>Featured Repositories</h2>
        <div className="featured-repos">
          <ul>
            {featured.map(repo => (
              <li key={repo.fullName}>
                <Link href={buildRepositoryListUrl(repo.fullName)}>{repo.fullName}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      {/* Directory page: warm the shared report rendering libraries during
          idle time (vizdom wasm, Chart.js, svg-pan-zoom, the template —
          never report data) so the first report a visitor opens renders
          from local caches. Renders nothing; never delays this page. */}
      <ReportWarmup />
    </>
  );
}
