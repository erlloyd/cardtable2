import { useEffect, useState } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import { RenderMode } from '../renderer/IRendererAdapter';
import { createRenderer } from '../renderer/RendererFactory';

export interface UseRendererResult {
  renderer: IRendererAdapter;
  renderMode: RenderMode;
}

function resolveAndCreate(mode: RenderMode | 'auto'): IRendererAdapter {
  // Check for renderMode query parameter to force a specific mode
  const params = new URLSearchParams(window.location.search);
  const renderModeParam = params.get('renderMode');
  let resolvedMode: RenderMode | 'auto' = mode;

  // Query param overrides the prop
  if (renderModeParam === 'worker') {
    resolvedMode = RenderMode.Worker;
    console.log(`[useRenderer] Forcing render mode: ${resolvedMode}`);
  } else if (renderModeParam === 'main-thread') {
    resolvedMode = RenderMode.MainThread;
    console.log(`[useRenderer] Forcing render mode: ${resolvedMode}`);
  } else {
    console.log('[useRenderer] Using auto-detected render mode');
  }

  const renderer = createRenderer(resolvedMode);

  const actualMode = renderer.mode;
  console.log(`[useRenderer] ========================================`);
  console.log(`[useRenderer] RENDER MODE: ${actualMode}`);
  console.log(
    `[useRenderer] Worker will ${actualMode === RenderMode.Worker ? 'BE' : 'NOT be'} used`,
  );
  console.log(
    `[useRenderer] OffscreenCanvas will ${actualMode === RenderMode.Worker ? 'BE' : 'NOT be'} used`,
  );
  console.log(`[useRenderer] ========================================`);

  return renderer;
}

/**
 * Hook for managing renderer lifecycle
 *
 * Creates the adapter (side-effect-free) on first render and connects it in an
 * effect; the effect cleanup disconnects it.
 * Ready state and canvas initialization are managed by Board component's message handler.
 *
 * @param mode - Render mode: 'auto', RenderMode.Worker, or RenderMode.MainThread
 * @returns Renderer instance and mode
 */
export function useRenderer(
  mode: RenderMode | 'auto' = 'auto',
): UseRendererResult {
  const [renderer] = useState(() => resolveAndCreate(mode));

  useEffect(() => {
    renderer.connect();
    return () => {
      console.log('[useRenderer] Cleaning up renderer');
      renderer.disconnect();
    };
  }, [renderer]);

  return { renderer, renderMode: renderer.mode };
}
