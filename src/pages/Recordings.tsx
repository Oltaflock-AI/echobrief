import { Navigate } from 'react-router-dom';

/** Preserve old bookmarks without making users navigate a retired page. */
export default function Recordings() {
  return <Navigate to="/dashboard" replace />;
}
