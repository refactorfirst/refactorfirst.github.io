import Landing from '../components/landing';
import { loadListedRepositories } from '../lib/repositories.js';

export default function HomePage() {
  return <Landing repositories={loadListedRepositories()} />;
}
