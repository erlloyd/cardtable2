export interface MultiSelectToggleProps {
  isMultiSelectMode: boolean;
  onToggle: () => void;
}

/**
 * Multi-select toggle button
 *
 * Toggles multi-select mode for touch devices.
 */
export function MultiSelectToggle({
  isMultiSelectMode,
  onToggle,
}: MultiSelectToggleProps) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <button
        onClick={onToggle}
        data-testid="multi-select-toggle"
        style={{
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 'bold',
          backgroundColor: isMultiSelectMode ? '#ef4444' : '#6b7280',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {isMultiSelectMode ? '✓ Multi-Select ON' : 'Multi-Select OFF'}
      </button>
      <span
        style={{
          marginLeft: '12px',
          fontSize: '12px',
          color: '#6b7280',
        }}
      >
        (Mobile: Tap to toggle selection)
      </span>
    </div>
  );
}
