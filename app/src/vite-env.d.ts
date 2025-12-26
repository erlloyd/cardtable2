/// <reference types="vite/client" />

import type { YjsStore } from './store/YjsStore';

// Extend ImportMetaEnv for custom environment variables
interface ImportMetaEnv {
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Extend Window interface for test APIs (development only)
declare global {
  interface Window {
    __TEST_STORE__?: YjsStore;
    __TEST_BOARD__?: {
      waitForRenderer: () => Promise<void>;
      waitForSelectionSettled: () => Promise<void>;
    };
  }
}
