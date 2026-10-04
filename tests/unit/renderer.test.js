import { describe, it, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderTemplate, initializeMustache, prepareReportData } from '../../lib/renderer.js';
import { TABLE_CONFIG } from '../../lib/table-operations.js';

describe('Mustache Rendering', () => {
  it('should render template with data', () => {
    const template = 'Hello {{name}}!';
    const data = { name: 'World' };
    const result = renderTemplate(template, data);
    expect(result).toBe('Hello World!');
  })

  it('should handle nested objects', () => {
    const template = '{{user.name}} - {{user.email}}';
    const data = { user: { name: 'John', email: 'john@example.com' } };
    const result = renderTemplate(template, data);
    expect(result).toBe('John - john@example.com');
  })

  it('should handle arrays', () => {
    const template = '{{#items}}{{name}}{{/items}}';
    const data = { items: [{ name: 'a' }, { name: 'b' }] };
    const result = renderTemplate(template, data);
    expect(result).toBe('ab');
  })

  it('should handle conditional sections', () => {
    const template = '{{#show}}visible{{/show}}{{^show}}hidden{{/show}}';
    const result1 = renderTemplate(template, { show: true });
    const result2 = renderTemplate(template, { show: false });
    expect(result1).toBe('visible');
    expect(result2).toBe('hidden');
  })

  it('should escape HTML by default', () => {
    const template = '{{content}}';
    const data = { content: '<script>alert(1)</script>' };
    const result = renderTemplate(template, data);
    expect(result).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  })

  it('should not escape with triple braces', () => {
    const template = '{{{content}}}';
    const data = { content: '<b>bold</b>' };
    const result = renderTemplate(template, data);
    expect(result).toBe('<b>bold</b>');
  })

  it('strips active-content tags (iframe/form/meta/link/input) from untrusted data', () => {
    const template = '{{{content}}}';
    const data = {
      content:
        '<iframe src="https://evil.example"></iframe>' +
        '<form action="https://evil.example/login"><input name="password"></form>' +
        '<meta http-equiv="refresh" content="0;url=https://evil.example">' +
        '<link rel="stylesheet" href="https://evil.example/x.css">' +
        '<object data="https://evil.example/o.swf"></object>' +
        '<p>safe</p>'
    };
    const result = renderTemplate(template, data);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
    expect(result).not.toContain('<meta');
    expect(result).not.toContain('<link');
    expect(result).not.toContain('<object');
    expect(result).toContain('<p>safe</p>');
  })

  const forbiddenElements = [
    ['script', '<script>window.__xss = 1</script>'],
    ['iframe', '<iframe src="https://evil.example"></iframe>'],
    ['object', '<object data="https://evil.example/payload"></object>'],
    ['embed', '<embed src="https://evil.example/payload">'],
    ['meta', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
    ['link', '<link rel="stylesheet" href="https://evil.example/styles.css">'],
    ['form', '<form action="https://evil.example"><button>Submit</button></form>'],
    ['input', '<input name="secret" value="credential">'],
    ['select', '<select name="secret"><option>credential</option></select>'],
    ['textarea', '<textarea name="secret">credential</textarea>']
  ];

  for (const [tag, markup] of forbiddenElements) {
    it(`strips forbidden <${tag}> elements from raw interpolations`, () => {
      const html = renderTemplate('<section>{{{content}}}</section>', { content: markup });
      const document = new JSDOM(html).window.document;

      expect(document.querySelector(tag)).toBeNull();
      expect(document.querySelector('section')).not.toBeNull();
    });
  }

  it('should handle empty data', () => {
    const template = '{{name}}';
    const result = renderTemplate(template, {});
    expect(result).toBe('');
  })

  it('should handle null/undefined values', () => {
    const template = '{{value}}';
    expect(renderTemplate(template, { value: null })).toBe('');
    expect(renderTemplate(template, { value: undefined })).toBe('');
  })

  it('initializeMustache should return Mustache instance', () => {
    const mustache = initializeMustache();
    expect(mustache).toBeDefined();
    expect(typeof mustache.render).toBe('function');
  })
})

describe('templating safety (repository-provided templates are untrusted)', () => {
  it('strips template-provided script tags from the output', () => {
    const html = renderTemplate(
      '<section>{{name}}<script>window.__xss = 1</script></section>',
      { name: 'demo' }
    );
    expect(html).not.toContain('<script>');
  });

  it('strips inline event handlers from template markup', () => {
    const html = renderTemplate(
      '<button onclick="window.__xss=1" data-x="y">Go</button>',
      {}
    );
    expect(html).not.toContain('onclick=');
    expect(html).toContain('data-x="y"');
    expect(html).toContain('<button');
  });

  it('sanitizes triple-mustache data values too', () => {
    const html = renderTemplate('<div>{{{content}}}</div>', {
      content: '<img src=x onerror="window.__xss = 1">'
    });
    expect(html).not.toContain('onerror');
    expect(html).toContain('<img');
  });

  it('normalizes target values before securing new browsing contexts', () => {
    const html = renderTemplate(
      '<a href="https://example.com" target="  _BlAnK ">New tab</a>' +
        '<a href="https://example.com/same" target="_self">Same tab</a>' +
        '<div target="_blank">Not a link</div>',
      {}
    );
    const document = new JSDOM(html).window.document;

    expect(document.querySelector('a[href="https://example.com"]')?.getAttribute('rel'))
      .toBe('noopener noreferrer');
    expect(document.querySelector('a[target="_self"]')?.hasAttribute('rel')).toBe(false);
    expect(document.querySelector('div[target="_blank"]')?.hasAttribute('rel')).toBe(false);
  });

  it('removes an explicit opener relationship from links that open a new context', () => {
    const html = renderTemplate(
      '<a href="https://example.com" target="_blank" rel="opener nofollow">New tab</a>',
      {}
    );
    const link = new JSDOM(html).window.document.querySelector('a');
    const relationships = link.getAttribute('rel').split(/\s+/);

    expect(relationships).toContain('noopener');
    expect(relationships).toContain('noreferrer');
    expect(relationships).not.toContain('opener');
  });

  it('keeps benign structure, style attributes and data attributes intact', () => {
    const html = renderTemplate(
      '<div id="popup-classGraph" style="width: 100%;"><span class="close-btn">&times;</span></div>',
      {}
    );
    expect(html).toContain('id="popup-classGraph"');
    expect(html).toContain('style="width: 100%;');
    expect(html).toContain('class="close-btn"');
  });

  it('still renders the real report template to non-empty HTML', () => {
    const html = renderTemplate('<p>{{project.name}} {{project.version}}</p>',
      { project: { name: 'JUnit', version: '1.0' } });
    expect(html).toBe('<p>JUnit 1.0</p>');
  });
});

// ---------------------------------------------------------------------------
// Source-link cell output: both report templates render the class-
// relationships cell inline; the rendering layer owns
// the link-safety behavior around it. These guards pin the rendered output
// so template or renderer changes cannot silently drop or weaken the
// source links.
// ---------------------------------------------------------------------------

describe('source-link cell rendering (owned by the report rendering layer)', () => {
  const junitFixture = JSON.parse(
    readFileSync(path.join(import.meta.dir, '../fixtures/junit4-report.json'), 'utf8')
  );

  for (const templatePath of ['assets', 'public/assets']) {
    it(`restricts relationship labels to links and markers in ${templatePath}`, () => {
      const template = readFileSync(
        path.join(import.meta.dir, `../../${templatePath}/refactor-first-report.mustache`), 'utf8'
      );
      const renderedLabel =
        '<style>body { display: none }</style>' +
        '<a href="https://example.com/source" target="_blank" rel="opener" ' +
        'style="display:none" class="close-btn" id="app" onclick="alert(1)" ' +
        'data-rf-sort="class-relationships" aria-hidden="true">Source</a>' +
        '<strong style="display:none">*</strong> &#8594; Target : 1' +
        '<img src="https://example.com/tracker"><button>Injected</button>' +
        '<a href="javascript:alert(1)">Unsafe</a>';
      const data = structuredClone(junitFixture);
      for (const key of ['classRelationshipsToRemove', 'packageRelationshipsToRemove']) {
        data[key].relationships = [
          { ...data[key].relationships[0], renderedLabel,
            safeRenderedLabel: '<style>body { color: red }</style>' },
          { priority: 2, renderedLabel: null, safeRenderedLabel: '<strong>Forged</strong>' }
        ];
      }
      const original = structuredClone(data);
      const html = renderTemplate(template, prepareReportData(data));
      const doc = new JSDOM(html).window.document;
      expect(data).toEqual(original);
      expect(html).not.toContain('body {');
      for (const table of ['class-relationships', 'package-relationships']) {
        const cells = doc.querySelectorAll(`table[data-rf-table="${table}"] tbody tr td:first-child`);
        const cell = cells[0];
        expect(cell.textContent).toContain('Source* → Target : 1');
        expect(cell.querySelector('strong')?.textContent).toBe('*');
        expect(cell.querySelector('a')?.getAttribute('href')).toBe('https://example.com/source');
        expect(cell.querySelector('a')?.getAttribute('target')).toBe('_blank');
        expect(cell.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(cell.querySelector('a:last-child')?.hasAttribute('href')).toBe(false);
        for (const element of cell.querySelectorAll('*')) {
          expect(['A', 'STRONG']).toContain(element.tagName);
          for (const attribute of element.attributes) {
            expect(['href', 'target', 'rel']).toContain(attribute.name);
          }
        }
        expect(cells[1].textContent).toBe('');
      }
    });
  }

  it('renders the class-relationships source-link cell with a hardened anchor', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const html = renderTemplate(template, prepareReportData(junitFixture));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector(
      'table[data-rf-table="class-relationships"] tbody td.rf-text-left'
    );
    expect(cell).not.toBeNull();
    const link = cell.querySelector('a[target="_blank"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('https://github.com/junit-team/junit4/blob/');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

// ---------------------------------------------------------------------------
// prepareReportData: filter -> sort -> paginate pipeline feeding the report
// template with paginated rows and tableUi metadata (plan Phase 3).
// ---------------------------------------------------------------------------

/**
 * Builds relationship fixtures with out-of-order priorities to exercise sorting.
 * @param {number} count - Number of relationship rows to generate.
 * @returns {Array<object>} Synthetic relationship rows.
 */
function synthRelationships(count) {
  return Array.from({ length: count }, (_, i) => ({
    renderedLabel: `Class${String(count - i)} > Class${i}`,
    // start out of order (4, 5, 1, 2, 3, ...) so sorted assertions are meaningful
    priority: ((i + 3) % 5) + 1,
    cycleCount: i,
    effortRank: i * 2,
    alsoRemovesPackageRelationship: i % 2 === 0,
    packageCycleCount: i
  }));
}

/**
 * Builds a report fixture with configurable table sizes and unsorted priorities.
 * @param {object} [options] - Row counts for each report table.
 * @param {number} [options.classRows=25] - Class relationship count.
 * @param {number} [options.pkgRows=5] - Package relationship count.
 * @param {number} [options.disharmonyRows=30] - Disharmony finding count.
 * @param {number} [options.cycleRows=21] - Cycle summary row count.
 * @param {number} [options.breakdownRows=3] - Largest-cycle breakdown row count.
 * @returns {object} Report data for renderer tests.
 */
function synthReport({ classRows = 25, pkgRows = 5, disharmonyRows = 30, cycleRows = 21, breakdownRows = 3 } = {}) {
  return {
    project: { name: 'Demo', version: '1.0' },
    classRelationshipsToRemove: {
      hasRelationships: classRows > 0,
      relationships: synthRelationships(classRows)
    },
    packageRelationshipsToRemove: {
      hasRelationships: pkgRows > 0,
      relationships: synthRelationships(pkgRows)
    },
    hasDisharmonies: true,
    disharmonies: [{
      anchorId: 'GOD',
      title: 'God Classes',
      problem: 'problem',
      solution: 'solution',
      table: {
        headers: ['Class', 'Priority'],
        rows: Array.from({ length: disharmonyRows }, (_, i) => ({
          cells: [
            { content: `<b>GodClass${disharmonyRows - i}</b>`, align: 'left' },
            // start out of order (2, 3, 1, ...) so sorted assertions are meaningful
            { content: String(((i + 1) % 3) + 1), align: 'right' }
          ]
        }))
      }
    }],
    classCycles: {
      hasCycles: true,
      summary: Array.from({ length: cycleRows }, (_, i) => ({
        // start out of order (3, 4, 1, 2, ...) so sorted assertions are meaningful
        cycleName: `cycle-${i}`, priority: ((i + 2) % 4) + 1, classCount: i + 1, relationshipCount: i + 1
      })),
      largestCycle: {
        hasCycleMap: true,
        cycleName: 'cycle-0',
        breakdown: Array.from({ length: breakdownRows }, (_, i) => ({
          className: `<b>CycleClass${i}</b>`, edgesHtml: `edge ${i}`
        }))
      }
    }
  };
}

describe('prepareReportData', () => {
  it('paginates large tables before rendering (page 1 keeps pageSize rows)', () => {
    const prepared = prepareReportData(synthReport({ classRows: 47 }));
    expect(prepared.classRelationshipsToRemove.relationships).toHaveLength(20);
    expect(prepared.classRelationshipsToRemove.tableUi.paginated).toBe(true);
    expect(prepared.classRelationshipsToRemove.tableUi.totalPages).toBe(3);
    expect(prepared.classRelationshipsToRemove.tableUi.currentPage).toBe(1);
    expect(prepared.classRelationshipsToRemove.tableUi.pageSize).toBe(20);
  });

  it('leaves small tables (below the threshold) unpaginated', () => {
    const prepared = prepareReportData(synthReport({ pkgRows: 18 }));
    expect(prepared.packageRelationshipsToRemove.relationships).toHaveLength(18);
    expect(prepared.packageRelationshipsToRemove.tableUi.paginated).toBe(false);
    expect(prepared.packageRelationshipsToRemove.tableUi.totalRows).toBe(18);
  });

  it('honours a configurable pagination threshold', () => {
    const config = structuredClone(TABLE_CONFIG);
    config.pagination.threshold = 50;
    const prepared = prepareReportData(synthReport({ classRows: 47 }), {}, config);
    expect(prepared.classRelationshipsToRemove.tableUi.paginated).toBe(false);
    expect(prepared.classRelationshipsToRemove.relationships).toHaveLength(47);
  });

  it('honours a configurable page size', () => {
    const config = structuredClone(TABLE_CONFIG);
    config.pagination.pageSize = 10;
    const prepared = prepareReportData(synthReport({ classRows: 47 }), {}, config);
    expect(prepared.classRelationshipsToRemove.relationships).toHaveLength(10);
    expect(prepared.classRelationshipsToRemove.tableUi.totalPages).toBe(5);
  });

  it('slices the requested page from the whole dataset', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { page: 2 }
    });
    expect(prepared.classRelationshipsToRemove.relationships).toHaveLength(5);
    expect(prepared.classRelationshipsToRemove.tableUi.currentPage).toBe(2);
    expect(prepared.classRelationshipsToRemove.tableUi.isLastPage).toBe(true);
    expect(prepared.classRelationshipsToRemove.tableUi.isFirstPage).toBe(false);
  });

  it('clamps out-of-range pages to the last page', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { page: 99 }
    });
    expect(prepared.classRelationshipsToRemove.tableUi.currentPage).toBe(2);
  });

  it('does not mutate the original report data', () => {
    const data = synthReport({ classRows: 47 });
    const beforeFirst = data.classRelationshipsToRemove.relationships[0];
    prepareReportData(data, { 'class-relationships': { page: 2, sortKey: 'priority', sortDir: 'desc' } });
    expect(data.classRelationshipsToRemove.relationships).toHaveLength(47);
    expect(data.classRelationshipsToRemove.relationships[0]).toBe(beforeFirst);
    expect(data.classRelationshipsToRemove.tableUi).toBeUndefined();
  });

  it('injects sort metadata and applies the sort before paginating', () => {
    const prepared = prepareReportData(synthReport({ classRows: 47 }), {
      'class-relationships': { sortKey: 'cycleCount', sortDir: 'desc' }
    });
    const rows = prepared.classRelationshipsToRemove.relationships;
    expect(rows[0].cycleCount).toBe(46);
    expect(rows[19].cycleCount).toBe(27);
    const ui = prepared.classRelationshipsToRemove.tableUi;
    expect(ui.sortKey).toBe('cycleCount');
    expect(ui.sortDir).toBe('desc');
    // column order: renderedLabel, priority, cycleCount, effortRank, alsoRemoves, packageCycleCount
    expect(ui.colSort).toEqual(['none', 'none', 'descending', 'none', 'none', 'none']);
    expect(ui.colIndicator[2]).toBe('▼');
    expect(ui.colIndicator[0]).toBe('');
  });

  it('applies the configured default direction (asc) when none is given', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { sortKey: 'priority' }
    });
    expect(prepared.classRelationshipsToRemove.tableUi.sortDir).toBe('asc');
    expect(prepared.classRelationshipsToRemove.relationships[0].priority).toBe(1);
  });

  it('sorts by priority ascending by default, marking the Priority header', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }));
    const ui = prepared.classRelationshipsToRemove.tableUi;
    expect(ui.sortKey).toBe('priority');
    expect(ui.sortDir).toBe('asc');
    // column order: renderedLabel, priority, cycleCount, effortRank, alsoRemoves, packageCycleCount
    expect(ui.colSort).toEqual(['none', 'ascending', 'none', 'none', 'none', 'none']);
    expect(ui.colIndicator[1]).toBe('▲');
    expect(ui.colIndicator[0]).toBe('');
    // visuals match the data: lowest priority number first, in ascending order
    expect(prepared.classRelationshipsToRemove.relationships.map(row => row.priority))
      .toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  });

  it('sorts package relationships and the cycle summary by priority by default', () => {
    const prepared = prepareReportData(synthReport({ pkgRows: 5, cycleRows: 4 }));
    expect(prepared.packageRelationshipsToRemove.tableUi.colSort[1]).toBe('ascending');
    expect(prepared.packageRelationshipsToRemove.tableUi.colIndicator[1]).toBe('▲');
    expect(prepared.packageRelationshipsToRemove.relationships.map(row => row.priority))
      .toEqual([1, 2, 3, 4, 5]);
    expect(prepared.classCycles.summaryUi.sortKey).toBe('priority');
    expect(prepared.classCycles.summaryUi.colSort).toEqual(['none', 'ascending', 'none', 'none']);
    expect(prepared.classCycles.summary.map(row => row.priority))
      .toEqual([1, 2, 3, 4]);
  });

  it('defaults disharmony findings tables to their Priority column, ascending', () => {
    const prepared = prepareReportData(synthReport({ disharmonyRows: 6 }));
    const disharmony = prepared.disharmonies[0];
    expect(disharmony.ui.sortKey).toBe('col1');
    expect(disharmony.table.headerObjs[0]).toMatchObject({
      key: 'col0', label: 'Class', sortState: 'none', indicator: ''
    });
    expect(disharmony.table.headerObjs[1]).toMatchObject({
      key: 'col1', label: 'Priority', sortState: 'ascending', indicator: '▲'
    });
    // sorted by priority asc without any explicit table state
    expect(disharmony.table.rows.map(row => row.cells[1].content))
      .toEqual(['1', '1', '2', '2', '3', '3']);
  });

  it('leaves tables without a Priority column in their original order', () => {
    const prepared = prepareReportData(synthReport({ breakdownRows: 3 }));
    const ui = prepared.classCycles.largestCycle.breakdownUi;
    expect(ui.sortKey).toBe('');
    expect(ui.colSort).toEqual(['none', 'none']);
    expect(ui.colIndicator).toEqual(['', '']);
    expect(prepared.classCycles.largestCycle.breakdown.map(row => row.className))
      .toEqual(['<b>CycleClass0</b>', '<b>CycleClass1</b>', '<b>CycleClass2</b>']);
  });

  it('still forgoes any default sort when sorting is disabled', () => {
    const config = structuredClone(TABLE_CONFIG);
    config.sorting.enabled = false;
    const prepared = prepareReportData(synthReport({ classRows: 5 }), {}, config);
    expect(prepared.classRelationshipsToRemove.tableUi.sortKey).toBe('');
    expect(prepared.classRelationshipsToRemove.relationships[0].renderedLabel)
      .toContain('Class0');
  });

  it('filters before sorting and paginating, carrying match metadata', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { search: 'class5', sortKey: 'cycleCount', sortDir: 'desc' }
    });
    const ui = prepared.classRelationshipsToRemove.tableUi;
    // "class5" matches renderedLabel Class5 of exactly one row (and Class25/15
    // contain "class1"/"Class2..." -> assert against the real filter result).
    expect(ui.searchActive).toBe(true);
    expect(ui.matchCount).toBeLessThan(25);
    expect(ui.matchCount).toBeGreaterThan(0);
    expect(ui.matchCount).toBe(prepared.classRelationshipsToRemove.relationships.length);
  });

  it('paginates disharmony findings tables and builds per-header sort state', () => {
    const prepared = prepareReportData(synthReport({ disharmonyRows: 30 }), {
      'disharmony-GOD': { sortKey: 'col1', sortDir: 'desc' }
    });
    const disharmony = prepared.disharmonies[0];
    expect(disharmony.table.rows).toHaveLength(20);
    expect(disharmony.ui.paginated).toBe(true);
    expect(disharmony.ui.totalPages).toBe(2);
    expect(disharmony.ui.tableId).toBe('disharmony-GOD');
    expect(disharmony.table.headerObjs).toHaveLength(2);
    expect(disharmony.table.headerObjs[0]).toMatchObject({
      key: 'col0', label: 'Class', sortState: 'none', indicator: ''
    });
    expect(disharmony.table.headerObjs[1]).toMatchObject({
      key: 'col1', label: 'Priority', sortState: 'descending', indicator: '▼'
    });
    // sorted by priority desc across the whole dataset, then sliced
    expect(disharmony.table.rows[0].cells[1].content).toBe('3');
  });

  it('paginates the class cycle summary and its breakdown independently', () => {
    const prepared = prepareReportData(synthReport({ cycleRows: 25, breakdownRows: 24 }));
    expect(prepared.classCycles.summary).toHaveLength(20);
    expect(prepared.classCycles.summaryUi.paginated).toBe(true);
    expect(prepared.classCycles.largestCycle.breakdown).toHaveLength(20);
    expect(prepared.classCycles.largestCycle.breakdownUi.paginated).toBe(true);
  });

  it('navigates the summary and breakdown tables independently', () => {
    const prepared = prepareReportData(synthReport({ cycleRows: 25, breakdownRows: 24 }), {
      'class-cycles-summary': { page: 2 },
      'largest-cycle-breakdown': { page: 1 }
    });
    expect(prepared.classCycles.summaryUi.currentPage).toBe(2);
    expect(prepared.classCycles.largestCycle.breakdownUi.currentPage).toBe(1);
    expect(prepared.classCycles.largestCycle.breakdown).toHaveLength(20);
  });

  it('produces page and match status text for the live regions', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { search: 'class' }
    });
    const ui = prepared.classRelationshipsToRemove.tableUi;
    expect(ui.pageStatus).toBe('Page 1 of 2');
    expect(ui.matchStatus).toContain('25 of 25');
  });

  it('keeps a stable caption and table id for aria labelling', () => {
    const prepared = prepareReportData(synthReport({}));
    expect(prepared.classRelationshipsToRemove.tableUi.tableId).toBe('class-relationships');
    expect(prepared.classRelationshipsToRemove.tableUi.caption).toContain('Class relationships');
  });

  it('renders pagination controls through the template for large tables', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const prepared = prepareReportData(synthReport({ classRows: 25, pkgRows: 2, disharmonyRows: 2, cycleRows: 2, breakdownRows: 2 }));
    const doc = new JSDOM(renderTemplate(template, prepared)).window.document;
    const nav = doc.querySelector('[data-rf-pagination="class-relationships"]');
    expect(nav).not.toBeNull();
    expect(nav.textContent).toContain('Page 1 of 2');
    expect(nav.querySelector('[data-page-dir="prev"]').hasAttribute('disabled')).toBe(true);
    expect(nav.querySelector('[data-page-dir="next"]').hasAttribute('disabled')).toBe(false);
  });

  it('renders sort buttons with aria-sort through the template', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const prepared = prepareReportData(synthReport({}), {
      'class-relationships': { sortKey: 'priority', sortDir: 'asc' }
    });
    const doc = new JSDOM(renderTemplate(template, prepared)).window.document;
    const buttons = doc.querySelectorAll('[data-rf-sort="class-relationships"]');
    expect(buttons.length).toBe(6);
    const priorityTh = doc.querySelector('th:has([data-sort-key="priority"])');
    expect(priorityTh.getAttribute('aria-sort')).toBe('ascending');
  });

  it('initializes the Priority headers with an ascending arrow, signalling sortability', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const prepared = prepareReportData(synthReport({}));
    const doc = new JSDOM(renderTemplate(template, prepared)).window.document;
    for (const tableId of [
      'class-relationships', 'package-relationships', 'class-cycles-summary'
    ]) {
      const table = doc.querySelector(`table[data-rf-table="${tableId}"]`);
      const th = [...table.querySelectorAll('thead th')]
        .find(cell => cell.querySelector('[data-sort-key="priority"]'));
      expect(th.getAttribute('aria-sort')).toBe('ascending');
      expect(th.querySelector('.rf-sort-indicator').textContent).toBe('▲');
    }
    // largest-cycle-breakdown has no Priority column: no default arrow
    const breakdown = doc.querySelector('table[data-rf-table="largest-cycle-breakdown"]');
    for (const th of breakdown.querySelectorAll('thead th')) {
      expect(th.getAttribute('aria-sort')).toBe('none');
      expect(th.querySelector('.rf-sort-indicator').textContent).toBe('');
    }
    // disharmony tables: the Priority-labelled dynamic column carries the arrow
    const disharmony = doc.querySelector('table[data-rf-table="disharmony-GOD"]');
    const disharmonyThs = [...disharmony.querySelectorAll('thead th')];
    expect(disharmonyThs[0].getAttribute('aria-sort')).toBe('none');
    expect(disharmonyThs[1].getAttribute('aria-sort')).toBe('ascending');
    expect(disharmonyThs[1].querySelector('.rf-sort-indicator').textContent).toBe('▲');
  });
});

