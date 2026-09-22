// Client-side bindings for the enhanced report tables (plan Phase 5). The
// renderer produces toolbar/pagination/sortable-header markup; this module
// attaches behaviour to it after each render and reports state changes back
// to the caller (components/report-view.jsx), which re-renders the report
// with the new table state. It also injects the search inputs (the template
// cannot contain <input> elements — they are stripped from untrusted markup
// by the sanitizer, so trusted JS inserts them).

import { debounce } from './search.js';
import {
  TABLE_CONFIG,
  getTableDescriptor,
  columnValue,
  filterTableData,
  sortTableData,
  exportTableToCsv,
  copyCellContent
} from './table-operations.js';

function buildSearchControl(slot, tableId, caption, currentTerm, debounceMs, onTableAction) {
  const inputId = `rf-search-${tableId}`;
  const matchId = `rf-match-${tableId}`;

  const label = document.createElement('label');
  label.setAttribute('for', inputId);
  label.textContent = 'Filter table';

  const input = document.createElement('input');
  input.type = 'search';
  input.id = inputId;
  input.setAttribute('data-rf-search', tableId);
  input.setAttribute('aria-label', `Filter the ${caption} table`);
  // The live region that announces the match count (rendered by the
  // template); describe the input with it.
  input.setAttribute('aria-describedby', matchId);
  input.autocomplete = 'off';
  input.value = currentTerm;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'rf-search-clear';
  clear.setAttribute('aria-label', `Clear the ${caption} table filter`);
  clear.title = `Clear the ${caption} table filter`;
  clear.textContent = '×';

  const applySearch = value =>
    onTableAction(tableId, { search: value, page: 1 }, { restoreFocus: true });
  const debounced = debounce(() => applySearch(input.value), debounceMs);
  input.addEventListener('input', () => {
    if (debounceMs <= 0) {
      applySearch(input.value);
    } else {
      debounced();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    applySearch('');
  });

  label.appendChild(input);
  slot.appendChild(label);
  slot.appendChild(clear);
}

function bindSortButtons(root, tableId, state, onTableAction) {
  root.querySelectorAll(`[data-rf-sort="${tableId}"]`).forEach(button => {
    button.addEventListener('click', () => {
      const sortKey = button.dataset.sortKey;
      const sameColumn = state.sortKey === sortKey;
      onTableAction(tableId, {
        sortKey,
        sortDir: sameColumn && state.sortDir === 'asc' ? 'desc' : 'asc',
        page: 1
      });
    });
  });
}

function bindPagination(root, tableId, state, onTableAction) {
  const currentPage = Number.isFinite(Number(state.page)) ? Number(state.page) : 1;
  root.querySelectorAll(`[data-rf-page="${tableId}"]`).forEach(button => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const dir = button.dataset.pageDir === 'next' ? 1 : -1;
      const target = currentPage + dir;
      if (target < 1) return;
      onTableAction(tableId, { page: target });
    });
  });
}

function bindExport(root, tableId, descriptor, state, data) {
  root.querySelectorAll(`[data-rf-export="${tableId}"]`).forEach(button => {
    button.addEventListener('click', () => {
      const rows = descriptor.getRows(data);
      const filterText = row =>
        descriptor.columns.map(col => String(columnValue(col, row))).join(' ');
      const filtered = filterTableData(rows, state.search, filterText);
      const sorted = sortTableData(
        filtered,
        state.sortKey,
        state.sortDir || 'asc',
        (row, key) => columnValue(descriptor.columns.find(col => col.key === key), row)
      );
      exportTableToCsv(
        sorted,
        descriptor.columns.map(col => ({ key: col.key, label: col.label })),
        descriptor.id,
        { valueFor: (row, key) => columnValue(descriptor.columns.find(col => col.key === key), row) }
      );
    });
  });
}

// Wide tables get a horizontal scrollbar only when they actually overflow:
// an unconditional overflow-x would create a scroll container and break the
// viewport-sticky header. Measured after every (re-)render — table state
// changes always flow through enhanceTables — and once on window resize.
function measureHorizontalScroll(root) {
  root.querySelectorAll('.rf-table-scroll[data-rf-scroll]').forEach(wrapper => {
    wrapper.classList.toggle(
      'rf-scroll-x-enabled',
      wrapper.scrollWidth > wrapper.clientWidth + 1
    );
  });
}

