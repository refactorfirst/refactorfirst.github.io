import { describe, it, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderTemplate, initializeMustache, prepareReportData, classRelationshipMarkup, packageRelationshipMarkup } from '../../lib/renderer.js';
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
// Source-link cell output: the report JSON carries the structured
// ClassRelationshipDTO fields (sourceClassPath/targetClassPath relative to
// the project root plus the simple class names), and the rendering layer
// combines them with project.repoUrl, owns the link-safety behavior and
// sanitizes the result. These guards pin the rendered output so template or
// renderer changes cannot silently drop or weaken the source links.
// ---------------------------------------------------------------------------

describe('source-link cell rendering (owned by the report rendering layer)', () => {
  const junitFixture = JSON.parse(
    readFileSync(path.join(import.meta.dir, '../fixtures/junit4-report.json'), 'utf8')
  );

  const REPO_URL =
    'https://github.com/refactorfirst/RefactorFirst/blob/5258928239a496b74a704c7653240b82a325ccab/';
  const REPORT_WRITER_PATH =
    'report/src/main/java/org/hjug/refactorfirst/report/ReportWriter.java';

  it('builds the class-relationship markup from repoUrl, class paths and simple class names', () => {
    // The exact example: repoUrl + sourceClassPath/targetClassPath form the
    // hyperlink targets, the simple class names the anchor text, separated
    // by the &#8594; arrow.
    expect(classRelationshipMarkup(
      {
        sourceClassPath: REPORT_WRITER_PATH,
        targetClassPath: REPORT_WRITER_PATH,
        simpleSourceClassName: 'ReportWriter$SecureDirectoryOps',
        simpleTargetClassName: 'ReportWriter$FallbackDirectoryOps'
      },
      REPO_URL
    )).toBe(
      '<a href="' + REPO_URL + REPORT_WRITER_PATH + '" target="_blank">ReportWriter$SecureDirectoryOps</a> ' +
        '&#8594; ' +
        '<a href="' + REPO_URL + REPORT_WRITER_PATH + '" target="_blank">ReportWriter$FallbackDirectoryOps</a>'
    );
  });

  it('appends the removal marker to marked classes', () => {
    expect(classRelationshipMarkup(
      {
        sourceClassPath: 'src/main/java/demo/A.java',
        targetClassPath: 'src/main/java/demo/B.java',
        simpleSourceClassName: 'A',
        simpleTargetClassName: 'B',
        sourceMarked: true,
        targetMarked: true
      },
      'https://github.com/demo/repo/blob/main/'
    )).toBe(
      '<a href="https://github.com/demo/repo/blob/main/src/main/java/demo/A.java" target="_blank">A</a>* ' +
        '&#8594; ' +
        '<a href="https://github.com/demo/repo/blob/main/src/main/java/demo/B.java" target="_blank">B</a>*'
    );
  });

  it('encodes class-relationship path segments and tolerates a missing repoUrl trailing slash', () => {
    expect(classRelationshipMarkup(
      {
        sourceClassPath: 'src/main/java/C#Foo.java',
        targetClassPath: 'src/main/java/B?ar.java',
        simpleSourceClassName: 'Foo',
        simpleTargetClassName: 'Bar'
      },
      'https://github.com/demo/repo'
    )).toBe(
      '<a href="https://github.com/demo/repo/src/main/java/C%23Foo.java" target="_blank">Foo</a> ' +
        '&#8594; ' +
        '<a href="https://github.com/demo/repo/src/main/java/B%3Far.java" target="_blank">Bar</a>'
    );
  });

  it('returns null for entries without the structured class-relationship fields', () => {
    expect(classRelationshipMarkup(null, REPO_URL)).toBeNull();
    expect(classRelationshipMarkup('legacy label', REPO_URL)).toBeNull();
    expect(classRelationshipMarkup({ sourceClass: 'org.example.A' }, REPO_URL)).toBeNull();
    expect(classRelationshipMarkup({ renderedLabel: '<a href="https://x">A</a>' }, REPO_URL)).toBeNull();
  });

  it('builds the package-relationship markup from repoUrl, package paths and package names', () => {
    // The package names double as the anchor text; the hyperlink targets are
    // project.repoUrl plus the package directory paths relative to the project root
    expect(packageRelationshipMarkup(
      {
        sourcePackage: 'org.hjug.graphbuilder.metrics',
        targetPackage: 'org.hjug.graphbuilder',
        sourcePackagePath: 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/metrics/',
        targetPackagePath: 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/',
        sourceMarked: false,
        targetMarked: true
      },
      REPO_URL
    )).toBe(
      '<a href="' + REPO_URL + 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/metrics/" target="_blank">org.hjug.graphbuilder.metrics</a> ' +
        '&#8594; ' +
        '<a href="' + REPO_URL + 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/" target="_blank">org.hjug.graphbuilder</a>*'
    );
  });

  it('encodes package-relationship path segments and tolerates a missing repoUrl trailing slash', () => {
    expect(packageRelationshipMarkup(
      {
        sourcePackage: 'org.demo.pkg',
        targetPackage: 'org.demo.other',
        sourcePackagePath: 'src/main/java/org/demo/pkg#dir/',
        targetPackagePath: 'src/main/java/org/demo/other?dir/'
      },
      'https://github.com/demo/repo'
    )).toBe(
      '<a href="https://github.com/demo/repo/src/main/java/org/demo/pkg%23dir/" target="_blank">org.demo.pkg</a> ' +
        '&#8594; ' +
        '<a href="https://github.com/demo/repo/src/main/java/org/demo/other%3Fdir/" target="_blank">org.demo.other</a>'
    );
  });

  it('returns null for entries without the structured package-relationship fields', () => {
    expect(packageRelationshipMarkup(null, REPO_URL)).toBeNull();
    expect(packageRelationshipMarkup('legacy label', REPO_URL)).toBeNull();
    expect(packageRelationshipMarkup({ sourceMarked: true }, REPO_URL)).toBeNull();
    expect(packageRelationshipMarkup({ renderedLabel: 'org.a &#8594; org.b : 1' }, REPO_URL)).toBeNull();
  });

  for (const templatePath of ['assets', 'public/assets']) {
    it(`renders hardened source links in the class-relationships cell (${templatePath})`, () => {
      const template = readFileSync(
        path.join(import.meta.dir, `../../${templatePath}/refactor-first-report.mustache`), 'utf8'
      );
      const data = {
        project: { name: 'Demo', version: '1.0', repoUrl: REPO_URL },
        classRelationshipsToRemove: {
          hasRelationships: true,
          relationships: [
            {
              sourceClassPath: REPORT_WRITER_PATH,
              targetClassPath: REPORT_WRITER_PATH,
              simpleSourceClassName: 'ReportWriter$SecureDirectoryOps',
              simpleTargetClassName: 'ReportWriter$FallbackDirectoryOps',
              sourceMarked: false,
              targetMarked: false,
              priority: 1,
              cycleCount: 1,
              effortRank: 1,
              alsoRemovesPackageRelationship: false,
              packageCycleCount: 0
            },
            // An entry without the structured fields renders an empty cell
            { priority: 2 }
          ]
        },
        packageRelationshipsToRemove: { hasRelationships: false, relationships: [] }
      };
      const original = structuredClone(data);
      const html = renderTemplate(template, prepareReportData(data));
      const doc = new JSDOM(html).window.document;
      expect(data).toEqual(original);
      const cells = doc.querySelectorAll('table[data-rf-table="class-relationships"] tbody tr td:first-child');
      const cell = cells[0];
      const anchors = cell.querySelectorAll('a');
      expect(anchors.length).toBe(2);
      expect(anchors[0].getAttribute('href')).toBe(REPO_URL + REPORT_WRITER_PATH);
      expect(anchors[0].getAttribute('target')).toBe('_blank');
      expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
      expect(anchors[0].textContent).toBe('ReportWriter$SecureDirectoryOps');
      expect(anchors[1].getAttribute('href')).toBe(REPO_URL + REPORT_WRITER_PATH);
      expect(anchors[1].textContent).toBe('ReportWriter$FallbackDirectoryOps');
      expect(cell.textContent).toBe('ReportWriter$SecureDirectoryOps → ReportWriter$FallbackDirectoryOps');
      for (const element of cell.querySelectorAll('*')) {
        expect(element.tagName).toBe('A');
        for (const attribute of element.attributes) {
          expect(['href', 'target', 'rel']).toContain(attribute.name);
        }
      }
      expect(cells[1].textContent).toBe('');
    });
  }

  it('neutralizes hostile class-relationship fields down to links and markers', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const data = {
      project: {
        name: 'Demo',
        version: '1.0',
        repoUrl: 'https://github.com/demo/repo/blob/main/'
      },
      classRelationshipsToRemove: {
        hasRelationships: true,
        relationships: [
          {
            sourceClassPath: 'src/main/java/demo/A.java',
            targetClassPath: 'src/main/java/demo/B.java',
            simpleSourceClassName: 'Source<img src=x onerror=alert(1)>',
            simpleTargetClassName: 'Target',
            sourceMarked: true,
            targetMarked: false,
            priority: 1,
            cycleCount: 1,
            effortRank: 1,
            alsoRemovesPackageRelationship: false,
            packageCycleCount: 0
          }
        ]
      },
      packageRelationshipsToRemove: { hasRelationships: false, relationships: [] }
    };
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="class-relationships"] tbody td.rf-text-left');
    expect(cell).not.toBeNull();
    // The hostile name is escaped into inert text; no img element is created
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.querySelectorAll('a').length).toBe(2);
    expect(cell.textContent).toContain('Source');
    expect(cell.textContent).toContain('→ Target');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('strips javascript: URLs from class-relationship links', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const data = {
      project: { name: 'Demo', version: '1.0', repoUrl: 'javascript:alert(1)//' },
      classRelationshipsToRemove: {
        hasRelationships: true,
        relationships: [
          {
            sourceClassPath: 'src/main/java/demo/A.java',
            targetClassPath: 'src/main/java/demo/B.java',
            simpleSourceClassName: 'A',
            simpleTargetClassName: 'B',
            priority: 1,
            cycleCount: 1,
            effortRank: 1,
            alsoRemovesPackageRelationship: false,
            packageCycleCount: 0
          }
        ]
      },
      packageRelationshipsToRemove: { hasRelationships: false, relationships: [] }
    };
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="class-relationships"] tbody td.rf-text-left');
    expect(cell.querySelector('a[href]')).toBeNull();
    expect(cell.textContent).toContain('A → B');
  });

  it('renders the package-relationships cell from repoUrl + package paths with hardened anchors', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const data = {
      project: { name: 'Demo', version: '1.0', repoUrl: REPO_URL },
      classRelationshipsToRemove: { hasRelationships: false, relationships: [] },
      packageRelationshipsToRemove: {
        hasRelationships: true,
        relationships: [
          {
            sourcePackage: 'org.hjug.graphbuilder.metrics',
            targetPackage: 'org.hjug.graphbuilder',
            sourcePackagePath: 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/metrics/',
            targetPackagePath: 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/',
            sourceMarked: false,
            targetMarked: true,
            priority: 1,
            cycleCount: 1,
            effortRank: 1,
            classRelationshipsToBreakPackage: []
          }
        ]
      }
    };
    const original = structuredClone(data);
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    expect(data).toEqual(original);
    const cell = doc.querySelector('table[data-rf-table="package-relationships"] tbody tr td:first-child');
    expect(cell).not.toBeNull();
    const anchors = cell.querySelectorAll('a');
    expect(anchors.length).toBe(2);
    expect(anchors[0].getAttribute('href'))
      .toBe(REPO_URL + 'codebase-graph-builder/src/main/java/org/hjug/graphbuilder/metrics/');
    expect(anchors[0].getAttribute('target')).toBe('_blank');
    expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchors[0].textContent).toBe('org.hjug.graphbuilder.metrics');
    expect(anchors[1].textContent).toBe('org.hjug.graphbuilder');
    expect(cell.textContent).toBe('org.hjug.graphbuilder.metrics → org.hjug.graphbuilder*');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('neutralizes hostile package-relationship fields down to links and markers', () => {
    const template = readFileSync(
      path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
    );
    const data = {
      project: { name: 'Demo', version: '1.0', repoUrl: 'https://github.com/demo/repo/blob/main/' },
      classRelationshipsToRemove: { hasRelationships: false, relationships: [] },
      packageRelationshipsToRemove: {
        hasRelationships: true,
        relationships: [
          {
            sourcePackage: 'org.demo.pkg<img src=x onerror=alert(1)>',
            targetPackage: 'org.demo.other',
            sourcePackagePath: 'src/main/java/org/demo/pkg" onclick="alert(1)',
            targetPackagePath: 'src/main/java/org/demo/other/',
            sourceMarked: true,
            targetMarked: false,
            priority: 1,
            cycleCount: 1,
            effortRank: 1,
            classRelationshipsToBreakPackage: []
          }
        ]
      }
    };
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="package-relationships"] tbody tr td:first-child');
    expect(cell).not.toBeNull();
    // The hostile name is escaped into inert text and the quote in the path cannot
    // break out of the href attribute: no img element, no event handler attributes
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.querySelector('[onclick]')).toBeNull();
    expect(cell.textContent).toContain('org.demo.pkg');
    expect(cell.textContent).toContain('→ org.demo.other');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

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
// Disharmony table source-link cells: the report JSON carries the plain file
// name in the Class cell plus the source path relative to the project root;
// the rendering layer combines the path with project.repoUrl and sanitizes
// the anchor before it reaches the template.
// ---------------------------------------------------------------------------

