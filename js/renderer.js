import Mustache from 'mustache';

let mustacheInstance = null;

export function initializeMustache() {
  if (!mustacheInstance) {
    mustacheInstance = Mustache;
  }
  return mustacheInstance;
}

export function renderTemplate(template, data) {
  const mustache = initializeMustache();
  return mustache.render(template, data);
}