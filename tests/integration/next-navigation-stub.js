// Shared 'next/navigation' mock for integration tests.
//
// Bun hoists mock.module() and keeps one process-wide registry per module
// specifier, while test file evaluation can overlap (top-level awaits in one
// file yield while another file registers its own mock). Any module graph
// that imports { notFound } from 'next/navigation' (the app route pages) may
// therefore link against ANOTHER file's mock; if that mock lacks the
// notFound export the import fails at link time with a SyntaxError and the
// whole test file aborts. Routing every mock through this shared helper
// keeps all of them export-shape compatible no matter the load order.
export const notFoundCalls = [];

/**
 * Records a notFound call before aborting route rendering with a test sentinel.
 *
 * @throws {Error} Always throws NEXT_NOT_FOUND.
 * @returns {never}
 */
export function notFoundStub() {
  notFoundCalls.push(true);
  throw new Error('NEXT_NOT_FOUND');
}

/**
 * Builds the shared next/navigation mock with optional test-specific exports.
 *
 * @param {object} [overrides={}] - Exports to replace or add to the defaults.
 * @returns {object} Navigation exports suitable for Bun's mock.module factory.
 */
export function sharedNextNavigationMock(overrides = {}) {
  return {
    notFound: notFoundStub,
    usePathname: () => '/',
    useRouter: () => ({ push: () => {} }),
    useSearchParams: () => new URLSearchParams(''),
    ...overrides
  };
}
