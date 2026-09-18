// HTML5 attribute compliance: no source file that produces markup may use
// HTML4 presentational attributes (align, border, bgcolor, ...) that are
// obsolete in HTML5. Checked both by scanning the sources and — for the
// report template — by inspecting the final DOM after Mustache rendering +
// DOMPurify sanitization.
import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { renderTemplate } from '../../lib/renderer.js';

const ROOT = path.join(import.meta.dir, '../..');

// Attributes that were valid HTML4 presentational markup but are obsolete in
// HTML5 (WHATWG "obsolete features"); styling must move to CSS.
const OBSOLETE_ATTRIBUTES = [
  'align', 'alink', 'background', 'bgcolor', 'border', 'char', 'charoff',
  'clear', 'compact', 'frame', 'frameborder', 'hspace', 'link',
  'marginheight', 'marginwidth', 'noshade', 'noresize', 'rules', 'scrolling',
  'start', 'text', 'valign', 'vlink', 'vspace'
];

// Every file that contributes markup: the report template, the workflow
// sample fragments and the JS/JSX sources that embed HTML strings.
function markupSources() {
  const files = [
    'public/assets/refactor-first-report.mustache',
    ...readdirSync(path.join(ROOT, 'public/templates'))
      .filter(name => name.endsWith('.html'))
      .map(name => `public/templates/${name}`)
  ];
  return files;
}

const obsoleteAttrPattern = new RegExp(
  `<[^>]+\\s(?:${OBSOLETE_ATTRIBUTES.join('|')})\\s*=`,
  'i'
);

function scanForObsoleteAttributes(file) {
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  const found = [];
  for (const line of source.split('\n')) {
    const match = line.match(obsoleteAttrPattern);
    if (match) found.push(line.trim());
  }
  return found;
}

describe('HTML5 attribute compliance (sources)', () => {
  it('markup files contain no obsolete presentational attributes', () => {
    for (const file of markupSources()) {
      const violations = scanForObsoleteAttributes(file);
      expect(`obsolete attributes in ${file}:\n${violations.join('\n')}`).toBe(
        `obsolete attributes in ${file}:\n`
      );
    }
  });

  it('the DOMPurify allowlist does not re-admit obsolete attributes', () => {
    const html = renderTemplate(
      '<table align="center" border="5px" bgcolor="#fff"><tr><td align="left" valign="top">x</td></tr></table>',
      {}
    );
    for (const attr of OBSOLETE_ATTRIBUTES) {
      expect(html).not.toContain(`${attr}=`);
    }
    // Content itself survives — only the obsolete attributes are dropped.
    expect(html).toContain('<table>');
    expect(html).toContain('<td>');
  });
});

describe('HTML5 attribute compliance (rendered report)', () => {
  const template = readFileSync(
    path.join(ROOT, 'public/assets/refactor-first-report.mustache'),
    'utf8'
  );
  const fixture = JSON.parse(
    readFileSync(path.join(ROOT, 'tests/fixtures/junit4-report.json'), 'utf8')
  );
  const dom = new JSDOM(renderTemplate(template, fixture));

  it('rendered report has no obsolete presentational attributes', () => {
    const violations = [];
    for (const element of dom.window.document.querySelectorAll('*')) {
      for (const { name } of element.attributes) {
        if (OBSOLETE_ATTRIBUTES.includes(name)) {
          violations.push(`<${element.tagName.toLowerCase()} ${name}=...>`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('anchors opening a new browsing context use rel="noopener"', () => {
    const violations = [];
    for (const anchor of dom.window.document.querySelectorAll('a[target="_blank"]')) {
      const rel = anchor.getAttribute('rel') || '';
      if (!rel.split(/\s+/).includes('noopener')) {
        violations.push(anchor.getAttribute('href'));
      }
    }
    expect(violations).toEqual([]);
  });
});
