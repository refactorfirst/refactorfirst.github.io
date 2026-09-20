// Integration tests for the copy-feedback toast notifications (plan Phase 5):
// accessibility (live region), auto-dismiss and spam prevention.
import { describe, test, expect } from 'bun:test';
import { render, act, installRtlDom } from './rtl';
import { useEffect } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import ToastRegion, { useToastNotifications } from '../../components/toast-notification';

installRtlDom();

let api;
function Harness({ duration = 3000 }) {
  const notifications = useToastNotifications({ duration });
  useEffect(() => {
    api = notifications;
  });
  return _jsx(ToastRegion, {
    toasts: notifications.toasts,
    onDismiss: notifications.dismiss
  });
}

function show(message) {
  act(() => api.show(message));
}

describe('toast notifications', () => {
  test('keeps a polite live region in the DOM even when empty', () => {
    const { container } = render(_jsx(Harness, {}));
    const region = container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  test('shows a toast for a copied message', () => {
    const { getByText } = render(_jsx(Harness, {}));
    show('Copied org.junit.Assert');
    expect(getByText('Copied org.junit.Assert')).toBeTruthy();
  });

  test('auto-dismisses after the configured duration', async () => {
    const { queryByText } = render(_jsx(Harness, { duration: 40 }));
    show('Copied quickly');
    expect(queryByText('Copied quickly')).toBeTruthy();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
    expect(queryByText('Copied quickly')).toBeNull();
  });

  test('replaces a repeated message instead of stacking duplicates', () => {
    const { container } = render(_jsx(Harness, {}));
    show('Copied A');
    show('Copied A');
    show('Copied A');
    expect(container.querySelectorAll('.rf-toast').length).toBe(1);
  });

  test('dismiss button removes the toast early and is labelled', () => {
    const { getByText, getByLabelText, queryByText } = render(_jsx(Harness, {}));
    show('Copied dismissible');
    expect(getByText('Copied dismissible')).toBeTruthy();
    act(() => getByLabelText('Dismiss notification').click());
    expect(queryByText('Copied dismissible')).toBeNull();
  });

  test('keeps the live region mounted while toasts come and go', async () => {
    const { container } = render(_jsx(Harness, { duration: 40 }));
    show('Copied short-lived');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
    expect(container.querySelectorAll('.rf-toast').length).toBe(0);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