describe('disharmony table source-link cell rendering', () => {
  const template = readFileSync(
    path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
  );

  /**
   * Builds a one-row God Class findings report with the supplied Class cell.
   * @param {object} classCell - Raw Class cell from the report JSON.
   * @returns {object} Report fixture for the disharmony table.
   */
  function reportWithClassCell(classCell) {
    return {
      project: { name: 'Demo', version: '1.0', repoUrl: 'https://github.com/demo/repo/blob/main/' },
      hasDisharmonies: true,
      disharmonies: [{
        anchorId: 'GOD',
        title: 'God Classes',
        problem: 'problem',
        solution: 'solution',
        table: {
          headers: ['Class', 'Priority'],
          rows: [{
            cells: [classCell, { content: '1', align: 'right' }]
          }]
        }
      }]
    };
  }

  it('builds the Class cell link from repoUrl and the cell path', () => {
    const data = reportWithClassCell({
      content: 'TestClass.java',
      path: 'src/main/java/com/example/TestClass.java',
      align: 'left'
    });
    const original = structuredClone(data);
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    expect(data).toEqual(original);
    const cell = doc.querySelector('table[data-rf-table="disharmony-GOD"] tbody td.rf-text-left');
    expect(cell).not.toBeNull();
    const link = cell.querySelector('a');
    expect(link.getAttribute('href'))
      .toBe('https://github.com/demo/repo/blob/main/src/main/java/com/example/TestClass.java');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe('TestClass.java');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('neutralizes hostile disharmony cell fields down to a hardened link', () => {
    const data = reportWithClassCell({
      content: 'Test<img src=x onerror=alert(1)>Class.java',
      path: 'src/main/java/com/example/TestClass" onclick="alert(1)',
      align: 'left'
    });
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="disharmony-GOD"] tbody td.rf-text-left');
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.querySelector('[onclick]')).toBeNull();
    // The hostile content is escaped as inert anchor text, not nested HTML
    expect(cell.textContent).toContain('Test<img src=x onerror=alert(1)>Class.java');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('encodes disharmony cell path segments and tolerates a missing repoUrl trailing slash', () => {
    const data = reportWithClassCell({
      content: 'C#Foo.java',
      path: 'src/main/java/C#Foo.java',
      align: 'left'
    });
    data.project.repoUrl = 'https://github.com/demo/repo';
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="disharmony-GOD"] tbody td.rf-text-left');
    expect(cell.querySelector('a').getAttribute('href'))
      .toBe('https://github.com/demo/repo/src/main/java/C%23Foo.java');
  });

  it('renders cells without a path as before', () => {
    const data = reportWithClassCell({ content: 'TestClass.java', align: 'left' });
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="disharmony-GOD"] tbody td.rf-text-left');
    expect(cell.querySelector('a')).toBeNull();
    expect(cell.textContent).toBe('TestClass.java');
  });
});

