// Phase 1 of the enhanced-tables plan: pure table operations (pagination,
// sorting, filtering, CSV export, copy-to-clipboard) used by the renderer
// and the client-side table enhancer.
import { describe, it, expect, mock, afterEach } from 'bun:test';
import {
  TABLE_CONFIG,
  paginateTableData,
  pageCount,
  sortTableData,
  filterTableData,
  stripHtml,
  escapeCsvValue,
  buildCsv,
  generateCsvFilename,
  exportTableToCsv,
  copyCellContent
} from '../../lib/table-operations.js';

const range = n => Array.from({ length: n }, (_, i) => i + 1);

afterEach(() => {
  delete navigator.clipboard;
  delete document.execCommand;
});

describe('paginateTableData', () => {
  it('returns an empty array for empty data', () => {
    expect(paginateTableData([], 10, 1)).toEqual([]);
  });

  it('returns all items when they fit on one page', () => {
    expect(paginateTableData(range(5), 10, 1)).toEqual(range(5));
  });

  it('returns the first pageSize items for page 1', () => {
    expect(paginateTableData(range(25), 10, 1)).toEqual(range(10));
  });

  it('returns items 11-20 for page 2', () => {
    expect(paginateTableData(range(25), 10, 2)).toEqual(range(20).slice(10));
  });

  it('returns the remainder on the last page', () => {
    expect(paginateTableData(range(25), 10, 3)).toEqual([21, 22, 23, 24, 25]);
  });

  it('returns an empty array when the page is out of bounds', () => {
    expect(paginateTableData(range(25), 10, 4)).toEqual([]);
  });

  it('defaults to page 1 for page 0', () => {
    expect(paginateTableData(range(25), 10, 0)).toEqual(range(10));
  });

  it('defaults to page 1 for negative pages', () => {
    expect(paginateTableData(range(25), 10, -1)).toEqual(range(10));
  });

  it('defaults to page 1 for non-numeric pages', () => {
    expect(paginateTableData(range(25), 10, 'invalid')).toEqual(range(10));
  });

  it('does not mutate the input array', () => {
    const input = range(25);
    paginateTableData(input, 10, 2);
    expect(input).toEqual(range(25));
  });
});

describe('pageCount', () => {
  it('returns 0 for no rows', () => {
    expect(pageCount(0, 10)).toBe(0);
  });

  it('rounds up for partial pages', () => {
    expect(pageCount(25, 10)).toBe(3);
    expect(pageCount(20, 10)).toBe(2);
    expect(pageCount(1, 10)).toBe(1);
  });
});

