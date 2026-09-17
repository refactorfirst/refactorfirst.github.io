'use client';

// User repository listing at /{username}: paginated card grid. The listing
// is baked into the static build, but a repository submitted after the last
// deploy would 404 — so the component refreshes repositories.txt client-side
// once and adopts the newer listing when it has grown (Technical Appendix §5).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { withBasePath } from '../lib/base-path';
import { parseRepositories } from '../lib/search';
import { paginate, reposForUser, sortByRepository } from '../lib/utils';

export default function RepoList({ username, initialRepositories = [] }) {
  const searchParams = useSearchParams();
  const [repositories, setRepositories] = useState(() =>
    reposForUser(initialRepositories, username)
  );

  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath('/repositories.txt'))
      .then(response => (response.ok ? response.text() : null))
      .then(text => {
        if (cancelled || !text) return;
        const fresh = reposForUser(parseRepositories(text), username);
        setRepositories(current => (fresh.length > current.length ? fresh : current));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [username]);

  const pageParam = Number(searchParams.get('page')) || 1;
  const sorted = sortByRepository(repositories);
  const { items, page, totalPages } = paginate(sorted, pageParam);

  return (
    <section className="repo-listing">
      <h1>{username}</h1>
      <p className="listing-subtitle">RefactorFirst reports published for this user</p>
      <div className="repo-grid">
        {items.map(repo => (
          <Link
            key={repo.repository}
            className="repo-card"
            href={`/${username}/${repo.repository}`}
          >
            <span className="repo-name">{repo.repository}</span>
          </Link>
        ))}
      </div>
      {totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p =>
            p === page ? (
              <span key={p} className="page current" aria-current="page">{p}</span>
            ) : (
              <Link key={p} className="page" href={`/${username}?page=${p}`}>{p}</Link>
            )
          )}
        </nav>
      )}
    </section>
  );
}
