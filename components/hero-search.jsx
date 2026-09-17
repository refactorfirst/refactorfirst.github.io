'use client';

import SearchCombobox from './search-combobox';

// Hero search on the landing page (immediate results, as in the legacy page).
export default function HeroSearch({ repositories, debounceMs = 0 }) {
  return (
    <div className="hero-search">
      <label htmlFor="hero-search-input">Find a repository</label>
      <SearchCombobox
        repositories={repositories}
        inputId="hero-search-input"
        resultsId="hero-search-results"
        debounceMs={debounceMs}
      />
    </div>
  );
}