// Once overflow-x makes the wrapper a scroll container, `position: sticky`
// constrains the header to that (horizontally-only scrolling) container and
// it stops pinning to the viewport. refreshStickyHeaders restores the pin
// for those wrappers by translating the header cells down by the amount the
// viewport has scrolled past the table's top, clamped so the header never
// leaves the table's box. Wrappers that fit keep pure CSS stickiness (and
// any stale transform from an earlier overflowing render is cleared).
function refreshStickyHeaders(root) {
  root.querySelectorAll('.rf-table-scroll[data-rf-scroll]').forEach(wrapper => {
    const table = wrapper.querySelector('table[data-rf-table]');
    const headers = table?.querySelectorAll('thead th');
    if (!table || !headers || headers.length === 0) return;
    let value = '';
    if (wrapper.classList.contains('rf-scroll-x-enabled')) {
      const thead = table.querySelector('thead');
      const tableRect = table.getBoundingClientRect();
      // The thead's layout box is unaffected by previously applied
      // transforms, so it anchors the resting position (which sits below the
      // table top whenever a caption precedes it).
      const headRect = thead ? thead.getBoundingClientRect() : tableRect;
      const maxOffset = Math.max(
        tableRect.height - (headRect.top - tableRect.top) - headRect.height, 0);
      const offset = Math.min(Math.max(-headRect.top, 0), maxOffset);
      if (offset > 0) value = `translateY(${offset}px)`;
    }
    headers.forEach(th => { th.style.transform = value; });
  });
}

// Window listeners are bound once; every enhanceTables call repoints them at
// the report's current container so they never act on detached DOM.
let windowListenersBound = false;
let boundRoot = null;

function bindWindowResizeMeasure(root) {
  boundRoot = root;
  if (windowListenersBound || typeof window === 'undefined') return;
  windowListenersBound = true;
  window.addEventListener('resize', () => {
    if (!boundRoot) return;
    measureHorizontalScroll(boundRoot);
    refreshStickyHeaders(boundRoot);
  });
  window.addEventListener('scroll', () => {
    if (boundRoot) refreshStickyHeaders(boundRoot);
  }, { passive: true });
}

function bindCopyableCells(table, onCopy) {
  table.querySelectorAll('tbody td').forEach(cell => {
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('data-rf-copy', '');
    cell.setAttribute('title', 'Click to copy this cell');
    const copy = () => {
      const text = cell.textContent.trim();
      copyCellContent(text).then(ok => onCopy(ok, text));
    };
    cell.addEventListener('click', copy);
    cell.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        copy();
      }
    });
  });
}

/**
 * Binds all interactive table controls found in the rendered report DOM.
 *
 * @param {Element} root - Rendered report container.
 * @param {object} [options]
 * @param {object} [options.data] - Raw report JSON (feeds CSV export).
 * @param {object} [options.tableStates] - Current per-table UI state.
 * @param {Function} [options.onTableAction] - (tableId, patch, meta) => void;
 *   the caller applies the patch and re-renders.
 * @param {Function} [options.onCopy] - (ok, text) => void copy feedback.
 * @param {object} [options.config] - TABLE_CONFIG overrides.
 * @param {number} [options.debounceMs] - Search input debounce override.
 */
export function enhanceTables(root, options = {}) {
  const {
    data = {},
    tableStates = {},
    onTableAction = () => {},
    onCopy = () => {},
    config = TABLE_CONFIG,
    debounceMs = config.search.debounceMs
  } = options;

  root.querySelectorAll('table[data-rf-table]').forEach(table => {
    const tableId = table.getAttribute('data-rf-table');
    const descriptor = getTableDescriptor(data, tableId);
    if (!descriptor) return;
    const state = tableStates[tableId] ?? {};

    if (config.search.enabled) {
      const slot = root.querySelector(`[data-rf-search-slot="${tableId}"]`);
      if (slot) {
        buildSearchControl(
          slot, tableId, descriptor.caption, state.search ?? '', debounceMs, onTableAction);
      }
      const match = root.querySelector(`[data-rf-match="${tableId}"]`);
      if (match && !match.id) match.id = `rf-match-${tableId}`;
    }
    if (config.sorting.enabled) bindSortButtons(root, tableId, state, onTableAction);
    bindPagination(root, tableId, state, onTableAction);
    if (config.export.enabled) bindExport(root, tableId, descriptor, state, data);
    if (config.copy.enabled) bindCopyableCells(table, onCopy);
  });

  measureHorizontalScroll(root);
  refreshStickyHeaders(root);
  bindWindowResizeMeasure(root);
}
