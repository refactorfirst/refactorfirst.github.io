'use client';

import SearchCombobox from './search-combobox';

// Top-menu search (100ms debounce, as in the legacy header).
export default function MenuSearch({ repositories, debounceMs = 100 }) {
  return (
    <div className="menu-search" role="search">
      <SearchCombobox
        repositories={repositories}
        inputId="menu-search-input"
        resultsId="menu-search-results"
        debounceMs={debounceMs}
      />
    </div>
  );
}
