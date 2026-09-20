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
// prepareReportData: filter -> sort -> paginate pipeline feeding the report
// template with paginated rows and tableUi metadata (plan Phase 3).
// ---------------------------------------------------------------------------

function synthRelationships(count) {
  return Array.from({ length: count }, (_, i) => ({
    renderedLabel: `Class${String(count - i)} &gt; Class${i}`,
    priority: (i % 5) + 1,
    cycleCount: i,
    effortRank: i * 2,
    alsoRemovesPackageRelationship: i % 2 === 0,
    packageCycleCount: i
  }));
}

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
            { content: String((i % 3) + 1), align: 'right' }
          ]
        }))
      }
    }],
    classCycles: {
      hasCycles: true,
      summary: Array.from({ length: cycleRows }, (_, i) => ({
        cycleName: `cycle-${i}`, priority: (i % 4) + 1, classCount: i + 1, relationshipCount: i + 1
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

  it('defaults the sort direction to ascending', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { sortKey: 'priority' }
    });
    expect(prepared.classRelationshipsToRemove.tableUi.sortDir).toBe('asc');
    expect(prepared.classRelationshipsToRemove.relationships[0].priority).toBe(1);
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
});
