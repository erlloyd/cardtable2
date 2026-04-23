/// <reference types="vite/client" />

import type { YjsStore } from './store/YjsStore';
import type { CtTestApi } from './dev/ctTest';

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
      checkAnimationState: (
        visualId?: string,
        animationType?: string,
      ) => Promise<boolean>;
      waitForAnimationsComplete: (timeout?: number) => Promise<void>;
    };
    /**
     * Dev-only canvas interaction helpers for autonomous browser
     * verification via Playwright MCP.  See `app/src/dev/ctTest.ts`.
     */
    __ctTest?: CtTestApi;
  }
}
