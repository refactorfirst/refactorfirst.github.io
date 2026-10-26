import { describe, it, expect, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const bridgeUrl = new URL('../../public/widgets/vizdom-bridge.js', import.meta.url);
// Evaluate the response loader with isolated browser APIs, without starting
// the vendored WASM module (which requires a real browser).
const loaderSource = readFileSync(bridgeUrl, 'utf8')
  .split("\nimport('./vizdom_ts.min.js')")[0]
  .replaceAll('import.meta.url', JSON.stringify(bridgeUrl.href)) + '\nloadWasmResponse;';

function createLoader(cache, response) {
  const fetch = mock(async () => response);
  const load = runInNewContext(loaderSource, {
    URL,
    caches: { open: async () => cache },
    fetch
  });
  return { load, fetch };
}

describe('vizdom WASM response cache', () => {
  it('returns the network response before a pending cache write finishes', async () => {
    let finishWrite;
    const write = new Promise(resolve => { finishWrite = resolve; });
    const response = new Response('wasm');
    const cache = { match: async () => undefined, put: mock(() => write) };
    const { load } = createLoader(cache, response);
    let result;
    const loading = load().then(value => { result = value; });
    try {
      // Flush the cache-open, match, fetch and return continuations, while
      // deliberately leaving storage unresolved.
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(cache.put).toHaveBeenCalledTimes(1);
      expect(result).toBe(response);
      const storedResponse = cache.put.mock.calls[0][1];
      expect(storedResponse).not.toBe(response);
      expect(await response.text()).toBe('wasm');
      expect(await storedResponse.text()).toBe('wasm');
    } finally {
      finishWrite();
      await loading;
    }
  });

  it('handles a cache write rejection after returning the response', async () => {
    let rejectWrite;
    const write = new Promise((_resolve, reject) => { rejectWrite = reject; });
    const response = new Response('wasm');
    const cache = { match: async () => undefined, put: () => write };
    const { load } = createLoader(cache, response);
    let result;
    const loading = load().then(value => { result = value; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    rejectWrite(new Error('Storage quota exceeded'));
    await loading;
    expect(result).toBe(response);
  });

  it('uses an existing cached response without fetching or writing', async () => {
    const response = new Response('cached wasm');
    const cache = { match: async () => response, put: mock() };
    const { load, fetch } = createLoader(cache);
    expect(await load()).toBe(response);
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('preserves the network response when cache storage is unavailable', async () => {
    const response = new Response('wasm');
    const { load, fetch } = createLoader(undefined, response);
    expect(await load()).toBe(response);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
