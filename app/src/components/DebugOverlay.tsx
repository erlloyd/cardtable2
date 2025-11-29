/**
 * DebugOverlay Component
 *
 * Temporary component for validating world-to-DOM coordinate conversion.
 * Renders a red rectangle that should perfectly overlay the selected canvas object.
 *
 * Purpose: Verify that PixiJS toGlobal() + devicePixelRatio conversion produces
 * correct DOM coordinates before integrating with ActionHandle.
 */

export interface DebugOverlayProps {
  screenCoords: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
}

export function DebugOverlay({ screenCoords }: DebugOverlayProps) {
  // Only show for the first object
  if (!screenCoords || screenCoords.length === 0) {
    return null;
  }

  const coord = screenCoords[0];

  return (
    <div
      style={{
        position: 'fixed',
        left: `${coord.x}px`,
        top: `${coord.y}px`,
        width: `${coord.width}px`,
        height: `${coord.height}px`,
        transform: 'translate(-50%, -50%)',
        border: '4px solid lime',
        backgroundColor: 'rgba(0, 255, 0, 0.2)',
        pointerEvents: 'none', // Don't intercept clicks
        zIndex: 9999,
      }}
      data-testid="debug-overlay"
    />
  );
}
