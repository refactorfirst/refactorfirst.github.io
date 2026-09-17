'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSearch } from '../lib/search.js';
import { buildRepositoryListUrl } from '../lib/routes.js';

// Shared type-ahead combobox. Thin React wrapper around
// lib/search.js#createSearch: imperative navigation is replaced by the
// injected Next router push.
export default function SearchCombobox({ repositories, inputId, resultsId, debounceMs = 0 }) {
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const search = createSearch({
      input: inputRef.current,
      resultsList: resultsRef.current,
      repositories,
      debounceMs,
      onNavigate: repo => router.push(buildRepositoryListUrl(repo.fullName))
    });
    return () => search.close();
  }, [repositories, router, debounceMs]);

  return (
    <>
      <input
        type="search"
        id={inputId}
        ref={inputRef}
        placeholder="Search repositories..."
        aria-label="Search repositories"
        autoComplete="off"
        aria-expanded="false"
        aria-controls={resultsId}
        role="combobox"
      />
      <ul id={resultsId} ref={resultsRef} className="search-results" role="listbox" hidden></ul>
    </>
  );
}
