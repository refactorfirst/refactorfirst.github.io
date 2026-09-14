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
    ALLOWED_TAGS: [
      'a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio',
      'b', 'bdi', 'bdo', 'big', 'blockquote', 'body', 'br', 'button', 'canvas',
      'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd',
      'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
      'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe',
      'img', 'input', 'ins', 'kbd', 'keygen', 'label', 'legend', 'li', 'link',
      'main', 'map', 'mark', 'menu', 'menuitem', 'meta', 'meter', 'nav',
      'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param',
      'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
      'section', 'select', 'small', 'source', 'span', 'strong', 'style',
      'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea',
      'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var',
      'video', 'wbr', '#text'
    ],
    ADD_ATTR: ['target', 'align'],
    FORBID_TAGS: ['script'],
    FORCE_BODY: true
  });
}
