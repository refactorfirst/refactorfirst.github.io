# Plan: Enhanced Tables with Pagination, Sorting, Export, Search, and Copy

## Goal

Implement simple, fast, WCAG 2.2 AA compliant enhanced tables for the RefactorFirst report with:
- Sticky (pinned) headings
- Paginated tables for large datasets
- Sortable columns across entire dataset
- CSV export functionality
- Search/filter within tables
- Copy cell content capability

While maintaining the existing template structure and security model.

## Rationale

- **Current limitation**: Large tables (class relationships, package relationships, disharmonies) can become unwieldy with many rows
- **User experience**: Users need to scroll through entire tables while losing context of column headers
- **Data exploration**: Users need to sort by priority, effort, or other metrics to find the most important refactorings
- **Data analysis**: Users often want to export table data for further analysis in spreadsheets
- **Finding specific items**: Users need to search for specific class names, package names, or priority levels within large tables
- **Content sharing**: Users frequently want to copy class names, package names, or other identifiers for referencing
- **Performance**: Static HTML tables are fine but become slow with hundreds of rows
- **Accessibility**: Need to maintain WCAG 2.2 AA compliance while improving usability
- **Simplicity**: Avoid heavy dependencies like Tabulator; use lightweight CSS + minimal JavaScript

## Technical Approach

**CSS Sticky Headers:**
- Use `position: sticky` on table headers (`th` elements)
- Set `top: 0` to pin headers when scrolling
- Ensure `z-index` places headers above table content
- Maintain existing table structure and styling

**Client-Side Pagination:**
- Simple array slicing for table data before Mustache rendering
- Configurable page size (default: 20 rows per page)
- Previous/Next navigation + page indicator (Page X of Y)
- Sort order preserved across pagination

**Sortable Columns:**
- Click on column headers to sort by that column (ascending/descending toggle)
- Sort applies to the entire dataset, then pagination shows the sorted results
- Visual indicators for sort direction (up/down arrows or ARIA attributes)
- Sort state maintained across page navigation
- Default sort order preserved from original data when no sort is applied

**CSV Export:**
- Export button above each table to download entire table data as CSV
- Export includes current sort order but ignores pagination (exports full dataset)
- Proper CSV escaping for special characters and multiline content
- Filename reflects table type and timestamp
- No external libraries needed; use native JavaScript Blob API

**Search/Filter:**
- Search input above each table for real-time filtering
- Filter applies to entire dataset, then pagination shows filtered results
- Case-insensitive search across all columns
- Visual feedback when search is active (match count, clear button)
- Search state maintained across page navigation
- Keyboard-accessible search input with proper ARIA attributes

**Copy Cell Content:**
- Click on any table cell to copy its content to clipboard
- Visual feedback (toast notification) when copy succeeds
- Works with keyboard (Enter/Space on focused cells)
- Handles special characters and formatting correctly
- Falls back gracefully if clipboard API not available

**Accessibility:**
- Maintain semantic HTML table structure
- Use ARIA attributes for pagination controls, sortable column headers, search inputs, and export buttons
- Ensure keyboard navigation works properly (Tab through headers, Enter/Space to sort, copy cells)
- Keep table captions and scope attributes
- Test against existing WCAG guards
- Sortable headers have `aria-sort` attribute (ascending/descending/none)
- Visual sort indicators for screen reader users
- Search inputs have proper labels and ARIA live regions for match counts
- Export buttons have descriptive ARIA labels
- Copyable cells have proper focus states and ARIA descriptions
- Toast notifications are announced to screen readers

## Proposed File Changes

### New

| File | Purpose |
|---|---|
| `lib/table-operations.js` | Combined utility: `paginateTableData(data, pageSize, currentPage)`, `sortTableData(data, sortColumn, sortDirection)`, `filterTableData(data, searchTerm)`, `exportTableToCsv(data, headers, filename)`, and `copyCellContent(content)` functions |
| `components/toast-notification.jsx` | Simple toast notification component for copy feedback (accessible, auto-dismissing) |

### Modified

