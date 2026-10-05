// Unit tests for lib/table-enhancer.js (plan Phase 5 support): bind search,
// sort, pagination, export and copy controls onto the rendered report DOM.
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { enhanceTables } from '../../lib/table-enhancer.js';
import { TABLE_CONFIG } from '../../lib/table-operations.js';

function buildRoot({ rows = 3 } = {}) {
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="rf-table-toolbar" data-rf-toolbar="class-relationships">
      <span class="rf-table-match" role="status" data-rf-match="class-relationships"></span>
      <div class="rf-table-actions">
        <div class="rf-table-search" data-rf-search-slot="class-relationships"></div>
        <button type="button" class="rf-export-btn" data-rf-export="class-relationships"
                aria-label="Export the class relationships table as CSV">Export CSV</button>
      </div>
    </div>
    <div class="rf-table-scroll" data-rf-scroll="class-relationships">
    <table class="rf-data-table" data-rf-table="class-relationships">
      <caption>Class relationships to remove, in priority order</caption>
      <thead>
        <tr>
          <th scope="col" aria-sort="none"><button type="button" class="rf-sort-btn" data-rf-sort="class-relationships" data-sort-key="classRelationship">Class Relationship</button></th>
          <th scope="col" aria-sort="none"><button type="button" class="rf-sort-btn" data-rf-sort="class-relationships" data-sort-key="priority">Priority</button></th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: rows }, (_, i) => `
          <tr><td class="rf-text-left">Class${i} → Target${i}</td><td class="rf-text-right">${i + 1}</td></tr>`).join('')}
      </tbody>
    </table>
    </div>
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
        simpleSourceClassName: `Class${i}`,
        simpleTargetClassName: `Target${i}`,
        sourceClassPath: `src/main/java/demo/Class${i}.java`,
        targetClassPath: `src/main/java/demo/Target${i}.java`,        priority: i + 1,
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
  it('injects a search input with the prompt as placeholder and a hidden label', () => {
    setup();
    const input = root.querySelector('input[type="search"]');
    expect(input).not.toBeNull();
    expect(input.id).toBe('rf-search-class-relationships');
    // The visible prompt lives in the placeholder (like the site's
    // "Search repositories..." box); the label stays for screen readers.
    expect(input.placeholder).toBe('Filter table...');
    const label = root.querySelector(`label[for="rf-search-class-relationships"]`);
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('Filter table');
    expect(label.className).toBe('rf-search-label');
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

  it('keeps the inline "x" hidden while the box is empty and shows it with a term', () => {
    setup();
    const clear = root.querySelector('.rf-search-clear');
    expect(clear).not.toBeNull();
    expect(clear.textContent).toBe('×');
    expect(clear.getAttribute('aria-label')).toContain('Clear');
    // No current term: the clear control is not offered yet.
    expect(clear.hidden).toBe(true);
    const input = root.querySelector('input[type="search"]');
    expect(input.value).toBe('');
  });

  it('reveals the inline "x" as soon as the user types and hides it again', () => {
    setup();
    const input = root.querySelector('input[type="search"]');
    const clear = root.querySelector('.rf-search-clear');
    input.value = 'assert';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(clear.hidden).toBe(false);
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(clear.hidden).toBe(true);
  });

  it('shows the inline "x" for a persisted term and clicking it clears the search', () => {
    setup({ tableStates: { 'class-relationships': { search: 'assert' } } });
    const clear = root.querySelector('.rf-search-clear');
    expect(clear.hidden).toBe(false);
    const input = root.querySelector('input[type="search"]');
    expect(input.value).toBe('assert');
    clear.click();
    expect(input.value).toBe('');
    expect(clear.hidden).toBe(true);
    expect(actions.some(a => a.patch.search === '' && a.patch.page === 1)).toBe(true);
  });

  it('clears the search when Escape is pressed while the box has focus', () => {
    setup({ tableStates: { 'class-relationships': { search: 'assert' } } });
    const input = root.querySelector('input[type="search"]');
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(actions.some(a => a.patch.search === '' && a.patch.page === 1)).toBe(true);
  });

  it('ignores keys other than Escape', () => {
    setup({ tableStates: { 'class-relationships': { search: 'assert' } } });
    const input = root.querySelector('input[type="search"]');
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(actions).toEqual([]);
  });
});

