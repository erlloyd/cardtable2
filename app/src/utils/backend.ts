/**
 * Get the backend WebSocket URL
 *
 * - In production: uses VITE_WS_URL env var
 * - In development: constructs from window.location.hostname:3001
 *
 * This ensures WebSocket connections always talk to the correct backend server,
 * whether running locally or deployed.
 */
export function getWSUrl(): string {
  const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;

  if (wsUrl) {
    // Production: use configured WebSocket URL
    return wsUrl;
  }

  // Development: construct from current hostname
  return `ws://${window.location.hostname}:3001`;
}

/**
 * Get the backend HTTP(S) base URL
 *
 * - In production: uses VITE_BE_URL env var
 * - In development: constructs from window.location.hostname:3001
 *
 * This ensures HTTP requests always talk to the correct backend server,
 * whether running locally or deployed.
 */
export function getBackendUrl(): string {
  const backendUrl = import.meta.env.VITE_BE_URL as string | undefined;

  if (backendUrl) {
    // Production: use configured backend URL
    return backendUrl;
  }

  // Development: construct from current hostname
  // Use http in dev (no SSL), https if page is HTTPS
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.hostname}:3001`;
}