| File | Change |
|---||
| `assets/refactor-first-report.mustache` | Add CSS for sticky headers, add pagination control markup, add clickable column headers with sort indicators, add a search-control slot and export button above each table, add copy functionality to table cells, add ARIA attributes for all new interactive elements |
| `lib/renderer.js` | Add pagination, sorting, and filtering logic before Mustache rendering for large tables, inject pagination, sort, and filter state into template data |
| `components/report-view.jsx` | Wire up pagination, sort, search, export, and copy controls to state management for client-side navigation |
| `tests/unit/table-operations.test.js` | Unit tests for pagination, sorting, filtering, CSV export, and copy functionality (edge cases, data integrity, CSV escaping, clipboard fallback) |
| `tests/unit/report-template-wcag.test.js` | Update to verify sticky header CSS, pagination controls, sortable headers, search inputs, export buttons, and copyable cells meet WCAG 2.2 AA |
| `tests/integration/report-view.test.jsx` | Integration tests for pagination, sort, search, export, and copy controls (navigation, state persistence, CSV download, clipboard interaction) |
| `tests/integration/toast-notification.test.jsx` | Integration tests for toast notification component (accessibility, auto-dismiss, screen reader announcements) |

## TDD Implementation Phases

> CRITICAL: Red-Green-Refactor. Every client-side behavior starts as a
> **failing test** (`bun test tests/unit tests/integration` must fail before
> implementation).

### Phase 1 — Table operations utility (unit tests)
Failing tests first (`tests/unit/table-operations.test.js`):

**Pagination tests:**
- [ ] `paginateTableData([], 10, 1)` → empty array
- [ ] `paginateTableData([1..5], 10, 1)` → all 5 items
- [ ] `paginateTableData([1..25], 10, 1)` → first 10 items
- [ ] `paginateTableData([1..25], 10, 2)` → items 11-20
- [ ] `paginateTableData([1..25], 10, 3)` → items 21-25
- [ ] `paginateTableData([1..25], 10, 4)` → empty array (page out of bounds)
- [ ] `paginateTableData([1..25], 10, 0)` → defaults to page 1
- [ ] `paginateTableData([1..25], 10, -1)` → defaults to page 1
- [ ] `paginateTableData([1..25], 10, 'invalid')` → defaults to page 1

**Sorting tests:**
- [ ] `sortTableData([{a:2}, {a:1}], 'a', 'asc')` → sorted ascending
- [ ] `sortTableData([{a:1}, {a:2}], 'a', 'desc')` → sorted descending
- [ ] `sortTableData([{a:1}, {a:1}], 'a', 'asc')` → stable sort (original order preserved)
- [ ] `sortTableData([{a:2}, {b:1}], 'a', 'asc')` → handles missing keys (places at end)
- [ ] `sortTableData([{a:'10'}, {a:'2'}], 'a', 'asc')` → numeric string handling
- [ ] `sortTableData(data, null, 'asc')` → returns original data (no sort applied)
- [ ] `sortTableData(data, 'column', null)` → defaults to ascending

**Filtering tests:**
- [ ] `filterTableData([{a:'test'}, {a:'foo'}], 'test')` → returns matching items
- [ ] `filterTableData([{a:'Test'}, {a:'foo'}], 'test')` → case-insensitive match
- [ ] `filterTableData([{a:'test'}, {b:'test'}], 'test')` → searches across all properties
- [ ] `filterTableData(data, '')` → returns all data (empty search)
- [ ] `filterTableData(data, null)` → returns all data (no search)

**CSV export tests:**
- [ ] `exportTableToCsv([{a:1}, {a:2}], ['a'], 'test.csv')` → generates valid CSV
- [ ] CSV properly escapes commas in data: `[{a:'hello, world'}]`
- [ ] CSV properly escapes quotes in data: `[{a:'hello "world"'}]`
- [ ] CSV handles newlines in data: `[{a:'line1\nline2'}]`
- [ ] CSV handles special characters and unicode correctly
- [ ] Export creates downloadable Blob with correct MIME type
- [ ] Filename reflects table type and timestamp

**Copy cell content tests:**
- [ ] `copyCellContent('test text')` → copies to clipboard successfully
- [ ] `copyCellContent('')` → handles empty strings
- [ ] `copyCellContent(null)` → handles null values
- [ ] `copyCellContent('special "chars"')` → handles special characters
- [ ] Function returns success/failure status
- [ ] Handles clipboard API unavailability gracefully

