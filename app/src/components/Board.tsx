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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasTransferredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);

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

          case 'initialized':
            setIsCanvasInitialized(true);
            setMessages((prev) => [...prev, 'Canvas initialized']);
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
      canvasTransferredRef.current = false;
    };
  }, []);

  // Initialize canvas and transfer to worker
  useEffect(() => {
    // Wait for worker to be ready
    if (!isWorkerReady || !canvasRef.current || !workerRef.current) {
      return;
    }

    // Prevent double transfer in React strict mode
    if (canvasTransferredRef.current) {
      return;
    }

    // Mark as transferred immediately to prevent race conditions
    canvasTransferredRef.current = true;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;

    try {
      // Transfer canvas to worker
      const offscreen = canvas.transferControlToOffscreen();

      const message: MainToWorkerMessage = {
        type: 'init',
        canvas: offscreen,
        width,
        height,
        dpr,
      };

      workerRef.current.postMessage(message, [offscreen]);
      setMessages((prev) => [...prev, 'Canvas transferred to worker']);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [...prev, `Canvas transfer error: ${errorMsg}`]);
      canvasTransferredRef.current = false; // Reset on error
    }
  }, [isWorkerReady]);

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
        Worker: {isWorkerReady ? 'Ready' : 'Initializing...'} | Canvas:{' '}
        {isCanvasInitialized ? 'Initialized' : 'Not initialized'}
      </div>

      <div
        ref={containerRef}
        style={{
          width: '800px',
          height: '600px',
          border: '1px solid #ccc',
          position: 'relative',
        }}
        data-testid="canvas-container"
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          data-testid="board-canvas"
        />
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
