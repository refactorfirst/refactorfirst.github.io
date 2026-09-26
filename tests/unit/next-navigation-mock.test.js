// Guard: every integration test file that mocks 'next/navigation' must build
// its mock from the shared stub in tests/integration/next-navigation-stub.js.
//
// Bun's mock.module() registry is process-wide, while test file evaluation
// overlaps (top-level awaits yield to other files): a page module importing
// { notFound } from 'next/navigation' can link against whatever mock is
// currently active. If that mock lacks notFound, the import dies at link
// time with a SyntaxError and the whole test file aborts — this is what
// broke the PR build under CI's filesystem-dependent file order. The shared
// stub keeps every mock shape-compatible.
import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const INTEGRATION_DIR = path.join(import.meta.dir, '../integration');

function filesMockingNextNavigation() {
  return readdirSync(INTEGRATION_DIR)
    .filter(name => /\.(test|spec)\.jsx?$/.test(name))
    .map(name => [name, readFileSync(path.join(INTEGRATION_DIR, name), 'utf8')])
    .filter(([, content]) => content.includes("mock.module('next/navigation'"));
}

describe('next/navigation mocks across integration tests', () => {
  it('all use the shared stub so every mock has an identical export shape', () => {
    const offending = filesMockingNextNavigation()
      .filter(([, content]) => !content.includes('sharedNextNavigationMock'))
      .map(([name]) => name);
    expect(offending).toEqual([]);
  });
});