### Phase 2 — Sticky header CSS
Failing tests first (`tests/unit/report-template-wcag.test.js`):
- [ ] Verify `th` elements have `position: sticky` and `top: 0` CSS
- [ ] Verify sticky headers don't break existing table styling
- [ ] Verify z-index doesn't interfere with other elements
- [ ] Test that headers remain visible during scroll (visual regression)

### Phase 3 — Renderer integration
Failing tests first (`tests/unit/renderer.test.js`):
- [ ] Large table data gets paginated before Mustache rendering
- [ ] Pagination metadata (totalPages, currentPage, pageSize) injected into template data
- [ ] Small tables (below threshold) are not paginated
- [ ] Pagination threshold is configurable (default: 20 rows)
- [ ] Sort metadata (sortColumn, sortDirection) injected into template data
- [ ] Sorting is applied before pagination (sort entire dataset, then paginate)
- [ ] Filter metadata (searchTerm, matchCount) injected into template data
- [ ] Filtering is applied before sorting and pagination (filter → sort → paginate)

### Phase 4 — Template updates
Failing tests first (`tests/unit/report-template-wcag.test.js`):
- [ ] Pagination controls are properly labeled with ARIA attributes
- [ ] Previous/Next buttons have appropriate disabled states
- [ ] Page indicator is readable and semantic
- [ ] Pagination controls maintain keyboard navigability
- [ ] Table structure remains semantically correct
- [ ] Column headers are clickable and have proper ARIA attributes
- [ ] Sort indicators (up/down arrows) are visible and accessible
- [ ] `aria-sort` attribute correctly reflects current sort state (ascending/descending/none)
- [ ] Column headers maintain keyboard navigability (Tab, Enter, Space)
- [ ] Search inputs have proper labels and ARIA attributes
- [ ] Search match count is announced via ARIA live region
- [ ] Export buttons have descriptive ARIA labels
- [ ] Table cells are focusable and have proper ARIA descriptions for copy functionality
- [ ] Toast notification container has proper ARIA live region for announcements

### Phase 5 — Client-side navigation
Failing tests first (`tests/integration/report-view.test.jsx`):

**Pagination tests:**
- [ ] Clicking "Next" advances to next page
- [ ] Clicking "Previous" goes to previous page
- [ ] Disabled buttons cannot be clicked
- [ ] Page indicator updates correctly
- [ ] Table data updates on page change
- [ ] URL updates with page parameter (optional for deep linking)

**Sorting tests:**
- [ ] Clicking column header sorts by that column ascending
- [ ] Clicking same column header again toggles to descending
- [ ] Clicking different column header sorts by new column ascending
- [ ] Sort indicator (arrow) updates to reflect current sort direction
- [ ] `aria-sort` attribute updates correctly on header elements
- [ ] Sort is applied to entire dataset, then pagination shows sorted results
- [ ] Sort state is preserved when navigating between pages
- [ ] Sort state is preserved when changing page size (if implemented)
- [ ] Keyboard activation (Enter/Space) on column header triggers sort

**Search/filter tests:**
- [ ] Typing in search input filters table in real-time
- [ ] Search is case-insensitive
- [ ] Search across all columns works correctly
- [ ] Clearing search input restores full dataset
- [ ] Match count updates correctly
- [ ] Filter state is preserved when navigating between pages
- [ ] Filter state is preserved when sorting
- [ ] Keyboard navigation in search input works properly
- [ ] Empty search shows all data

**Export tests:**
- [ ] Clicking export button downloads CSV file
- [ ] CSV contains all table data (not just current page)
- [ ] CSV includes current sort order
- [ ] CSV filename reflects table type and timestamp
- [ ] Export button has proper ARIA label
- [ ] Export works with keyboard (Enter/Space)
- [ ] Export handles special characters correctly

**Copy cell tests:**
- [ ] Clicking table cell copies content to clipboard
- [ ] Toast notification appears after successful copy
- [ ] Toast notification auto-dismisses after timeout
- [ ] Copy works with keyboard (Enter/Space on focused cell)
- [ ] Copy handles empty cells correctly
- [ ] Copy handles special characters correctly
- [ ] Fallback behavior when clipboard API unavailable

### Phase 6 — E2E testing
Failing tests first (`tests/e2e/report-pagination.spec.js`):

