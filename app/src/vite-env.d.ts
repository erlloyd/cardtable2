/// <reference types="vite/client" />

import type { YjsStore } from './store/YjsStore';

// Extend Window interface for test APIs (development only)
declare global {
  interface Window {
    __TEST_STORE__?: YjsStore;
    __TEST_BOARD__?: {
      waitForRenderer: () => Promise<void>;
    };
  }
}
