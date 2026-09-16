// Phase 0 Spike A: verify @testing-library/react runs under `bun test` with
// the jsdom preload (tests/setup.js). PASSED 5/5 runs on 2026-09-15 — kept as
// an infrastructure guard. Queries are container-scoped: Bun runs all test
// files in one shared jsdom document, so global `screen` queries leak across
// files.
import { describe, test, expect } from 'bun:test';
import { render, fireEvent, installRtlDom } from './rtl';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useState } from 'react';

installRtlDom();

function SpikeButton() {
  const [count, setCount] = useState(0);
  return _jsxs('button', {
    onClick: () => setCount(c => c + 1),
    children: ['Clicked ', count, ' times']
  });
}

describe('Spike A: @testing-library/react under Bun', () => {
  test('renders and updates a stateful button', () => {
    const { getByRole } = render(_jsx(SpikeButton, {}));
    const button = getByRole('button');
    expect(button.textContent).toBe('Clicked 0 times');
    fireEvent.click(button);
    expect(button.textContent).toBe('Clicked 1 times');
  });

  test('stable across repeated runs (render/unmount)', () => {
    for (let i = 0; i < 5; i++) {
      const { getByRole, unmount } = render(_jsx(SpikeButton, {}));
      expect(getByRole('button')).toBeTruthy();
      unmount();
    }
  });
});
