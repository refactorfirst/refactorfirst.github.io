// Mustache + DOMPurify rendering. The vendored copies (assets/vendor/) were
// superseded by npm dependencies in Phase 2 (plan Technical Appendix §2,
// Option A: bundle). Behavior is unchanged: repository report data and
// templates are untrusted, so Mustache escapes by default and DOMPurify
// sanitizes the final HTML.
import Mustache from 'mustache';
import DOMPurify from 'dompurify';
import {
  TABLE_CONFIG,
  REPORT_TABLES,
  disharmonyTableDescriptor,
  columnValue,
  paginateTableData,
  pageCount,
  sortTableData,
  filterTableData
} from './table-operations.js';

let mustacheInstance = null;

/**
 * Returns the shared Mustache renderer instance.
 *
 * @returns {typeof Mustache} The initialized Mustache module.
 */
export function initializeMustache() {
  if (!mustacheInstance) {
    mustacheInstance = Mustache;
  }
  return mustacheInstance;
}

let linkSafetyHookRegistered = false;

/**
 * Registers a DOMPurify hook that protects links opening a new browsing context.
 *
 * The hook adds `rel="noopener noreferrer"` to sanitized anchors whose target
 * is `_blank`. Registration occurs at most once and is skipped when DOMPurify
 * does not expose browser hooks.
 */
function registerLinkSafetyHook() {
  if (linkSafetyHookRegistered || typeof DOMPurify.addHook !== 'function') return;
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.getAttribute('target')?.trim().toLowerCase() === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  linkSafetyHookRegistered = true;
}

// ---------------------------------------------------------------------------
// Enhanced tables: filter -> sort -> paginate pipeline feeding the template
// (plan Phase 3). prepareReportData returns a shallow-copied report object
// whose table arrays contain only the current page, plus a tableUi metadata
// block per table (pagination state, sort state, live-region text) that the
// Mustache template renders into toolbar/pagination/sortable-header markup.
// ---------------------------------------------------------------------------

/**
 * Normalizes the stored UI state for a table.
 *
 * @param {object} statesById - Table states keyed by table id.
 * @param {string} tableId - Table whose state should be resolved.
 * @param {object} config - Table feature defaults.
 * @returns {{search: string, sortKey: *, sortDir: string, page: number}} Normalized state.
 */
function resolveTableState(statesById, tableId, config) {
  const state = statesById?.[tableId] ?? {};
  const search = (state.search ?? '').toString();
  const sortKey = state.sortKey ?? config.sorting.defaultSortColumn;
  const sortDir = state.sortDir === 'desc' || state.sortDir === 'asc'
    ? state.sortDir
    : config.sorting.defaultSortDirection;
  const page = Number.isFinite(Number(state.page)) ? Math.floor(Number(state.page)) : 1;
  return { search, sortKey, sortDir, page };
}

/**
 * Applies filtering, sorting, and pagination to one table descriptor.
 *
 * @param {object} descriptor - Table columns and metadata.
 * @param {Array} allRows - Complete table row set.
 * @param {object} rawState - Current unnormalized table state.
 * @param {object} config - Table feature configuration.
 * @returns {{rows: Array, ui: object}} Visible rows and template metadata.
 */
function buildTableSlice(descriptor, allRows, rawState, config) {
  const state = resolveTableState({ [descriptor.id]: rawState }, descriptor.id, config);
  const columns = descriptor.columns;
  const filterText = row => columns.map(col => String(columnValue(col, row))).join(' ');
  const filtered = config.search.enabled
    ? filterTableData(allRows, state.search, filterText)
    : allRows;

  const knownSort = state.sortKey && columns.some(col => col.key === state.sortKey)
    ? state.sortKey
    : null;
  const sorted = config.sorting.enabled
    ? sortTableData(
      filtered,
      knownSort,
      state.sortDir,
      (row, key) => columnValue(columns.find(col => col.key === key), row)
    )
    : filtered;

  const totalRows = allRows.length;
  const matchCount = filtered.length;
  const pageSize = config.pagination.pageSize;
  const paginated = matchCount > config.pagination.threshold;
  const totalPages = pageCount(matchCount, pageSize);
  const currentPage = Math.min(Math.max(state.page, 1), Math.max(totalPages, 1));
  const rows = paginated ? paginateTableData(sorted, pageSize, currentPage) : sorted;
  const searchActive = state.search.trim().length > 0;

  const ui = {
    tableId: descriptor.id,
    caption: descriptor.caption,
    enhanced: true,
    sortable: config.sorting.enabled,
    searchable: config.search.enabled,
    exportable: config.export.enabled,
    copyable: config.copy.enabled,
    paginated,
    currentPage,
    totalPages,
    pageSize,
    totalRows,
    matchCount,
    startRow: rows.length ? (paginated ? (currentPage - 1) * pageSize + 1 : 1) : 0,
    endRow: rows.length ? (paginated ? (currentPage - 1) * pageSize + rows.length : rows.length) : 0,
    isFirstPage: currentPage <= 1,
    isLastPage: currentPage >= Math.max(totalPages, 1),
    searchActive,
    searchTerm: state.search,
    sortKey: knownSort ?? '',
    sortDir: state.sortDir,
    colSort: columns.map(col =>
      col.key === knownSort ? (state.sortDir === 'desc' ? 'descending' : 'ascending') : 'none'),
    colIndicator: columns.map(col =>
      col.key === knownSort ? (state.sortDir === 'desc' ? '▼' : '▲') : ''),
    pageStatus: `Page ${currentPage} of ${Math.max(totalPages, 1)}`,
    matchStatus: searchActive ? `${matchCount} of ${totalRows} rows match` : ''
  };
  return { rows, ui };
}