// ---------------------------------------------------------------------------
// Largest cycle breakdown source-link cells: the report JSON carries the
// simple class name, the source path relative to the project root and the
// removal marker; the rendering layer combines the path with project.repoUrl
// and sanitizes the anchor before it reaches the template.
// ---------------------------------------------------------------------------

describe('largest cycle breakdown source-link cell rendering', () => {
  const template = readFileSync(
    path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
  );

  /**
   * Builds a report whose largest cycle breakdown holds the supplied rows.
   * @param {Array<object>} rows - Raw breakdown rows.
   * @returns {object} Report fixture for the largest cycle table.
   */
  function reportWithBreakdownRows(rows) {
    return {
      project: { name: 'Demo', version: '1.0', repoUrl: 'https://github.com/demo/repo/blob/main/' },
      classCycles: {
        hasCycles: true,
        summary: [],
        largestCycle: {
          hasCycleMap: true,
          cycleName: 'A \u2192 B \u2192 A',
          breakdown: rows
        }
      }
    };
  }

  it('builds the class cell link from repoUrl and the row classPath', () => {
    const data = reportWithBreakdownRows([
      {
        className: 'ReportWriter$SecureDirectoryOps',
        classPath: 'report/src/main/java/org/hjug/refactorfirst/report/ReportWriter.java',
        marked: true,
        edgesHtml: 'edge 1'
      }
    ]);
    const original = structuredClone(data);
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    expect(data).toEqual(original);
    const cell = doc.querySelector('table[data-rf-table="largest-cycle-breakdown"] tbody td.rf-text-left');
    expect(cell).not.toBeNull();
    const link = cell.querySelector('a');
    expect(link.getAttribute('href'))
      .toBe('https://github.com/demo/repo/blob/main/report/src/main/java/org/hjug/refactorfirst/report/ReportWriter.java');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe('ReportWriter$SecureDirectoryOps');
    expect(cell.textContent).toBe('ReportWriter$SecureDirectoryOps*');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('neutralizes hostile breakdown fields down to a hardened link', () => {
    const data = reportWithBreakdownRows([
      {
        className: 'Foo<img src=x onerror=alert(1)>',
        classPath: 'src/main/java/Foo" onclick="alert(1)',
        marked: false,
        edgesHtml: 'edge 1'
      }
    ]);
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="largest-cycle-breakdown"] tbody td.rf-text-left');
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.querySelector('[onclick]')).toBeNull();
    expect(cell.textContent).toContain('Foo');
    for (const element of cell.querySelectorAll('*')) {
      expect(element.tagName).toBe('A');
      for (const attribute of element.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('encodes breakdown class path segments and tolerates a missing repoUrl trailing slash', () => {
    const data = reportWithBreakdownRows([
      {
        className: 'C#Foo',
        classPath: 'src/main/java/C#Foo.java',
        marked: false,
        edgesHtml: 'edge 1'
      }
    ]);
    data.project.repoUrl = 'https://github.com/demo/repo';
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cell = doc.querySelector('table[data-rf-table="largest-cycle-breakdown"] tbody tr td:first-child');
    expect(cell.querySelector('a').getAttribute('href'))
      .toBe('https://github.com/demo/repo/src/main/java/C%23Foo.java');
  });

  it('renders rows without a class path as plain names with markers', () => {
    const data = reportWithBreakdownRows([
      { className: 'Foo', marked: true, edgesHtml: 'edge 1' },
      { className: 'Bar', edgesHtml: 'edge 2' }
    ]);
    const html = renderTemplate(template, prepareReportData(data));
    const doc = new JSDOM(html).window.document;
    const cells = doc.querySelectorAll('table[data-rf-table="largest-cycle-breakdown"] tbody tr td:first-child');
    expect(cells[0].querySelector('a')).toBeNull();
    expect(cells[0].textContent).toBe('Foo*');
    expect(cells[1].textContent).toBe('Bar');
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
    simpleSourceClassName: `Class${String(count - i)}`,
    simpleTargetClassName: `Class${i}`,
    sourceClassPath: `src/main/java/demo/Class${String(count - i)}.java`,
    targetClassPath: `src/main/java/demo/Class${i}.java`,
    // start out of order (4, 5, 1, 2, 3, ...) so sorted assertions are meaningful
    priority: ((i + 3) % 5) + 1,
    cycleCount: i,
    effortRank: i * 2,
    alsoRemovesPackageRelationship: i % 2 === 0,
    packageCycleCount: i
  }));
}

/**
 * Builds package relationship fixtures with out-of-order priorities to exercise sorting.
 * @param {number} count - Number of package relationship rows to generate.
 * @returns {Array<object>} Synthetic package relationship rows.
 */
function synthPackageRelationships(count) {
  return Array.from({ length: count }, (_, i) => ({
    sourcePackage: `com.example.pkg${(i + 1) % count}`,
    targetPackage: `com.example.pkg${i}`,
    sourcePackagePath: `src/main/java/com/example/pkg${(i + 1) % count}/`,
    targetPackagePath: `src/main/java/com/example/pkg${i}/`,
    sourceMarked: i % 2 === 0,
    targetMarked: false,
    // start out of order (4, 5, 1, 2, 3, ...) so sorted assertions are meaningful
    priority: ((i + 3) % 5) + 1,
    cycleCount: i,
    effortRank: i,
    classRelationshipsToBreakPackage: []
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
    project: { name: 'Demo', version: '1.0', repoUrl: 'https://github.com/demo/repo/blob/main/' },
    classRelationshipsToRemove: {
      hasRelationships: classRows > 0,
      relationships: synthRelationships(classRows)
    },
    packageRelationshipsToRemove: {
      hasRelationships: pkgRows > 0,
      relationships: synthPackageRelationships(pkgRows)
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
          className: `CycleClass${i}`,
          classPath: `src/main/java/demo/CycleClass${i}.java`,
          marked: i % 2 === 0,
          edgesHtml: `edge ${i}`
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
    // column order: classRelationship, priority, cycleCount, effortRank, alsoRemoves, packageCycleCount
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
    // column order: classRelationship, priority, cycleCount, effortRank, alsoRemoves, packageCycleCount
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
      .toEqual(['CycleClass0', 'CycleClass1', 'CycleClass2']);
  });

  it('still forgoes any default sort when sorting is disabled', () => {
    const config = structuredClone(TABLE_CONFIG);
    config.sorting.enabled = false;
    const prepared = prepareReportData(synthReport({ classRows: 5 }), {}, config);
    expect(prepared.classRelationshipsToRemove.tableUi.sortKey).toBe('');
    expect(prepared.classRelationshipsToRemove.relationships[0].simpleTargetClassName)
      .toBe('Class0');
  });

  it('filters before sorting and paginating, carrying match metadata', () => {
    const prepared = prepareReportData(synthReport({ classRows: 25 }), {
      'class-relationships': { search: 'class5', sortKey: 'cycleCount', sortDir: 'desc' }
    });
    const ui = prepared.classRelationshipsToRemove.tableUi;
    // "class5" matches the Class5 simple class name of exactly one row (and Class25/15
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
// structured ClassRelationshipDTO objects whose sourceClassPath/
// targetClassPath and simple class names must be combined with
// project.repoUrl and rendered through the package relationships table cell,
// sanitized to links and markers only. Pre-DTO string entries and entries
// without the structured fields are no longer part of the schema and are
// dropped.
// ---------------------------------------------------------------------------

describe('class relationships to break a package cycle cell rendering', () => {
  const template = readFileSync(
    path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
  );

  const REPO_URL = 'https://github.com/demo/repo/blob/main/';

  const structuredEntry = {
    sourceClass: 'org.junit.runner.Request',
    targetClass: 'org.junit.internal.requests.SortingRequest',
    sourceClassPath: 'src/main/java/org/junit/runner/Request.java',
    targetClassPath: 'src/main/java/org/junit/internal/requests/SortingRequest.java',
    simpleSourceClassName: 'Request',
    simpleTargetClassName: 'SortingRequest',
    sourceMarked: true,
    targetMarked: false,
    weight: 2,
    cycleCount: 1
  };
  const secondEntry = {
    sourceClass: 'org.junit.internal.MethodSorter',
    targetClass: 'org.junit.runners.MethodSorters',
    sourceClassPath: 'src/main/java/org/junit/internal/MethodSorter.java',
    targetClassPath: 'src/main/java/org/junit/runners/MethodSorters.java',
    simpleSourceClassName: 'MethodSorter',
    simpleTargetClassName: 'MethodSorters',
    sourceMarked: false,
    targetMarked: false,
    weight: 1,
    cycleCount: 1
  };

  /**
   * Builds a minimal report with the supplied class-break entries in one package relationship.
   * @param {Array<object|string>} entries - Structured DTOs or legacy labels to render.
   * @returns {object} Report fixture for the package relationship table.
   */
  function reportWithBreakEntries(entries) {
    return {
      project: { name: 'Demo', version: '1.0', repoUrl: REPO_URL },
      packageRelationshipsToRemove: {
        hasRelationships: true,
        relationships: [
          {
            sourcePackage: 'org.junit.runner',
            targetPackage: 'org.junit.internal',
            sourcePackagePath: 'src/main/java/org/junit/runner/',
            targetPackagePath: 'src/main/java/org/junit/internal/',
            sourceMarked: false,
            targetMarked: false,
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
    expect(cell.textContent).toContain('Request* → SortingRequest');
    const link = cell.querySelector('a');
    expect(link.getAttribute('href')).toBe(REPO_URL + 'src/main/java/org/junit/runner/Request.java');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // The package-relationship cell renders from the package fields too
    const doc = new JSDOM(html).window.document;
    const packageCell = doc.querySelector('table[data-rf-table="package-relationships"] tbody td:first-child');
    expect(packageCell.textContent).toBe('org.junit.runner → org.junit.internal');
    expect(packageCell.querySelector('a').getAttribute('href'))
      .toBe(REPO_URL + 'src/main/java/org/junit/runner/');
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
    expect(cell.textContent).toContain('Request* → SortingRequest');
    expect(cell.textContent).not.toContain('MethodSorter');
    expect(cell.querySelectorAll('br').length).toBe(1);
  });

  it('drops entries without the structured class-relationship fields', () => {
    const html = renderTemplate(
      template,
      prepareReportData(reportWithBreakEntries([
        structuredEntry,
        { sourceClass: 'org.junit.internal.MethodSorter', renderedLabel: 'MethodSorter &#8594; MethodSorters : 1' }
      ]))
    );
    const cell = breakCellOf(html);
    expect(cell.textContent).toContain('Request* → SortingRequest');
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
    expect(cell.textContent).toContain('Request* → SortingRequest');
    expect(cell.textContent).toContain('MethodSorter → MethodSorters');
  });

  it('sanitizes hostile class-break fields to links and markers only', () => {
    const hostile = {
      ...structuredEntry,
      sourceClassPath: 'src/main/java/org/junit/runner/Request" onclick="alert(1)',
      simpleSourceClassName: 'X<img src=x onerror="alert(1)">'
    };
    const html = renderTemplate(template, prepareReportData(reportWithBreakEntries([hostile])));
    const cell = breakCellOf(html);
    expect(cell.textContent).toContain('X');
    // The quote in the hostile path is escaped inside the href value, so it
    // cannot break out of the attribute: no img element and no event handler
    // attributes are created.
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.querySelector('[onclick]')).toBeNull();
    expect(cell.querySelectorAll('a').length).toBe(2);
    for (const element of cell.querySelectorAll('*')) {
      expect(['A', 'BR']).toContain(element.tagName);
    }
    for (const anchor of cell.querySelectorAll('a')) {
      for (const attribute of anchor.attributes) {
        expect(['href', 'target', 'rel']).toContain(attribute.name);
      }
    }
  });

  it('does not mutate the report data while normalizing entries', () => {
    const data = reportWithBreakEntries([structuredEntry, secondEntry]);
    const original = structuredClone(data);
    prepareReportData(data);
    expect(data).toEqual(original);
  });
});
