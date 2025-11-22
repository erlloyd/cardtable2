import '@testing-library/jest-dom';

// Extend ResizeObserver constructor type to include lastCallback
interface MockResizeObserverConstructor {
  new (callback: ResizeObserverCallback): ResizeObserver;
  lastCallback?: ResizeObserverCallback;
}

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    // Store last callback for test access
    (
      global.ResizeObserver as unknown as MockResizeObserverConstructor
    ).lastCallback = callback;
  }

  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
  disconnect() {
    // Mock implementation
  }
} as unknown as MockResizeObserverConstructor;
