export interface InteractionModeToggleProps {
  interactionMode: 'pan' | 'select';
  onToggle: () => void;
}

/**
 * Interaction mode toggle button
 *
 * Toggles between pan and select mode.
 */
export function InteractionModeToggle({
  interactionMode,
  onToggle,
}: InteractionModeToggleProps) {
  return (
    <div style={{ marginTop: '12px', marginBottom: '8px' }}>
      <button
        onClick={onToggle}
        data-testid="interaction-mode-toggle"
        style={{
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 'bold',
          backgroundColor: interactionMode === 'select' ? '#3b82f6' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {interactionMode === 'pan' ? '🖐️ Pan Mode' : '⬚ Select Mode'}
      </button>
      <span
        style={{
          marginLeft: '12px',
          fontSize: '12px',
          color: '#6b7280',
        }}
      >
        (Hold Cmd/Ctrl to invert)
      </span>
    </div>
  );
}
