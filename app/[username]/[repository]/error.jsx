'use client';

import ErrorBoundaryView from '../../../components/error-boundary-view';

export default function RepositoryError({ error, reset }) {
  return <ErrorBoundaryView error={error} reset={reset} />;
}