// ---------------------------------------------------------------------------
// Class relationships to break a package cycle: RefactorFirst serializes
// structured ClassRelationshipDTO objects, which must render through the
// package relationships table cell, sanitized to links and markers only.
// Pre-DTO string entries are no longer part of the schema and are dropped.
// ---------------------------------------------------------------------------

describe('class relationships to break a package cycle cell rendering', () => {
  const template = readFileSync(
    path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
  );

  const structuredEntry = {
    sourceClass: 'org.junit.runner.Request',
    targetClass: 'org.junit.internal.requests.SortingRequest',
    sourceMarked: true,
    targetMarked: false,
    weight: 2,
    renderedLabel:
      '<a href="https://example.com/Request.java" target="_blank">Request</a>* &#8594; ' +
      '<a href="https://example.com/SortingRequest.java" target="_blank">SortingRequest</a> : 2',
    cycleCount: 1
  };
  const secondEntry = {
    sourceClass: 'org.junit.internal.MethodSorter',
    targetClass: 'org.junit.runners.MethodSorters',
    sourceMarked: false,
    targetMarked: false,
    weight: 1,
    renderedLabel:
      '<a href="https://example.com/MethodSorter.java" target="_blank">MethodSorter</a> &#8594; ' +
      '<a href="https://example.com/MethodSorters.java" target="_blank">MethodSorters</a> : 1',
    cycleCount: 1
  };

  /**
   * Builds a minimal report with the supplied class-break entries in one package relationship.
   * @param {Array<object|string>} entries - Structured DTOs or legacy labels to render.
   * @returns {object} Report fixture for the package relationship table.
   */
  function reportWithBreakEntries(entries) {
    return {
      project: { name: 'Demo', version: '1.0' },
      packageRelationshipsToRemove: {
        hasRelationships: true,
        relationships: [
          {
            renderedLabel: 'org.junit.runner &#8594; org.junit.internal : 2',
            priority: 1,
            cycleCount: 1,
            effortRank: 1,
            classRelationshipsToBreakPackage: entries
          }
        ]
      }
    };
  }

  /**
   * Parses a rendered report and asserts that its package class-break cell exists.
   * @param {string} html - Rendered report markup.
   * @returns {HTMLTableCellElement} The first package relationship's class-break cell.
   */
  function breakCellOf(html) {
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector(
      'table[data-rf-table="package-relationships"] tbody td:nth-of-type(5)'
    );
    expect(cell).not.toBeNull();
    return cell;
  }

  it('renders structured ClassRelationshipDTO entries from current reports', () => {
    const html = renderTemplate(template, prepareReportData(reportWithBreakEntries([structuredEntry])));
    const cell = breakCellOf(html);
    expect(cell.textContent).toContain('Request* → SortingRequest : 2');
    expect(cell.querySelector('a')?.getAttribute('href')).toBe('https://example.com/Request.java');
    expect(cell.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('drops pre-DTO string entries from older reports', () => {
    const html = renderTemplate(
      template,
      prepareReportData(reportWithBreakEntries([
        structuredEntry,
        '<a href="https://example.com/MethodSorter.java" target="_blank">MethodSorter</a> &#8594; ' +
          '<a href="https://example.com/MethodSorters.java" target="_blank">MethodSorters</a> : 1'
      ]))
    );
    const cell = breakCellOf(html);
    expect(cell.textContent).toContain('Request* → SortingRequest : 2');
    expect(cell.textContent).not.toContain('MethodSorter');
    expect(cell.querySelectorAll('br').length).toBe(1);
  });

  it('renders multiple entries on separate lines', () => {
    const html = renderTemplate(
      template,
      prepareReportData(reportWithBreakEntries([structuredEntry, secondEntry]))
    );
    const cell = breakCellOf(html);
    expect(cell.querySelectorAll('br').length).toBe(2);
    expect(cell.textContent).toContain('Request* → SortingRequest : 2');
    expect(cell.textContent).toContain('MethodSorter → MethodSorters : 1');
  });

  it('sanitizes class-break labels to links and markers only', () => {
    const hostile = {
      ...structuredEntry,
      renderedLabel:
        '<style>body { display: none }</style>' +
        '<a href="https://example.com/x" target="_blank" onclick="alert(1)" style="display:none">X</a>' +
        '<img src=x onerror="alert(1)">' +
        '<a href="javascript:alert(1)">Unsafe</a>'
    };
    const html = renderTemplate(template, prepareReportData(reportWithBreakEntries([hostile])));
    const cell = breakCellOf(html);
    expect(cell.textContent).toContain('X');
    expect(cell.innerHTML).not.toContain('body {');
    expect(cell.innerHTML).not.toContain('onclick');
    expect(cell.innerHTML).not.toContain('onerror');
    expect(cell.innerHTML).not.toContain('javascript:');
    expect(cell.querySelector('img')).toBeNull();
    for (const element of cell.querySelectorAll('*')) {
      expect(['A', 'BR']).toContain(element.tagName);
    }
  });

  it('does not mutate the report data while normalizing entries', () => {
    const data = reportWithBreakEntries([structuredEntry, secondEntry]);
    const original = structuredClone(data);
    prepareReportData(data);
    expect(data).toEqual(original);
  });
});
