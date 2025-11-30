import type { RenderMode } from '../../../renderer/IRendererAdapter';

export interface DebugPanelProps {
  tableId: string;
  renderMode: RenderMode | null;
  isWorkerReady: boolean;
  isCanvasInitialized: boolean;
  connectionStatus: string;
  awarenessHz: number;
  messages: string[];
  onPing: () => void;
  onEcho: () => void;
  onAnimation: () => void;
}

/**
 * Debug panel component
 *
 * Displays debug information and provides debug action buttons.
 * Only shown when showDebugUI is true.
 */
export function DebugPanel({
  tableId,
  renderMode,
  isWorkerReady,
  isCanvasInitialized,
  connectionStatus,
  awarenessHz,
  messages,
  onPing,
  onEcho,
  onAnimation,
}: DebugPanelProps) {
  return (
    <>
      <div
        style={{
          fontSize: '14px',
          fontWeight: 'bold',
          padding: '4px 0',
          marginBottom: '4px',
        }}
      >
        Board: {tableId}
      </div>

      <div
        className="worker-status"
        data-testid="worker-status"
        style={{ fontSize: '12px', marginBottom: '8px' }}
      >
        Mode: {renderMode} | Worker:{' '}
        {isWorkerReady ? 'Ready' : 'Initializing...'} | Canvas:{' '}
        {isCanvasInitialized ? 'Initialized' : 'Not initialized'} | WS:{' '}
        {connectionStatus} | Awareness: {awarenessHz} Hz
      </div>

      <div className="controls">
        <button
          onClick={onPing}
          disabled={!isWorkerReady}
          data-testid="ping-button"
        >
          Send Ping
        </button>
        <button
          onClick={onEcho}
          disabled={!isWorkerReady}
          data-testid="echo-button"
        >
          Send Echo
        </button>
        <button
          onClick={onAnimation}
          disabled={!isCanvasInitialized}
          data-testid="animation-button"
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            fontWeight: 'bold',
          }}
        >
          Test Animation (3s)
        </button>
      </div>

      <div className="messages" data-testid="messages">
        <h3>Messages:</h3>
        <ul>
          {messages.map((msg, index) => (
            <li key={index} data-testid={`message-${index}`}>
              {msg}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
