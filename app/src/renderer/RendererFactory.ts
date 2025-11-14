import { RenderMode, type IRendererAdapter } from './IRendererAdapter';
import { WorkerRendererAdapter } from './WorkerRendererAdapter';
import { MainThreadRendererAdapter } from './MainThreadRendererAdapter';

// Re-export RenderMode for convenience
export { RenderMode };

/**
 * Rendering mode selection parameter.
 * 'auto' means detect automatically based on capabilities.
 */
export type RenderModeParam = RenderMode | 'auto';

/**
 * Renderer capabilities and platform information.
 */
export interface RendererCapabilities {
  hasOffscreenCanvas: boolean;
  hasWebGL: boolean;
  isIOS: boolean;
  iOSVersion: number | null;
  recommendedMode: RenderMode;
}

/**
 * Detect renderer capabilities.
 */
export function detectCapabilities(): RendererCapabilities {
  // Check for OffscreenCanvas support
  const hasOffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen ===
      'function';

  // Check for WebGL support
  let hasWebGL = false;
  try {
    const canvas = document.createElement('canvas');
    hasWebGL = !!canvas.getContext('webgl') || !!canvas.getContext('webgl2');
  } catch {
    // In test environments without canvas support, assume WebGL is unavailable
    hasWebGL = false;
  }

  // Detect iOS and version (including iPadOS masquerading as Mac)
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let iOSVersion: number | null = null;

  if (isIOS) {
    const match = navigator.userAgent.match(/OS (\d+)_/);
    if (match) {
      iOSVersion = parseInt(match[1], 10);
    }
  }

  // Determine recommended mode
  let recommendedMode: RenderMode = RenderMode.MainThread;

  if (hasOffscreenCanvas && hasWebGL) {
    // IMPORTANT: PixiJS ticker crashes in Web Workers on iOS Safari (all versions)
    // Even temporary ticker usage for animations causes tab crashes
    // Force main-thread mode for all iOS devices
    if (isIOS) {
      recommendedMode = RenderMode.MainThread;
    } else {
      recommendedMode = RenderMode.Worker;
    }
  }

  return {
    hasOffscreenCanvas,
    hasWebGL,
    isIOS,
    iOSVersion,
    recommendedMode,
  };
}

/**
 * Create a renderer adapter based on mode preference and capabilities.
 *
 * @param mode - Desired render mode ('auto' uses capability detection)
 * @returns Renderer adapter instance
 */
export function createRenderer(
  mode: RenderModeParam = 'auto',
): IRendererAdapter {
  let actualMode: RenderMode;

  if (mode === 'auto') {
    const capabilities = detectCapabilities();
    actualMode = capabilities.recommendedMode;
  } else {
    actualMode = mode;
  }

  switch (actualMode) {
    case RenderMode.Worker:
      return new WorkerRendererAdapter();
    case RenderMode.MainThread:
      return new MainThreadRendererAdapter();
    default:
      // Fallback to main-thread for unknown modes
      return new MainThreadRendererAdapter();
  }
}
