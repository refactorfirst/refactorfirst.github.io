import { describe, it, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { renderTemplate, initializeMustache } from '../../lib/renderer.js';

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
