import { it, expect } from 'bun:test';
import { renderTemplate } from '../../lib/renderer.js';
it('keeps style tags', () => {
  const out = renderTemplate('<style>.x { color: red; }</style><p>ok</p>', {});
  expect(out).toContain('<style>');
});
