import Link from 'next/link';
import HeroSearch from './hero-search';
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
      <section>
        <Link href="/add-repo" className="cta">Add My Repo</Link>
      </section>
      <section>
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
    </>
  );
}
