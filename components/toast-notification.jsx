'use client';

// Toast notifications for transient feedback (copy-to-clipboard confirmations
// in the report tables). Kept minimal and fully client-side: a live region
// stays mounted so screen readers announce messages as they appear, and
// repeated identical messages reset the timer instead of stacking.
import { useCallback, useEffect, useRef, useState } from 'react';
import { TABLE_CONFIG } from '../lib/table-operations';

/**
 * Toast state manager. show() adds (or refreshes) a toast that dismisses
 * itself after `duration` ms; dismiss() removes one immediately.
 *
 * @param {object} [options]
 * @param {number} [options.duration] - Auto-dismiss delay in ms.
 * @returns {{toasts: Array<{id: number, message: string}>, show: Function, dismiss: Function}}
 */
export function useToastNotifications({ duration = TABLE_CONFIG.copy.toastDuration } = {}) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback(id => {
    setToasts(current => current.filter(toast => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(message => {
    setToasts(current => {
      const existing = current.find(toast => toast.message === message);
      if (existing) {
        // Refresh the existing toast instead of stacking duplicates.
        const timer = timersRef.current.get(existing.id);
        if (timer) clearTimeout(timer);
        timersRef.current.set(existing.id, setTimeout(() => dismiss(existing.id), duration));
        return current;
      }
      const id = ++idRef.current;
      timersRef.current.set(id, setTimeout(() => dismiss(id), duration));
      return [...current, { id, message }];
    });
  }, [dismiss, duration]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  return { toasts, show, dismiss };
}

/**
 * Renders the aria-live toast region. The region itself is always mounted so
 * assistive technology picks up dynamically inserted messages.
 *
 * @param {object} props
 * @param {Array<{id: number, message: string}>} props.toasts - Active toasts.
 * @param {Function} props.onDismiss - Dismiss callback.
 */
export default function ToastRegion({ toasts = [], onDismiss }) {
  return (
    <div className="rf-toast-region" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="rf-toast">
          <span className="rf-toast-message">{toast.message}</span>
          <button
            type="button"
            className="rf-toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