**Pagination E2E:**
- [ ] Large report loads with pagination enabled
- [ ] Sticky headers visible when scrolling table
- [ ] Pagination controls work across all pages
- [ ] Keyboard navigation through pagination
- [ ] Mobile responsiveness of pagination controls

**Sorting E2E:**
- [ ] Column headers are clickable and trigger sorting
- [ ] Sort indicators appear and update correctly
- [ ] Sorting works across different data types (numbers, strings, priorities)
- [ ] Sort + pagination combination works correctly
- [ ] Keyboard sorting (Enter/Space on headers) works
- [ ] Sort state persists across page navigation

**Search/filter E2E:**
- [ ] Search input appears above each table
- [ ] Typing in search input filters table in real-time
- [ ] Search is case-insensitive
- [ ] Search works across all columns
- [ ] Clear button removes search filter
- [ ] Match count displays correctly
- [ ] Search + pagination combination works correctly
- [ ] Search + sorting combination works correctly
- [ ] Keyboard navigation in search input works

**Export E2E:**
- [ ] Export button appears above each table
- [ ] Clicking export button downloads CSV file
- [ ] CSV file contains correct data
- [ ] CSV filename reflects table type
- [ ] Export works with keyboard navigation

**Copy cell E2E:**
- [ ] Clicking table cell copies content to clipboard
- [ ] Toast notification appears and disappears
- [ ] Copied content is correct
- [ ] Copy works with keyboard navigation
- [ ] Copy works for different cell types (text, numbers, etc.)

## Documentation Changes

### `AGENTS.md`
- [ ] Add `lib/table-operations.js` and `components/toast-notification.jsx` to module table
- [ ] Document pagination, sort, search, export, and copy configuration
- [ ] Note sticky header CSS, sortable columns, search/filter, export, and copy approach
- [ ] Update testing requirements to include all new table features

### `README.md`
- [ ] Add section on enhanced table features (pagination, sticky headers, sorting, search, export, copy)
- [ ] Document pagination threshold and how to configure
- [ ] Document sorting behavior and keyboard shortcuts
- [ ] Document search/filter functionality
- [ ] Document CSV export feature
- [ ] Document copy cell content feature
- [ ] Note accessibility improvements

## Acceptance Criteria

- [ ] `bun test tests/unit tests/integration` green (all new/updated suites)
- [ ] `npx eslint lib/**/*.js components/**/*.jsx tests/**/*.js tests/**/*.jsx` clean
- [ ] Playwright E2E green for pagination, sorting, search, export, and copy scenarios
- [ ] WCAG 2.2 AA guards pass for updated template (including all new interactive elements)
- [ ] Sticky headers work in Chrome, Firefox, Safari, Edge
- [ ] Pagination works for all table types (class relationships, package relationships, disharmonies, cycles)
- [ ] Small tables (below threshold) render without pagination controls
- [ ] Sorting works for all sortable columns (priority, effort, cycle count, etc.)
- [ ] Sort indicators are visible and accessible
- [ ] `aria-sort` attributes correctly reflect sort state
- [ ] Search/filter works across all table types and columns
- [ ] Search is case-insensitive and provides match feedback
- [ ] CSV export downloads correct data with proper escaping
- [ ] Copy cell content works with visual feedback
- [ ] Toast notifications are accessible and auto-dismiss
- [ ] Keyboard navigation works for all new features (pagination, sorting, search, export, copy)
- [ ] Performance: all features don't slow down initial render significantly

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CSS `position: sticky` browser compatibility | Feature is well-supported in modern browsers; fallback to non-sticky headers gracefully |
| State management complexity (pagination + sort + search) | Keep state simple (currentPage, sortColumn, sortDirection, searchTerm); use URL params for deep linking if needed |
| Breaking existing table styling | Test thoroughly against existing styles; use specific CSS selectors for new elements |
| Accessibility regression | Run full WCAG test suite; add specific ARIA tests for all new controls |
| Performance overhead from all features | Simple array operations; minimal overhead; only applied to large tables |
| Template divergence from upstream RefactorFirst | Keep all features as optional enhancements; can be disabled if needed |
| Sort stability issues | Use stable sort algorithm; preserve original order for equal values |
| Complex data type handling in sorting | Implement smart type detection (numbers vs strings); handle missing/undefined values |
| Sort/filter state confusion across multiple tables | Maintain independent state per table; clear visual indicators |
| CSV export file size issues | Large tables could generate huge CSV files; consider max size warning or chunking |
| Clipboard API unavailability | Implement fallback behavior for copy functionality |
| Search performance on large datasets | Debounce search input; only filter on reasonable datasets |
| Toast notification spam | Rate limit toast notifications; prevent overlapping toasts |
| Feature overload overwhelming users | Make features discoverable but not intrusive; provide clear visual hierarchy |