/**
 * Prepares report data for the enhanced table rendering: applies the
 * per-table filter -> sort -> paginate pipeline and injects tableUi metadata
 * consumed by the Mustache template. The input data is never mutated.
 *
 * @param {object} data - Raw report JSON.
 * @param {object} [tableStates] - Per-table UI state keyed by table id
 *   ({page, sortKey, sortDir, search}).
 * @param {object} [config] - TABLE_CONFIG overrides (pagination, sorting,
 *   search, export, copy, stickyHeaders).
 * @returns {object} Prepared report data.
 */
export function prepareReportData(data, tableStates = {}, config = TABLE_CONFIG) {
  if (!data || typeof data !== 'object') return data;
  const result = { ...data };
  const stateOf = tableId => tableStates?.[tableId];

  if (Array.isArray(data.classRelationshipsToRemove?.relationships)) {
    const descriptor = REPORT_TABLES['class-relationships'];
    const { rows, ui } = buildTableSlice(
      descriptor, data.classRelationshipsToRemove.relationships, stateOf(descriptor.id), config);
    result.classRelationshipsToRemove = {
      ...data.classRelationshipsToRemove,
      relationships: rows,
      tableUi: ui
    };
  }

  if (Array.isArray(data.packageRelationshipsToRemove?.relationships)) {
    const descriptor = REPORT_TABLES['package-relationships'];
    const { rows, ui } = buildTableSlice(
      descriptor, data.packageRelationshipsToRemove.relationships, stateOf(descriptor.id), config);
    result.packageRelationshipsToRemove = {
      ...data.packageRelationshipsToRemove,
      relationships: rows,
      tableUi: ui
    };
  }

  if (Array.isArray(data.disharmonies)) {
    result.disharmonies = data.disharmonies.map((disharmony, index) => {
      const descriptor = disharmonyTableDescriptor(disharmony, index);
      const { rows, ui } = buildTableSlice(
        descriptor, disharmony?.table?.rows ?? [], stateOf(descriptor.id), config);
      const headerObjs = (disharmony?.table?.headers ?? []).map((label, columnIndex) => ({
        key: `col${columnIndex}`,
        label,
        sortState: ui.colSort[columnIndex] ?? 'none',
        indicator: ui.colIndicator[columnIndex] ?? '',
        tableId: ui.tableId
      }));
      return { ...disharmony, ui, table: { ...disharmony.table, headerObjs, rows } };
    });
  }

  if (Array.isArray(data.classCycles?.summary)) {
    const descriptor = REPORT_TABLES['class-cycles-summary'];
    const { rows, ui } = buildTableSlice(
      descriptor, data.classCycles.summary, stateOf(descriptor.id), config);
    const classCycles = { ...data.classCycles, summary: rows, summaryUi: ui };
    const largestCycle = data.classCycles.largestCycle;
    if (largestCycle && Array.isArray(largestCycle.breakdown)) {
      const breakdownDescriptor = REPORT_TABLES['largest-cycle-breakdown'];
      const breakdown = buildTableSlice(
        breakdownDescriptor, largestCycle.breakdown, stateOf(breakdownDescriptor.id), config);
      classCycles.largestCycle = {
        ...largestCycle,
        breakdown: breakdown.rows,
        breakdownUi: breakdown.ui
      };
    }
    result.classCycles = classCycles;
  }

  return result;
}

/**
 * Renders report data into a Mustache template and sanitizes the resulting HTML.
 *
 * Mustache escapes ordinary interpolations, while DOMPurify also sanitizes raw
 * interpolations and template markup according to the report allowlist.
 *
 * @param {string} template - Mustache template to render.
 * @param {object} data - Report data available to the template.
 * @returns {string} Sanitized rendered HTML.
 */
export function renderTemplate(template, data) {
  const mustache = initializeMustache();
  const rendered = mustache.render(template, data);
  registerLinkSafetyHook();
    // Allow-list is deliberately tight: the bundled template only needs text,
    // table, popup and chart markup; elements like iframe/object/embed/meta/
    // link/form/input/select/styleable-document tags would let report data
    // embed remote frames, redirects or credential-harvesting forms, so they
    // are removed no matter what the data contains. Obsolete HTML4
    // presentational attributes (align, border, ...) are likewise not in the
    // allow-list: rendering is styled through classes in the template CSS.
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [
        'a', 'abbr', 'acronym', 'address', 'article', 'aside',
        'b', 'bdi', 'bdo', 'big', 'blockquote', 'body', 'br', 'button', 'canvas',
        'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd',
        'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em',
        'fieldset', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3',
        'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'html', 'i',
        'img', 'ins', 'kbd', 'label', 'legend', 'li',
        'main', 'mark', 'meter', 'nav',
        'ol', 'output', 'p',
        'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
        'section', 'small', 'span', 'strong', 'style',
        'sub', 'summary', 'sup', 'table', 'tbody', 'td',
        'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'u', 'ul', 'var',
        'wbr', '#text'
      ],
      ADD_ATTR: ['target'],
      // HTML5-obsolete presentational attributes are stripped even though
      // DOMPurify's default allow-list would keep them.
      FORBID_ATTR: [
        'align', 'alink', 'background', 'bgcolor', 'border', 'char', 'charoff',
        'clear', 'compact', 'frame', 'frameborder', 'hspace', 'link',
        'marginheight', 'marginwidth', 'noshade', 'noresize', 'rules',
        'scrolling', 'text', 'valign', 'vlink', 'vspace'
      ],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'meta', 'link', 'form', 'input', 'select', 'textarea'],
      FORCE_BODY: true
    });
  }
