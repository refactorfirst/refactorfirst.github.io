import { describe, it, expect } from 'bun:test';
import { renderTemplate, initializeMustache } from '../../js/renderer.js';

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
