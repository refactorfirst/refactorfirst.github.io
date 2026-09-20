// Pure table operations for the enhanced report tables (plan:
// implement-paginated-tables-with-sticky-headers). Everything here is free
// of rendering concerns: paginateTableData / sortTableData / filterTableData
// power the filter -> sort -> paginate pipeline in lib/renderer.js, while
// exportTableToCsv and copyCellContent power the toolbar controls bound by
// lib/table-enhancer.js.

// Documented defaults; every knob can be overridden by the caller.
export const TABLE_CONFIG = {
  pagination: {
    threshold: 20,           // Minimum filtered rows before pagination kicks in
    pageSize: 20             // Rows per page
  },
  sorting: {
    enabled: true,
    defaultSortColumn: null, // null keeps the original report ordering
    defaultSortDirection: 'asc'
  },
  search: {
    enabled: true,
    debounceMs: 300
  },
  export: {
    enabled: true,
    maxFileSizeWarning: 10485760
  },
  copy: {
    enabled: true,
    toastDuration: 3000
  },
  stickyHeaders: true
};

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Slices one page out of a row set. Pages are 1-based; invalid page numbers
 * (0, negative, non-numeric) fall back to page 1. Out-of-range pages yield
 * an empty array.
 *
 * @param {Array} data - Full row set.
 * @param {number} pageSize - Rows per page.
 * @param {number} currentPage - Requested page (1-based).
 * @returns {Array} Rows for the requested page.
 */
