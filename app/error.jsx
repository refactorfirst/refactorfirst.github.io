'use client';

import ErrorBoundaryView from '../components/error-boundary-view';

export default function GlobalError({ error, reset }) {
  return <ErrorBoundaryView error={error} reset={reset} />;
}