## Out of Scope

- Server-side pagination (data is client-side rendered)
- Advanced table features (column freezing, inline editing, row selection)
- Persistent pagination/sort/search state across sessions
- Multi-table synchronization (independent pagination/sort/search per table is in scope)
- Mobile-specific pagination patterns (beyond responsive CSS)
- Complex multi-column sorting (single column sorting only)
- Advanced search (regex, boolean operators, column-specific search)
- Export formats other than CSV (Excel, JSON, etc.)

## Data Structure Considerations

**Existing table data structure:**
The current mustache template uses nested arrays for table data:
- `classRelationshipsToRemove.relationships` - array of relationship objects
- `packageRelationshipsToRemove.relationships` - array of relationship objects
- `disharmonies[].table.rows` - array of row objects with `cells` arrays
- `classCycles.summary` - array of cycle summary objects

**Sorting approach:**
- For simple object arrays (relationships, cycles): sort by object properties directly
- For complex nested structures (disharmonies with cells): extract sortable values from cells
- Map column headers to data property names for each table type
- Preserve original data structure; only change order, not schema

**Column mapping:**
```javascript
const COLUMN_MAPPINGS = {
  classRelationships: {
    'Class Relationship': 'renderedLabel',
    'Priority': 'priority',
    'In Class Cycles': 'cycleCount',
    'Relationship Strength': 'effortRank',
    // etc.
  },
  packageRelationships: {
    // similar mapping
  },
  disharmonies: {
    // map table headers to cell indices or properties
  }
};
```

## UI Layout Considerations

**Table toolbar area:**
Each table will have a toolbar area above it containing:
- Left side: Search input with clear button
- Right side: Export button
- Below toolbar: Pagination controls (centered)

**Toolbar design principles:**
- Compact and unobtrusive
- Clear visual hierarchy (search primary, export secondary)
- Responsive design (stack vertically on mobile)
- Consistent spacing and alignment
- Icons with labels for accessibility

**Pagination placement:**
- Below table content
- Centered alignment
- Clear "Previous" and "Next" buttons
- Page indicator ("Page X of Y")
- Disabled states for first/last page

**Column header design:**
- Maintain existing header styling
- Add subtle clickable affordance (cursor pointer, hover effect)
- Sort indicators (▲/▼) positioned unobtrusively
- Click area covers entire header cell
- Keyboard focus ring for accessibility

**Cell copy affordance:**
- Subtle visual hint (optional icon or tooltip on hover)
- Click anywhere in cell to copy
- Toast notification appears near the clicked cell
- No permanent UI clutter

**Responsive considerations:**
- Toolbar stacks vertically on small screens
- Search input takes full width on mobile
- Export button moves below search on mobile
- Pagination controls remain accessible on touch devices

## Configuration

Add configuration option (default values):
```javascript
const TABLE_CONFIG = {
  pagination: {
    threshold: 20,           // Minimum rows to enable pagination
    pageSize: 20,            // Rows per page
  },
  sorting: {
    enabled: true,          // Enable column sorting
    defaultSortColumn: null, // Default column to sort by (null = original order)
    defaultSortDirection: 'asc', // Default sort direction
  },
  search: {
    enabled: true,          // Enable search/filter functionality
    debounceMs: 300,        // Debounce delay for search input (ms)
  },
  export: {
    enabled: true,          // Enable CSV export functionality
    maxFileSizeWarning: 10485760, // Warn if CSV > 10MB
  },
  copy: {
    enabled: true,          // Enable copy cell content functionality
    toastDuration: 3000,    // Toast notification duration (ms)
  },
  stickyHeaders: true       // Enable sticky header CSS
};
```

These can be overridden via environment variables or meta tags if needed for specific deployments.
