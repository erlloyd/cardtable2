import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { installCtTest } from './dev/ctTest';
import { installCtDevTools } from './dev/ctDevTools';
import { installDbg } from './dev/dbg';
import './index.css';

// Install dev-only helpers (no-op in production builds).
installCtTest();
installCtDevTools();
installDbg();

// Create the router instance
const router = createRouter({ routeTree });

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