export function paginateTableData(data, pageSize, currentPage) {
  const rows = Array.isArray(data) ? data : [];
  let page = Number(currentPage);
  if (!Number.isFinite(page) || page < 1) page = 1;
  page = Math.floor(page);
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/**
 * Computes the number of pages for a row count.
 *
 * @param {number} rowCount - Total rows.
 * @param {number} pageSize - Rows per page.
 * @returns {number} Page count (0 for empty data).
 */
export function pageCount(rowCount, pageSize) {
  if (!rowCount || rowCount < 0) return 0;
  return Math.ceil(rowCount / pageSize);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function comparable(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return { numeric: true, value: value ? 1 : 0 };
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : { numeric: true, value };
  }
  const text = String(value).trim();
  if (text !== '' && !Number.isNaN(Number(text))) {
    return { numeric: true, value: Number(text) };
  }
  return { numeric: false, value: text };
}

function compareValues(a, b) {
  if (a.numeric && b.numeric) return a.value - b.value;
  return String(a.value).localeCompare(String(b.value), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

/**
 * Stable-sorts rows by a column. Missing/undefined values always sink to the
 * end regardless of direction, and numeric-looking strings compare
 * numerically. A null column returns the original array untouched.
 *
 * @param {Array} data - Rows (not mutated).
 * @param {string|null} sortColumn - Column key, or null to skip sorting.
 * @param {string|null} sortDirection - 'asc' | 'desc' (default 'asc').
 * @param {Function} [accessor] - Optional (row, sortColumn) => raw value; for
 *   rows whose cell text is computed (e.g. HTML-bearing cells).
 * @returns {Array} Sorted copy, or the original array when unsorted.
 */
export function sortTableData(data, sortColumn, sortDirection, accessor) {
  if (!Array.isArray(data)) return [];
  if (sortColumn === null || sortColumn === undefined) return data;
  const direction = sortDirection === 'desc' ? -1 : 1;
  const valueOf = accessor || (row => row?.[sortColumn]);
  const annotated = data.map((row, index) => ({
    row,
    index,
    value: comparable(valueOf(row, sortColumn))
  }));
  annotated.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;  // missing values always go last
    if (b.value === null) return -1;
    const order = compareValues(a.value, b.value);
    return order === 0 ? a.index - b.index : order * direction;
  });
  return annotated.map(entry => entry.row);
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function defaultHaystack(row) {
  if (row === null || row === undefined) return '';
  if (typeof row === 'object') return Object.values(row).join(' ');
  return String(row);
}

/**
 * Case-insensitively filters rows by a search term across every string
 * visible via the accessor. An empty/absent term returns the original array.
 *
 * @param {Array} data - Rows.
 * @param {string|null} searchTerm - Term to match.
 * @param {Function} [accessor] - Optional (row) => searchable text.
 * @returns {Array} Matching rows (original array when no term).
 */
export function filterTableData(data, searchTerm, accessor) {
  if (!Array.isArray(data)) return [];
  const term = (searchTerm ?? '').toString().trim().toLowerCase();
  if (!term) return data;
  const textOf = accessor || defaultHaystack;
  return data.filter(row => String(textOf(row)).toLowerCase().includes(term));
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…'
};

/**
 * Strips HTML tags and decodes entities into plain text. Deliberately
 * regex-based: the report JSON is untrusted, so building DOM nodes from it
 * (innerHTML) could execute inline handlers before sanitization.
 *
 * @param {*} html - Possibly-HITML string.
 * @returns {string} Plain text.
 */
export function stripHtml(html) {
  if (html === null || html === undefined) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity) => {
      if (entity[0] === '#') {
        const code = entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        if (Number.isFinite(code) && code > 0 && code <= 0x10FFFF) {
          try {
            return String.fromCodePoint(code);
          } catch {
            return match;
          }
        }
        return match;
      }
      return NAMED_ENTITIES[entity] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Escapes a single CSV field per RFC 4180 (quotes doubled, values containing
 * commas/quotes/newlines wrapped in quotes).
 *
 * @param {*} value - Raw cell value.
 * @returns {string} Escaped CSV field.
 */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Builds a CSV document from header labels and pre-extracted string rows.
 *
 * @param {string[]} headers - Column labels.
 * @param {Array<Array>} rows - Row value arrays.
 * @returns {string} CSV text.
 */
export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\n');
}

/**
 * Builds a deterministic export filename: slugified table name plus an ISO
 * timestamp (colons/dots stripped to stay filesystem-safe).
 *
 * @param {string} tableName - Human/meaningful table name.
 * @param {Date} [date] - Timestamp source (defaults to now).
 * @returns {string} e.g. "class-relationships-2026-09-19T10-20-30.csv".
 */
export function generateCsvFilename(tableName, date = new Date()) {
  const slug = String(tableName || 'table')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'table';
  const stamp = (date instanceof Date && !Number.isNaN(date.getTime())
    ? date : new Date()
  ).toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  return `refactorfirst-${slug}-${stamp}.csv`;
}

function triggerDownload(csv, filename) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

/**
 * Serializes rows to CSV and (by default) triggers a browser download.
 *
 * @param {Array} rows - Data rows.
 * @param {Array<string|{key: string, label?: string}>} columns - Column keys
 *   ("a") or descriptors ({key, label}).
 * @param {string} tableName - Table name used for the download filename.
 * @param {object} [options] - {filename, now, download=false, valueFor}
 *   valueFor(row, key) overrides value extraction (e.g. HTML-bearing rows).
 * @returns {{csv: string, filename: string, rowCount: number}}
 */
export function exportTableToCsv(rows, columns, tableName, options = {}) {
  const data = Array.isArray(rows) ? rows : [];
  const cols = (Array.isArray(columns) ? columns : []).map(col =>
    typeof col === 'string' ? { key: col, label: col } : col);
  const valueFor = options.valueFor || ((row, key) => row?.[key]);
  const csv = buildCsv(
    cols.map(col => col.label ?? col.key),
    data.map(row => cols.map(col => valueFor(row, col.key)))
  );
  const filename = options.filename
    || generateCsvFilename(tableName, options.now ?? new Date());
  if (options.download !== false) {
    triggerDownload(csv, filename);
  }
  return { csv, filename, rowCount: data.length };
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

function fallbackCopy(text) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Report table registry: column models shared by the renderer pipeline
// (lib/renderer.js prepareReportData) and the client enhancer
// (lib/table-enhancer.js). column.value extracts the plain-text sort/
// filter/export value from a row; without it the raw property is used.
// ---------------------------------------------------------------------------

export const REPORT_TABLES = {
  'class-relationships': {
    id: 'class-relationships',
    caption: 'Class relationships to remove, in priority order',
    getRows: data => data?.classRelationshipsToRemove?.relationships ?? [],
    columns: [
      { key: 'renderedLabel', label: 'Class Relationship', value: row => stripHtml(row.renderedLabel) },
      { key: 'priority', label: 'Priority' },
      { key: 'cycleCount', label: 'In Class Cycles' },
      { key: 'effortRank', label: 'Relationship Strength' },
      {
        key: 'alsoRemovesPackageRelationship',
        label: 'Also Removes Pkg Cycle Relationship',
        value: row => (row.alsoRemovesPackageRelationship ? 'true' : 'false')
      },
      { key: 'packageCycleCount', label: 'In Package Cycles' }
    ]
  },
  'package-relationships': {
    id: 'package-relationships',
    caption: 'Package relationships to remove, in priority order',
    getRows: data => data?.packageRelationshipsToRemove?.relationships ?? [],
    columns: [
      { key: 'renderedLabel', label: 'Package Relationship', value: row => stripHtml(row.renderedLabel) },
      { key: 'priority', label: 'Priority' },
      { key: 'cycleCount', label: 'In Pkg Cycles' },
      { key: 'effortRank', label: 'Relationship Strength' },
      {
        key: 'classRelationshipsToBreakPackage',
        label: 'Class Relationships to Remove To Break Package Relationship',
        value: row => (row.classRelationshipsToBreakPackage ?? []).map(stripHtml).join('; ')
      }
    ]
  },
  'class-cycles-summary': {
    id: 'class-cycles-summary',
    caption: 'Class cycles summary',
    getRows: data => data?.classCycles?.summary ?? [],
    columns: [
      { key: 'cycleName', label: 'Cycle Name' },
      { key: 'priority', label: 'Priority' },
      { key: 'classCount', label: 'Class Count' },
      { key: 'relationshipCount', label: 'Relationship Count' }
    ]
  },
  'largest-cycle-breakdown': {
    id: 'largest-cycle-breakdown',
    caption: 'Classes and relationships in the largest cycle',
    getRows: data => data?.classCycles?.largestCycle?.breakdown ?? [],
    columns: [
      { key: 'className', label: 'Classes', value: row => stripHtml(row.className) },
      { key: 'edgesHtml', label: 'Relationships', value: row => stripHtml(row.edgesHtml) }
    ]
  }
};

/**
 * Builds the table descriptor for one disharmony findings table. Column
 * values come from the cell array (HTML content is stripped to text).
 *
 * @param {object} disharmony - Disharmony entry from the report JSON.
 * @param {number} index - Fallback index when no anchorId is present.
 * @returns {object} Table descriptor {id, caption, getRows, columns}.
 */
export function disharmonyTableDescriptor(disharmony, index = 0) {
  const anchor = disharmony?.anchorId ?? `findings-${index}`;
  return {
    id: `disharmony-${anchor}`,
    caption: `${disharmony?.title ?? 'Disharmony'} findings, in priority order`,
    getRows: () => disharmony?.table?.rows ?? [],
    columns: (disharmony?.table?.headers ?? []).map((label, columnIndex) => ({
      key: `col${columnIndex}`,
      label,
      value: row => stripHtml(row.cells?.[columnIndex]?.content)
    }))
  };
}

/**
 * Extracts the plain-text value of a row for a descriptor column.
 *
 * @param {{key: string, value?: Function}} column - Column definition.
 * @param {*} row - Table row.
 * @returns {*} Comparable/displayable value.
 */
export function columnValue(column, row) {
  return column.value ? column.value(row) : row?.[column.key];
}

/**
 * Looks up the table descriptor for a table id, resolving dynamic disharmony
 * tables against the report data.
 *
 * @param {object} data - Report JSON.
 * @param {string} tableId - e.g. "class-relationships" or "disharmony-GOD".
 * @returns {object|null} Descriptor or null when unknown.
 */
export function getTableDescriptor(data, tableId) {
  if (Object.prototype.hasOwnProperty.call(REPORT_TABLES, tableId)) {
    return REPORT_TABLES[tableId];
  }
  const match = /^disharmony-(.+)$/.exec(String(tableId));
  if (match) {
    const disharmony = (data?.disharmonies ?? []).find(d => d.anchorId === match[1]);
    if (disharmony) return disharmonyTableDescriptor(disharmony);
  }
  return null;
}

/**
 * Copies cell text to the clipboard, preferring the async Clipboard API and
 * falling back to the legacy execCommand path. Never throws.
 *
 * @param {*} text - Cell content (null/undefined become "").
 * @returns {Promise<boolean>} Whether the copy succeeded.
 */
export async function copyCellContent(text) {
  const value = String(text ?? '');
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  return fallbackCopy(value);
}
