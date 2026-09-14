import Mustache from '../assets/vendor/mustache.mjs';
import DOMPurify from '../assets/vendor/purify.es.mjs';

let mustacheInstance = null;

export function initializeMustache() {
  if (!mustacheInstance) {
    mustacheInstance = Mustache;
  }
  return mustacheInstance;
}

// Report JSON data and Mustache templates come from the target repository
// (untrusted third-party content). Escape via Mustache by default and
// sanitize the final HTML with DOMPurify so template-supplied <script> tags
// and inline event handlers (onclick/onerror/...) can never execute.
export function renderTemplate(template, data) {
  const mustache = initializeMustache();
  const rendered = mustache.render(template, data);
  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: {
      html: true,
      svg: false,
      svgFilters: false,
      mathMl: false
    },
    ADD_ATTR: ['target', 'align'],
    FORBID_TAGS: ['script']
  });
}
