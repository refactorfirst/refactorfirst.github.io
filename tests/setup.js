// Test environment setup: provide browser-like globals for unit tests via jsdom.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:8000/',
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.localStorage = dom.window.localStorage;
globalThis.URLSearchParams = dom.window.URLSearchParams;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
if (dom.window.crypto && dom.window.crypto.subtle) {
  globalThis.crypto = dom.window.crypto;
} else if (!globalThis.crypto || !globalThis.crypto.subtle) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}
globalThis.TextEncoder = globalThis.TextEncoder || dom.window.TextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder || dom.window.TextDecoder;

// Prevent js/main.js from auto-starting when imported by tests.
globalThis.__APP_AUTO_INIT__ = false;