describe('filter clear regressions', () => {
  for (const method of ['click', 'Escape']) {
    it(`${method} clears immediately, resets the page, and requests focus restoration`, () => {
      setup({
        debounceMs: 30,
        tableStates: { 'class-relationships': {
          search: 'Class1', page: 3, sortKey: 'priority', sortDir: 'desc'
        } }
      });
      const input = root.querySelector('input[type="search"]');
      const clear = root.querySelector('.rf-search-clear');
      expect(clear.hidden).toBe(false);
      expect(clear.type).toBe('button');
      expect(clear.getAttribute('aria-label')).toBe('Clear the Class relationships to remove, in priority order table filter');
      if (method === 'click') {
        clear.click();
      } else {
        const event = new window.KeyboardEvent('keydown', {
          key: 'Escape', bubbles: true, cancelable: true
        });
        input.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
      expect(input.value).toBe('');
      expect(clear.hidden).toBe(true);
      // The patch must preserve the caller's sort state when merged.
      expect(actions).toEqual([{
        id: 'class-relationships',
        patch: { search: '', page: 1 },
        meta: { restoreFocus: true }
      }]);
    });

    it(`${method} prevents a pending debounced search from restoring the cleared term`, async () => {
      setup({ debounceMs: 20 });
      const input = root.querySelector('input[type="search"]');
      const clear = root.querySelector('.rf-search-clear');
      input.value = 'Class1';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      expect(clear.hidden).toBe(false);
      expect(actions).toEqual([]);
      if (method === 'click') clear.click();
      else input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
      expect(actions).toHaveLength(1);
      expect(actions[0].patch).toEqual({ search: '', page: 1 });
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(input.value).toBe('');
      expect(clear.hidden).toBe(true);
      // A queued callback may run, but it must never replay the old query.
      for (const action of actions) {
        expect(action.patch).toEqual({ search: '', page: 1 });
        expect(action.meta).toEqual({ restoreFocus: true });
      }
    });
  }

  it('updates clear visibility immediately while coalescing actual search actions', async () => {
    setup({ debounceMs: 20 });
    const input = root.querySelector('input[type="search"]');
    const clear = root.querySelector('.rf-search-clear');
    for (const value of ['C', 'Class', 'Class2']) {
      input.value = value;
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      expect(clear.hidden).toBe(false);
      expect(actions).toEqual([]);
    }
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(actions).toEqual([{
      id: 'class-relationships', patch: { search: 'Class2', page: 1 }, meta: { restoreFocus: true }
    }]);
  });

  it('offers a clear control for whitespace-only input', () => {
    setup({ tableStates: { 'class-relationships': { search: '   ' } } });
    const clear = root.querySelector('.rf-search-clear');
    expect(clear.hidden).toBe(false);
    clear.click();
    expect(root.querySelector('input').value).toBe('');
    expect(clear.hidden).toBe(true);
    expect(actions[0].patch).toEqual({ search: '', page: 1 });
  });

  it('leaves ordinary key events uncanceled and the current filter visible', () => {
    setup({ tableStates: { 'class-relationships': { search: 'Class1' } } });
    const input = root.querySelector('input[type="search"]');
    for (const key of ['Tab', 'Enter', 'ArrowLeft']) {
      const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(input.value).toBe('Class1');
    expect(root.querySelector('.rf-search-clear').hidden).toBe(false);
    expect(actions).toEqual([]);
  });
});

describe('sortable headers', () => {
  it('toggles the default-sorted priority column to descending on first click', () => {
    // The renderer applies the configured default (priority ascending) when no
    // state exists; toggling must start from that effective sort.
    setup();
    root.querySelector('[data-sort-key="priority"]').click();
    expect(actions).toEqual([
      { id: 'class-relationships', patch: { sortKey: 'priority', sortDir: 'desc', page: 1 }, meta: undefined }
    ]);
  });

  it('sorts ascending when a different column is clicked under the default sort', () => {
    setup();
    root.querySelector('[data-sort-key="classRelationship"]').click();
    expect(actions[0].patch).toEqual({ sortKey: 'classRelationship', sortDir: 'asc', page: 1 });
  });

  it('toggles to descending when the sorted column is clicked again', () => {
    setup({ tableStates: { 'class-relationships': { sortKey: 'priority', sortDir: 'asc' } } });
    root.querySelector('[data-sort-key="priority"]').click();
    expect(actions[0].patch).toEqual({ sortKey: 'priority', sortDir: 'desc', page: 1 });
  });

  it('switches to ascending when another column is clicked', () => {
    setup({ tableStates: { 'class-relationships': { sortKey: 'priority', sortDir: 'desc' } } });
    root.querySelector('[data-sort-key="classRelationship"]').click();
    expect(actions[0].patch).toEqual({ sortKey: 'classRelationship', sortDir: 'asc', page: 1 });
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
    expect(lines[1]).toBe('Class1 → Target1,2,1,2,false,0');
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });

  it('honours the default priority-ascending sort when no sort state exists', async () => {
    const blobs = [];
    global.URL.createObjectURL = mock(blob => { blobs.push(blob); return 'blob:x'; });
    global.URL.revokeObjectURL = mock(() => {});
    // Start with out-of-order priorities (3, 1, 2): only a real default sort
    // can put priority 1 first in the export.
    const data = demoData();
    data.classRelationshipsToRemove.relationships[0].priority = 3;
    data.classRelationshipsToRemove.relationships[1].priority = 1;
    data.classRelationshipsToRemove.relationships[2].priority = 2;
    setup({ data }); // no table state: the renderer shows priority asc by default
    root.querySelector('[data-rf-export="class-relationships"]').click();
    expect(blobs.length).toBe(1);
    const lines = (await blobs[0].text()).split('\n');
    expect(lines.length).toBe(4);
    expect(lines[1]).toBe('Class1 → Target1,1,1,2,false,0');
    expect(lines[2]).toBe('Class2 → Target2,2,2,4,false,0');
    expect(lines[3]).toBe('Class0 → Target0,3,0,0,false,0');
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });

  it('keeps the report order in the export when sorting is disabled', async () => {
    const blobs = [];
    global.URL.createObjectURL = mock(blob => { blobs.push(blob); return 'blob:x'; });
    global.URL.revokeObjectURL = mock(() => {});
    const config = structuredClone(TABLE_CONFIG);
    config.sorting.enabled = false;
    // Priorities out of order (2, 1, 3): any sort attempt would move Class1
    // to the top, so an unchanged export proves sorting was skipped.
    const data = demoData();
    data.classRelationshipsToRemove.relationships[0].priority = 2;
    data.classRelationshipsToRemove.relationships[1].priority = 1;
    setup({ data, config });
    root.querySelector('[data-rf-export="class-relationships"]').click();
    expect(blobs.length).toBe(1);
    const lines = (await blobs[0].text()).split('\n');
    expect(lines[1]).toBe('Class0 → Target0,2,0,0,false,0');
    expect(lines[2]).toBe('Class1 → Target1,1,1,2,false,0');
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });
});

describe('horizontal scrollbar on overflow', () => {
  it('enables horizontal scrolling only when the table is wider than the wrapper', () => {
    setup();
    const wrapper = root.querySelector('[data-rf-scroll="class-relationships"]');

    Object.defineProperty(wrapper, 'scrollWidth', { value: 1200, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 900, configurable: true });
    enhanceTables(root, { data: demoData(), debounceMs: 0 });
    expect(wrapper.classList.contains('rf-scroll-x-enabled')).toBe(true);

    Object.defineProperty(wrapper, 'scrollWidth', { value: 900, configurable: true });
    enhanceTables(root, { data: demoData(), debounceMs: 0 });
    expect(wrapper.classList.contains('rf-scroll-x-enabled')).toBe(false);
  });

  it('leaves wrappers without overflow untouched (viewport sticky keeps working)', () => {
    setup();
    const wrapper = root.querySelector('[data-rf-scroll="class-relationships"]');
    // jsdom reports scrollWidth === clientWidth === 0: no false positive.
    expect(wrapper.classList.contains('rf-scroll-x-enabled')).toBe(false);
  });
});

describe('sticky headers while horizontally scrolling', () => {
  // Once overflow-x turns the wrapper into a scroll container, the CSS
  // viewport-sticky header no longer pins; the enhancer pins it with a
  // translateY transform driven by window scroll instead.
  function makeWide() {
    const wrapper = root.querySelector('[data-rf-scroll="class-relationships"]');
    Object.defineProperty(wrapper, 'scrollWidth', { value: 1200, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 900, configurable: true });
    setup();
    expect(wrapper.classList.contains('rf-scroll-x-enabled')).toBe(true);
    return wrapper;
  }

  function stubGeometry(tableTop, { tableHeight = 400, headerHeight = 40, headerTop } = {}) {
    const table = root.querySelector('table');
    const thead = table.querySelector('thead');
    table.getBoundingClientRect = () => ({ top: tableTop, height: tableHeight });
    thead.getBoundingClientRect = () => ({ top: headerTop ?? tableTop, height: headerHeight });
  }

  function scrollWindow() {
    window.dispatchEvent(new window.Event('scroll'));
  }

  it('pins the header to the viewport top with a translateY transform', () => {
    makeWide();
    stubGeometry(-120);
    scrollWindow();
    const th = root.querySelector('thead th');
    expect(th.style.transform).toBe('translateY(120px)');
  });

  it('applies the same transform to every header cell', () => {
    makeWide();
    stubGeometry(-75);
    scrollWindow();
    const headers = root.querySelectorAll('thead th');
    expect(headers.length).toBe(2);
    for (const th of headers) {
      expect(th.style.transform).toBe('translateY(75px)');
    }
  });

  it('clamps the header at the bottom of the table', () => {
    makeWide();
    stubGeometry(-1000, { tableHeight: 400, headerHeight: 40 });
    scrollWindow();
    expect(root.querySelector('thead th').style.transform).toBe('translateY(360px)');
  });

  it('pins to the viewport top even with a caption above the header', () => {
    // The table's caption sits between the table's top edge and the thead;
    // pinning must follow the header, not the table top.
    makeWide();
    stubGeometry(-124.5, { headerTop: -100 });
    scrollWindow();
    expect(root.querySelector('thead th').style.transform).toBe('translateY(100px)');
  });

  it('keeps the header at its resting position above the table', () => {
    makeWide();
    stubGeometry(50);
    scrollWindow();
    expect(root.querySelector('thead th').style.transform).toBe('');
  });

  it('does not transform headers when horizontal scrolling is disabled', () => {
    setup();
    stubGeometry(-120);
    scrollWindow();
    expect(root.querySelector('thead th').style.transform).toBe('');
  });

  it('clears the transform when the table stops overflowing on re-measure', () => {
    const wrapper = makeWide();
    stubGeometry(-120);
    scrollWindow();
    expect(root.querySelector('thead th').style.transform).toBe('translateY(120px)');

    Object.defineProperty(wrapper, 'scrollWidth', { value: 900, configurable: true });
    enhanceTables(root, { data: demoData(), debounceMs: 0 });
    expect(wrapper.classList.contains('rf-scroll-x-enabled')).toBe(false);
    expect(root.querySelector('thead th').style.transform).toBe('');
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
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Class0 → Target0');
    expect(copied).toEqual([{ ok: true, text: 'Class0 → Target0' }]);
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
    expect(copied).toEqual([{ ok: false, text: 'Class0 → Target0' }]);
  });
});
