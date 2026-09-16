// Shared @testing-library/react entry point for integration tests.
//
// Bun runs all test files against one shared jsdom document, so DOM state
// leaks across files. Every JSX test file must call `installRtlDom()` at module
// scope: it resets <body> before each test (files are loaded once, so hooks
// registered here attach to the calling file) and unmounts React trees after
// each test.
import { beforeEach, afterEach } from 'bun:test';
import { cleanup } from '@testing-library/react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export function installRtlDom() {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(cleanup);
}

export * from '@testing-library/react';
