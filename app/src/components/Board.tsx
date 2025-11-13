import { useEffect, useRef, useState } from 'react';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '@cardtable2/shared';

interface BoardProps {
  tableId: string;
}

function Board({ tableId }: BoardProps) {
  const workerRef = useRef<Worker | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);

  // Initialize worker on mount
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (workerRef.current) {
      return;
    }

    // Create worker
    const worker = new Worker(new URL('../board.worker.ts', import.meta.url), {
      type: 'module',
    });

    // Store worker reference
    workerRef.current = worker;

    // Handle messages from worker
    worker.addEventListener(
      'message',
      (event: MessageEvent<WorkerToMainMessage>) => {
        const message = event.data;

        switch (message.type) {
          case 'ready':
            setIsWorkerReady(true);
            setMessages((prev) => [...prev, 'Worker is ready']);
            break;

          case 'pong':
            setMessages((prev) => [...prev, `Worker: ${message.data}`]);
            break;

          case 'echo-response':
            setMessages((prev) => [...prev, `Echo: ${message.data}`]);
            break;

          case 'error':
            setMessages((prev) => [...prev, `Error: ${message.error}`]);
            break;
        }
      },
    );

    // Handle worker errors
    worker.addEventListener('error', (error) => {
      setMessages((prev) => [...prev, `Worker error: ${error.message}`]);
    });

    // Cleanup on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Send ping message to worker
  const handlePing = () => {
    if (!workerRef.current) return;

    const message: MainToWorkerMessage = {
      type: 'ping',
      data: `Hello from table ${tableId}`,
    };
    workerRef.current.postMessage(message);
  };

  // Send echo message to worker
  const handleEcho = () => {
    if (!workerRef.current) return;

    const message: MainToWorkerMessage = {
      type: 'echo',
      data: `Echo test at ${new Date().toLocaleTimeString()}`,
    };
    workerRef.current.postMessage(message);
  };

  return (
    <div className="board" data-testid="board">
      <h2>Board: {tableId}</h2>

      <div className="worker-status" data-testid="worker-status">
        Status: {isWorkerReady ? 'Ready' : 'Initializing...'}
      </div>

      <div className="controls">
        <button
          onClick={handlePing}
          disabled={!isWorkerReady}
          data-testid="ping-button"
        >
          Send Ping
        </button>
        <button
          onClick={handleEcho}
          disabled={!isWorkerReady}
          data-testid="echo-button"
        >
          Send Echo
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
    </div>
  );
}

export default Board;
