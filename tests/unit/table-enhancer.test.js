// Unit tests for lib/table-enhancer.js (plan Phase 5 support): bind search,
// sort, pagination, export and copy controls onto the rendered report DOM.
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { enhanceTables } from '../../lib/table-enhancer.js';

function buildRoot({ rows = 3 } = {}) {
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="rf-table-toolbar" data-rf-toolbar="class-relationships">
      <div class="rf-table-search" data-rf-search-slot="class-relationships"></div>
      <span class="rf-table-match" role="status" data-rf-match="class-relationships"></span>
      <button type="button" class="rf-export-btn" data-rf-export="class-relationships"
              aria-label="Export the class relationships table as CSV">Export CSV</button>
    </div>
    <table class="rf-data-table" data-rf-table="class-relationships">
      <caption>Class relationships to remove, in priority order</caption>
      <thead>
        <tr>
          <th scope="col" aria-sort="none"><button type="button" class="rf-sort-btn" data-rf-sort="class-relationships" data-sort-key="renderedLabel">Class Relationship</button></th>
          <th scope="col" aria-sort="none"><button type="button" class="rf-sort-btn" data-rf-sort="class-relationships" data-sort-key="priority">Priority</button></th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: rows }, (_, i) => `
          <tr><td class="rf-text-left">Class${i} -&gt; Target${i}</td><td class="rf-text-right">${i + 1}</td></tr>`).join('')}
      </tbody>
    </table>
    <nav class="rf-table-pagination" data-rf-pagination="class-relationships" aria-label="Pages of the class relationships table">
      <button type="button" class="rf-page-btn" data-rf-page="class-relationships" data-page-dir="prev">Previous</button>
      <span class="rf-page-status">Page 1 of 2</span>
      <button type="button" class="rf-page-btn" data-rf-page="class-relationships" data-page-dir="next">Next</button>
    </nav>`;
  document.body.appendChild(host);
  return host;
}

function demoData() {
  return {
    classRelationshipsToRemove: {
      relationships: Array.from({ length: 3 }, (_, i) => ({
        renderedLabel: `Class${i} -&gt; Target${i}`,
        priority: i + 1,
        cycleCount: i,
        effortRank: i * 2,
        alsoRemovesPackageRelationship: false,
        packageCycleCount: 0
      }))
    }
  };
}

let root;
let actions;

function setup({ tableStates = {}, data = demoData(), ...options } = {}) {
  actions = [];
  enhanceTables(root, {
    data,
    tableStates,
    debounceMs: 0,
    onTableAction: (id, patch, meta) => actions.push({ id, patch, meta }),
    ...options
  });
}

beforeEach(() => {
  root = buildRoot();
});

afterEach(() => {
  root.remove();
  delete navigator.clipboard;
});

describe('search injection', () => {
  it('injects a labelled search input wired to the live match region', () => {
    setup();
    const input = root.querySelector('input[type="search"]');
    expect(input).not.toBeNull();
    expect(input.id).toBe('rf-search-class-relationships');
    const label = root.querySelector(`label[for="rf-search-class-relationships"]`);
    expect(label).not.toBeNull();
    const match = root.querySelector('[data-rf-match="class-relationships"]');
    expect(match.id).toBe('rf-match-class-relationships');
    expect(input.getAttribute('aria-describedby')).toBe('rf-match-class-relationships');
  });

  it('debounces input and reports a search action with page reset', async () => {
    setup();
    const input = root.querySelector('input[type="search"]');
    input.value = 'assert';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(actions.length).toBe(1);
    expect(actions[0].id).toBe('class-relationships');
    expect(actions[0].patch).toEqual({ search: 'assert', page: 1 });
    expect(actions[0].meta).toEqual({ restoreFocus: true });
  });

  it('provides a clear button that resets the current search term', () => {
    setup({ tableStates: { 'class-relationships': { search: 'assert' } } });
    const clear = root.querySelector('.rf-search-clear');
    expect(clear).not.toBeNull();
    expect(clear.getAttribute('aria-label')).toContain('Clear');
    const input = root.querySelector('input[type="search"]');
    expect(input.value).toBe('assert');
    clear.click();
    expect(actions.some(a => a.patch.search === '' && a.patch.page === 1)).toBe(true);
  });
});

describe('sortable headers', () => {
  it('requests ascending sort when a new column is clicked', () => {
    setup();
    root.querySelector('[data-sort-key="priority"]').click();
    expect(actions).toEqual([
      { id: 'class-relationships', patch: { sortKey: 'priority', sortDir: 'asc', page: 1 }, meta: undefined }
    ]);
  });

  it('toggles to descending when the sorted column is clicked again', () => {
    setup({ tableStates: { 'class-relationships': { sortKey: 'priority', sortDir: 'asc' } } });
    root.querySelector('[data-sort-key="priority"]').click();
    expect(actions[0].patch).toEqual({ sortKey: 'priority', sortDir: 'desc', page: 1 });
  });

  it('switches to ascending when another column is clicked', () => {
    setup({ tableStates: { 'class-relationships': { sortKey: 'priority', sortDir: 'desc' } } });
    root.querySelector('[data-sort-key="renderedLabel"]').click();
    expect(actions[0].patch).toEqual({ sortKey: 'renderedLabel', sortDir: 'asc', page: 1 });
  });
});

describe('pagination controls', () => {
  it('advances and rewinds relative to the current page', () => {
    setup({ tableStates: { 'class-relationships': { page: 2 } } });
    root.querySelector('[data-page-dir="next"]').click();
    root.querySelector('[data-page-dir="prev"]').click();
    expect(actions.map(a => a.patch)).toEqual([{ page: 3 }, { page: 1 }]);
  });

  it('ignores clicks on disabled buttons', () => {
    setup();
    const prev = root.querySelector('[data-page-dir="prev"]');
    prev.disabled = true;
    prev.click();
    expect(actions).toEqual([]);
  });

  it('never navigates below page 1', () => {
    setup({ tableStates: { 'class-relationships': { page: 1 } } });
    root.querySelector('[data-page-dir="prev"]').removeAttribute('disabled');
    root.querySelector('[data-page-dir="prev"]').click();
    expect(actions).toEqual([]);
  });
});

describe('CSV export', () => {
  it('exports the full (filtered + sorted) dataset, ignoring pagination', async () => {
    const blobs = [];
    global.URL.createObjectURL = mock(blob => { blobs.push(blob); return 'blob:x'; });
    global.URL.revokeObjectURL = mock(() => {});
    setup({
      tableStates: { 'class-relationships': { search: 'class1', sortKey: 'priority', sortDir: 'desc', page: 1 } }
    });
    root.querySelector('[data-rf-export="class-relationships"]').click();
    expect(blobs.length).toBe(1);
    const text = await blobs[0].text();
    const lines = text.split('\n');
    expect(lines[0]).toBe('Class Relationship,Priority,In Class Cycles,Relationship Strength,Also Removes Pkg Cycle Relationship,In Package Cycles');
    // all three rows match nothing about 'class1' except row index 1 -> 1 row
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe('Class1 -> Target1,2,1,2,false,0');
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });
});

describe('copy cell content', () => {
  it('marks body cells as focusable copy targets', () => {
    setup();
    const cells = root.querySelectorAll('tbody td');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.getAttribute('tabindex')).toBe('0');
      expect(cell.hasAttribute('data-rf-copy')).toBe(true);
      expect(cell.getAttribute('title')).toContain('copy');
    }
  });

  it('copies the cell text on click and reports success', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    const copied = [];
    setup({ onCopy: (ok, text) => copied.push({ ok, text }) });
    const cell = root.querySelector('tbody td');
    cell.click();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Class0 -> Target0');
    expect(copied).toEqual([{ ok: true, text: 'Class0 -> Target0' }]);
  });

  it('copies on Enter and Space keydown', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    setup();
    const cell = root.querySelectorAll('tbody td')[1];
    cell.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cell.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it('does not copy on unrelated keys', () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    setup();
    const cell = root.querySelector('tbody td');
    cell.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('reports failure when the clipboard is unavailable', async () => {
    const copied = [];
    setup({ onCopy: (ok, text) => copied.push({ ok, text }) });
    root.querySelector('tbody td').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(copied).toEqual([{ ok: false, text: 'Class0 -> Target0' }]);
  });
});
