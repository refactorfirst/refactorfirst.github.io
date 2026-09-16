// Mustache + DOMPurify rendering. The vendored copies (assets/vendor/) were
// superseded by npm dependencies in Phase 2 (plan Technical Appendix §2,
// Option A: bundle). Behavior is unchanged: repository report data and
// templates are untrusted, so Mustache escapes by default and DOMPurify
// sanitizes the final HTML.
import Mustache from 'mustache';
import DOMPurify from 'dompurify';

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
  // Allow-list is deliberately tight: the bundled template only needs text,
  // table, popup and chart markup; elements like iframe/object/embed/meta/
  // link/form/input/select/styleable-document tags would let report data
  // embed remote frames, redirects or credential-harvesting forms, so they
  // are removed no matter what the data contains.
  return DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: [
      'a', 'abbr', 'acronym', 'address', 'article', 'aside',
      'b', 'bdi', 'bdo', 'big', 'blockquote', 'body', 'br', 'button', 'canvas',
      'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd',
      'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em',
      'fieldset', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'html', 'i',
      'img', 'ins', 'kbd', 'label', 'legend', 'li',
      'main', 'mark', 'meter', 'nav',
      'ol', 'output', 'p',
      'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
      'section', 'small', 'span', 'strong', 'style',
      'sub', 'summary', 'sup', 'table', 'tbody', 'td',
      'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'u', 'ul', 'var',
      'wbr', '#text'
    ],
    ADD_ATTR: ['target', 'align'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'meta', 'link', 'form', 'input', 'select', 'textarea'],
    FORCE_BODY: true
  });
}
