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

let linkSafetyHookRegistered = false;

/**
 * Registers a DOMPurify hook that protects links opening a new browsing context.
 *
 * The hook adds `rel="noopener noreferrer"` to sanitized anchors whose target
 * is `_blank`. Registration occurs at most once and is skipped when DOMPurify
 * does not expose browser hooks.
 */
function registerLinkSafetyHook() {
  if (linkSafetyHookRegistered || typeof DOMPurify.addHook !== 'function') return;
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  linkSafetyHookRegistered = true;
}

/**
 * Renders report data into a Mustache template and sanitizes the resulting HTML.
 *
 * Mustache escapes ordinary interpolations, while DOMPurify also sanitizes raw
 * interpolations and template markup according to the report allowlist.
 *
 * @param {string} template - Mustache template to render.
 * @param {object} data - Report data available to the template.
 * @returns {string} Sanitized rendered HTML.
 */
export function renderTemplate(template, data) {
  const mustache = initializeMustache();
  const rendered = mustache.render(template, data);
  registerLinkSafetyHook();
    // Allow-list is deliberately tight: the bundled template only needs text,
    // table, popup and chart markup; elements like iframe/object/embed/meta/
    // link/form/input/select/styleable-document tags would let report data
    // embed remote frames, redirects or credential-harvesting forms, so they
    // are removed no matter what the data contains. Obsolete HTML4
    // presentational attributes (align, border, ...) are likewise not in the
    // allow-list: rendering is styled through classes in the template CSS.
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
      ADD_ATTR: ['target'],
      // HTML5-obsolete presentational attributes are stripped even though
      // DOMPurify's default allow-list would keep them.
      FORBID_ATTR: [
        'align', 'alink', 'background', 'bgcolor', 'border', 'char', 'charoff',
        'clear', 'compact', 'frame', 'frameborder', 'hspace', 'link',
        'marginheight', 'marginwidth', 'noshade', 'noresize', 'rules',
        'scrolling', 'start', 'text', 'valign', 'vlink', 'vspace'
      ],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'meta', 'link', 'form', 'input', 'select', 'textarea'],
      FORCE_BODY: true
    });
  }