describe('sortTableData', () => {
  it('sorts ascending by the given column', () => {
    const data = [{ a: 2 }, { a: 1 }];
    expect(sortTableData(data, 'a', 'asc')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('sorts descending by the given column', () => {
    const data = [{ a: 1 }, { a: 2 }];
    expect(sortTableData(data, 'a', 'desc')).toEqual([{ a: 2 }, { a: 1 }]);
  });

  it('is stable for equal values', () => {
    const data = [
      { a: 1, id: 'first' },
      { a: 1, id: 'second' },
      { a: 1, id: 'third' }
    ];
    const sorted = sortTableData(data, 'a', 'asc');
    expect(sorted.map(r => r.id)).toEqual(['first', 'second', 'third']);
  });

  it('places rows with missing keys at the end when ascending', () => {
    const data = [{ a: 2 }, { b: 1 }, { a: 1 }];
    expect(sortTableData(data, 'a', 'asc')).toEqual([{ a: 1 }, { a: 2 }, { b: 1 }]);
  });

  it('places rows with missing keys at the end when descending', () => {
    const data = [{ b: 1 }, { a: 2 }, { a: 1 }];
    expect(sortTableData(data, 'a', 'desc')).toEqual([{ a: 2 }, { a: 1 }, { b: 1 }]);
  });

  it('compares numeric strings numerically', () => {
    const data = [{ a: '10' }, { a: '2' }, { a: '1' }];
    expect(sortTableData(data, 'a', 'asc')).toEqual([{ a: '1' }, { a: '2' }, { a: '10' }]);
  });

  it('sorts plain strings case-insensitively', () => {
    const data = [{ a: 'banana' }, { a: 'Apple' }, { a: 'cherry' }];
    expect(sortTableData(data, 'a', 'asc').map(r => r.a)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('returns the original order when no sort column is given', () => {
    const data = [{ a: 3 }, { a: 1 }, { a: 2 }];
    expect(sortTableData(data, null, 'asc')).toBe(data);
  });

  it('defaults to ascending when no direction is given', () => {
    const data = [{ a: 2 }, { a: 1 }];
    expect(sortTableData(data, 'a', null)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('supports a custom accessor for computed cell values', () => {
    const data = [
      { cells: [{ content: '<b>20</b>' }] },
      { cells: [{ content: '<i>3</i>' }] }
    ];
    const accessor = row => stripHtml(row.cells[0].content);
    expect(sortTableData(data, 'col0', 'asc', accessor)).toEqual([
      { cells: [{ content: '<i>3</i>' }] },
      { cells: [{ content: '<b>20</b>' }] }
    ]);
  });
});

describe('filterTableData', () => {
  it('returns matching items', () => {
    const data = [{ a: 'test' }, { a: 'foo' }];
    expect(filterTableData(data, 'test')).toEqual([{ a: 'test' }]);
  });

  it('matches case-insensitively', () => {
    const data = [{ a: 'Test' }, { a: 'foo' }];
    expect(filterTableData(data, 'tEsT')).toEqual([{ a: 'Test' }]);
  });

  it('searches across all properties of each row', () => {
    const data = [{ a: 'alpha' }, { b: 'beta' }];
    expect(filterTableData(data, 'beta')).toEqual([{ b: 'beta' }]);
  });

  it('returns all data for an empty search term', () => {
    const data = [{ a: 'alpha' }, { b: 'beta' }];
    expect(filterTableData(data, '')).toEqual(data);
  });

  it('returns all data when there is no search term', () => {
    const data = [{ a: 'alpha' }, { b: 'beta' }];
    expect(filterTableData(data, null)).toBe(data);
  });

  it('supports a custom accessor for computed cell values', () => {
    const data = [
      { cells: [{ content: '<b>BlockJUnit4ClassRunner</b>' }] },
      { cells: [{ content: 'Assert' }] }
    ];
    const accessor = row => stripHtml(row.cells[0].content);
    expect(filterTableData(data, 'runner', accessor)).toEqual([
      { cells: [{ content: '<b>BlockJUnit4ClassRunner</b>' }] }
    ]);
  });
});

describe('stripHtml', () => {
  it('removes tags and decodes entities', () => {
    expect(stripHtml('<a href="https://x.test">Assert</a> &#8594; <b>ComparisonFailure</b>'))
      .toBe('Assert → ComparisonFailure');
  });

  it('handles null and undefined', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('<p>many</p>   <p>spaces</p>')).toBe('many spaces');
  });
});

describe('CSV export', () => {
  it('escapes values containing commas', () => {
    expect(escapeCsvValue('hello, world')).toBe('"hello, world"');
  });

  it('escapes values containing quotes by doubling them', () => {
    expect(escapeCsvValue('hello "world"')).toBe('"hello ""world"""');
  });

  it('escapes values containing newlines', () => {
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves plain values untouched', () => {
    expect(escapeCsvValue('plain')).toBe('plain');
    expect(escapeCsvValue(42)).toBe('42');
    expect(escapeCsvValue(null)).toBe('');
  });

  // CSV injection: spreadsheet apps evaluate cells that look like formulas;
  // prefix with an apostrophe so they render as text instead.
  it('neutralizes values that spreadsheet apps would evaluate as formulas', () => {
    expect(escapeCsvValue('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvValue('+1+1')).toBe("'+1+1");
    expect(escapeCsvValue('-2+3')).toBe("'-2+3");
    expect(escapeCsvValue('@cmd')).toBe("'@cmd");
  });

  it('neutralizes formulas hidden behind leading whitespace', () => {
    expect(escapeCsvValue('  =SUM(A1)')).toBe("'  =SUM(A1)");
    expect(escapeCsvValue('\t+cmd')).toBe("'\t+cmd");
  });

  it('still quotes formula values that contain commas or quotes', () => {
    expect(escapeCsvValue('=SUM(A1,"x")')).toBe(`"'=SUM(A1,""x"")"`);
  });

  it('does not touch negatives or @ mid-string produced by non-string values', () => {
    expect(escapeCsvValue(-42)).toBe('-42');
    expect(escapeCsvValue('a=b')).toBe('a=b');
  });

  it('buildCsv joins headers and rows', () => {
    expect(buildCsv(['a', 'b'], [['1', '2'], ['3', '4']])).toBe('a,b\n1,2\n3,4');
  });

  it('exportTableToCsv generates valid CSV from objects and header keys', () => {
    const { csv, rowCount } = exportTableToCsv(
      [{ a: 1 }, { a: 2 }],
      ['a'],
      'numbers',
      { download: false }
    );
    expect(csv).toBe('a\n1\n2');
    expect(rowCount).toBe(2);
  });

  it('exportTableToCsv supports labelled columns and custom accessors', () => {
    const { csv } = exportTableToCsv(
      [{ cells: [{ content: '<b>hello, world</b>' }] }],
      [{ key: 'col0', label: 'Class' }],
      'findings',
      { download: false, valueFor: row => stripHtml(row.cells[0].content) }
    );
    expect(csv.startsWith('Class\n')).toBe(true);
    expect(csv).toContain('"hello, world"');
  });

  it('exportTableToCsv handles special characters and unicode', () => {
    const { csv } = exportTableToCsv(
      [{ a: 'héllo, "wörld"\nnext' }],
      ['a'],
      'unicode',
      { download: false }
    );
    expect(csv).toBe('a\n"héllo, ""wörld""\nnext"');
  });

  it('generateCsvFilename reflects the table type and timestamp', () => {
    const name = generateCsvFilename('Class Relationships', new Date('2026-09-19T10:20:30.000Z'));
    expect(name).toBe('refactorfirst-class-relationships-2026-09-19T10-20-30.csv');
  });

  it('exportTableToCsv defaults the filename from the table name', () => {
    const { filename } = exportTableToCsv([{ a: 1 }], ['a'], 'Cycle Summary', {
      download: false,
      now: new Date('2026-09-19T00:00:00.000Z')
    });
    expect(filename).toBe('refactorfirst-cycle-summary-2026-09-19T00-00-00.csv');
  });

  it('download creates a Blob with a CSV MIME type and clicks an anchor', () => {
    const blobs = [];
    const clicks = [];
    const Revoked = [];
    global.URL.createObjectURL = mock(blob => {
      blobs.push(blob);
      return 'blob:mock';
    });
    global.URL.revokeObjectURL = mock(url => Revoked.push(url));
    const clickSpy = mock(() => clicks.push(true));
    const realCreate = document.createElement.bind(document);
    const createSpy = mock((tag, options) => {
      const el = realCreate(tag, options);
      if (tag === 'a') el.click = () => clickSpy();
      return el;
    });
    document.createElement = createSpy;

    const result = exportTableToCsv([{ a: '1' }], ['a'], 'demo', { now: new Date('2026-01-02T03:04:05Z') });

    document.createElement = realCreate;

    expect(clicks.length).toBe(1);
    expect(blobs.length).toBe(1);
    expect(blobs[0].type).toBe('text/csv;charset=utf-8;');
    expect(result.filename.startsWith('refactorfirst-demo-2026-01-02')).toBe(true);
    expect(result.filename.endsWith('.csv')).toBe(true);
    expect(Revoked).toEqual(['blob:mock']);

    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });
});

describe('copyCellContent', () => {
  it('copies text to the clipboard and reports success', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    await expect(copyCellContent('test text')).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
  });

  it('handles empty strings', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    await expect(copyCellContent('')).resolves.toBe(true);
  });

  it('handles null values by copying an empty string', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    await expect(copyCellContent(null)).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
  });

  it('handles special characters', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    await expect(copyCellContent('special "chars" <tag>')).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('special "chars" <tag>');
  });

  it('falls back to execCommand when the clipboard API is unavailable', async () => {
    document.execCommand = mock(() => true);
    await expect(copyCellContent('legacy')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false when neither clipboard API nor fallback is available', async () => {
    await expect(copyCellContent('stranded')).resolves.toBe(false);
  });

  it('returns false when the clipboard API rejects', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.reject(new Error('denied'))) };
    await expect(copyCellContent('denied')).resolves.toBe(false);
  });
});

describe('TABLE_CONFIG defaults', () => {
  it('ships the documented defaults', () => {
    expect(TABLE_CONFIG.pagination.threshold).toBe(20);
    expect(TABLE_CONFIG.pagination.pageSize).toBe(20);
    expect(TABLE_CONFIG.sorting.enabled).toBe(true);
    expect(TABLE_CONFIG.sorting.defaultSortColumn).toBeNull();
    expect(TABLE_CONFIG.sorting.defaultSortDirection).toBe('asc');
    expect(TABLE_CONFIG.search.enabled).toBe(true);
    expect(TABLE_CONFIG.search.debounceMs).toBe(300);
    expect(TABLE_CONFIG.export.enabled).toBe(true);
    expect(TABLE_CONFIG.copy.enabled).toBe(true);
    expect(TABLE_CONFIG.copy.toastDuration).toBe(3000);
    expect(TABLE_CONFIG.stickyHeaders).toBe(true);
  });
});
