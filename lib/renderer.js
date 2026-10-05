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
  resolveSortKey,
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

/**
 * Sanitizes a relationship label down to links and removal markers.
 * The report-wide sanitizer permits template styles, so labels need their own
 * allow-list before interpolation. Never trust a precomputed value from JSON.
 *
 * @param {string} label - Raw label markup from the report JSON.
 * @returns {string} Label restricted to anchor and marker markup.
 */
function sanitizeRelationshipLabel(label) {
  return DOMPurify.sanitize(label ?? '', {
    ALLOWED_TAGS: ['a', 'strong'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  });
}

/**
 * Escapes a value for safe interpolation into HTML text or a double-quoted
 * attribute. Relationship fields (repoUrl, class paths, simple names) are
 * untrusted report data, so they are escaped before the markup is built.
 *
 * @param {*} value - Raw value from the report JSON.
 * @returns {string} HTML-escaped text.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RELATIONSHIP_ARROW = ' &#8594; ';

/**
 * Builds the two-anchor markup shared by class and package relationships:
 * linked source name (plus removal marker), the &#8594; arrow, then the linked
 * target name (plus removal marker). All values are untrusted report data and
 * are escaped before the markup is assembled.
 *
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @param {{path: *, name: *, marked: *}} source - Source path, name and marker.
 * @param {{path: *, name: *, marked: *}} target - Target path, name and marker.
 * @returns {string} The unsanitized relationship markup.
 */
function relationshipAnchorsMarkup(repoUrl, source, target) {
  const base = typeof repoUrl === 'string' ? repoUrl : '';
  const anchor = (relationshipPath, name) =>
    '<a href="' + escapeHtml(base + String(relationshipPath ?? '')) + '" target="_blank">'
      + escapeHtml(name) + '</a>';
  return anchor(source.path, source.name)
    + (source.marked ? '*' : '')
    + RELATIONSHIP_ARROW
    + anchor(target.path, target.name)
    + (target.marked ? '*' : '');
}

/**
 * Builds the raw markup of one class relationship from the structured
 * ClassRelationshipDTO fields: the hyperlink targets are project.repoUrl plus
 * sourceClassPath/targetClassPath (paths relative to the project root), the
 * anchor texts are the simple class names, and the two anchors are separated
 * by the &#8594; arrow. A class marked for removal is followed by *.
 *
 * Entries without the structured fields (pre-DTO strings, legacy entries
 * carrying only a renderedLabel) yield null so callers can drop them.
 *
 * @param {*} relationship - Raw ClassRelationshipDTO entry.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {string|null} The unsanitized relationship markup, or null when the
 *   entry is not a structured ClassRelationshipDTO.
 */
export function classRelationshipMarkup(relationship, repoUrl) {
  if (!relationship || typeof relationship !== 'object') return null;
  const hasStructuredFields = relationship.simpleSourceClassName != null
    || relationship.simpleTargetClassName != null;
  if (!hasStructuredFields) return null;
  return relationshipAnchorsMarkup(
      repoUrl,
      { path: relationship.sourceClassPath, name: relationship.simpleSourceClassName, marked: relationship.sourceMarked },
      { path: relationship.targetClassPath, name: relationship.simpleTargetClassName, marked: relationship.targetMarked });
}

/**
 * Builds the raw markup of one package relationship from the structured
 * PackageRelationshipDTO fields: the hyperlink targets are project.repoUrl plus
 * sourcePackagePath/targetPackagePath (package directories relative to the
 * project root), and the anchor texts are the package names themselves. As with
 * class relationships, the two anchors are separated by the &#8594; arrow and
 * a package marked for removal is followed by *.
 *
 * @param {*} relationship - Raw PackageRelationshipDTO entry.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {string|null} The unsanitized relationship markup, or null when the
 *   entry is not a structured PackageRelationshipDTO.
 */
export function packageRelationshipMarkup(relationship, repoUrl) {
  if (!relationship || typeof relationship !== 'object') return null;
  const hasStructuredFields = relationship.sourcePackage != null
    || relationship.targetPackage != null;
  if (!hasStructuredFields) return null;
  return relationshipAnchorsMarkup(
      repoUrl,
      { path: relationship.sourcePackagePath, name: relationship.sourcePackage, marked: relationship.sourceMarked },
      { path: relationship.targetPackagePath, name: relationship.targetPackage, marked: relationship.targetMarked });
}

/**
 * Builds the sanitized class-relationship label for template interpolation.
 * The markup is derived from untrusted report data, so it is still
 * restricted to links and markers before it reaches the template.
 *
 * @param {*} relationship - Raw ClassRelationshipDTO entry.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {string} Sanitized label markup ('' when the entry has no fields).
 */
function safeClassRelationshipLabel(relationship, repoUrl) {
  registerLinkSafetyHook();
  const markup = classRelationshipMarkup(relationship, repoUrl);
  return markup == null ? '' : sanitizeRelationshipLabel(markup);
}

/**
 * Builds the source-link markup for one disharmony table cell that carries a
 * path relative to the project root: the hyperlink target is project.repoUrl
 * plus the path, and the cell's existing text becomes the anchor text. The
 * markup is sanitized down to a hardened link before it reaches the template;
 * cells without a path are passed through untouched.
 *
 * @param {object} cell - Raw disharmony table cell.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {object} The cell, or a copy whose content is the sanitized link.
 */
function prepareDisharmonyCell(cell, repoUrl) {
  if (!cell || typeof cell !== 'object' || cell.path == null) return cell;
  registerLinkSafetyHook();
  const base = typeof repoUrl === 'string' ? repoUrl : '';
  const markup = '<a href="' + escapeHtml(base + String(cell.path)) + '" target="_blank">'
    + String(cell.content ?? '') + '</a>';
  return { ...cell, content: sanitizeRelationshipLabel(markup) };
}

/**
 * Builds the sanitized class-cell markup for one largest-cycle breakdown row
 * from the structured CycleBreakdownRowDTO fields: the hyperlink target is
 * project.repoUrl plus classPath, the anchor text is the simple class name,
 * and a class marked for removal is followed by *. Rows without a path render
 * as plain names (with the marker); the markup is sanitized to links and
 * markers before it reaches the template.
 *
 * @param {object} row - Raw breakdown row.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {object} Row copy with a restricted safeClassName label.
 */
function prepareCycleBreakdownRow(row, repoUrl) {
  if (!row || typeof row !== 'object') return row;
  registerLinkSafetyHook();
  const base = typeof repoUrl === 'string' ? repoUrl : '';
  let markup;
  if (row.classPath != null) {
    markup = '<a href="' + escapeHtml(base + String(row.classPath)) + '" target="_blank">'
      + escapeHtml(row.className) + '</a>';
  } else {
    markup = escapeHtml(row.className);
  }
  if (row.marked) markup += '*';
  return { ...row, safeClassName: sanitizeRelationshipLabel(markup) };
}

/**
 * Adapts one "class relationship to break a package cycle" entry for the
 * template. Reports serialize structured ClassRelationshipDTO objects, and
 * the template renders each entry as a raw string, so the entry is replaced
 * by its rendered label, sanitized to links and removal markers. Entries
 * of any other shape (including pre-DTO rendered-label strings) are dropped.
 *
 * @param {*} entry - Raw class-break entry.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {string|null} Sanitized label markup, or null when the entry is
 *   not a valid ClassRelationshipDTO object.
 */
function prepareClassBreakEntry(entry, repoUrl) {
  if (!entry || typeof entry !== 'object') return null;
  const markup = classRelationshipMarkup(entry, repoUrl);
  return markup == null ? null : sanitizeRelationshipLabel(markup);
}

/**
 * Copies a class relationship with its label markup built from repoUrl, the
 * class paths and the simple class names, restricted to links and markers.
 * Never trust a precomputed value from JSON.
 *
 * @param {object} relationship - Raw class relationship data.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {object} Relationship with a restricted HTML label.
 */
function prepareClassRelationship(relationship, repoUrl) {
  return {
    ...relationship,
    safeRenderedLabel: safeClassRelationshipLabel(relationship, repoUrl)
  };
}

/**
 * Copies a package relationship with label markup limited to links and
 * markers, and normalizes its class-break entries the same way. Never trust
 * a precomputed value from JSON.
 *
 * @param {object} relationship - Raw package relationship data.
 * @param {string} repoUrl - Repository URL prefix from project metadata.
 * @returns {object} Relationship with restricted HTML labels.
 */
function preparePackageRelationship(relationship, repoUrl) {
  registerLinkSafetyHook();
  const markup = packageRelationshipMarkup(relationship, repoUrl);
  return {
    ...relationship,
    safeRenderedLabel: markup == null ? '' : sanitizeRelationshipLabel(markup),
    classRelationshipsToBreakPackage: Array.isArray(relationship.classRelationshipsToBreakPackage)
      ? relationship.classRelationshipsToBreakPackage
          .map(entry => prepareClassBreakEntry(entry, repoUrl))
          .filter(entry => entry !== null)
      : []
  };
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

  const knownSort = config.sorting.enabled
    ? resolveSortKey(columns, state.sortKey)
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

  const repoUrl = data.project?.repoUrl;

  if (Array.isArray(data.classRelationshipsToRemove?.relationships)) {
    const descriptor = REPORT_TABLES['class-relationships'];
    const { rows, ui } = buildTableSlice(
      descriptor, data.classRelationshipsToRemove.relationships, stateOf(descriptor.id), config);
    result.classRelationshipsToRemove = {
      ...data.classRelationshipsToRemove,
      relationships: rows.map(row => prepareClassRelationship(row, repoUrl)),
      tableUi: ui
    };
  }

  if (Array.isArray(data.packageRelationshipsToRemove?.relationships)) {
    const descriptor = REPORT_TABLES['package-relationships'];
    const { rows, ui } = buildTableSlice(
      descriptor, data.packageRelationshipsToRemove.relationships, stateOf(descriptor.id), config);
    result.packageRelationshipsToRemove = {
      ...data.packageRelationshipsToRemove,
      relationships: rows.map(row => preparePackageRelationship(row, repoUrl)),
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
      return {
        ...disharmony,
        ui,
        table: {
          ...disharmony.table,
          headerObjs,
          rows: rows.map(row => ({
            ...row,
            cells: Array.isArray(row.cells)
              ? row.cells.map(cell => prepareDisharmonyCell(cell, repoUrl))
              : row.cells
          }))
        }
      };
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
        breakdown: breakdown.rows.map(row => prepareCycleBreakdownRow(row, repoUrl)),
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
