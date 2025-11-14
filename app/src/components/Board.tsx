import { useEffect, useRef, useState } from 'react';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import {
  RenderMode,
  type IRendererAdapter,
} from '../renderer/IRendererAdapter';
import { createRenderer } from '../renderer/RendererFactory';

interface BoardProps {
  tableId: string;
}

function Board({ tableId }: BoardProps) {
  const rendererRef = useRef<IRendererAdapter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasTransferredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode | null>(null);

  // Initialize renderer on mount
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (rendererRef.current) {
      return;
    }

    // Check for renderMode query parameter to force a specific mode
    const params = new URLSearchParams(window.location.search);
    const renderModeParam = params.get('renderMode');
    let mode: RenderMode | 'auto' = 'auto';

    // Query param is a string, so compare against enum values
    if (renderModeParam === 'worker') {
      mode = RenderMode.Worker;
      console.log(`[Board] Forcing render mode: ${mode}`);
    } else if (renderModeParam === 'main-thread') {
      mode = RenderMode.MainThread;
      console.log(`[Board] Forcing render mode: ${mode}`);
    } else {
      console.log('[Board] Using auto-detected render mode');
    }

    // Create renderer adapter
    const renderer = createRenderer(mode);

    // Store renderer reference
    rendererRef.current = renderer;

    // Get the actual mode from the renderer
    const actualMode = renderer.mode;
    setRenderMode(actualMode);
    console.log(`[Board] ========================================`);
    console.log(`[Board] RENDER MODE: ${actualMode}`);
    console.log(
      `[Board] Worker will ${actualMode === RenderMode.Worker ? 'BE' : 'NOT be'} used`,
    );
    console.log(
      `[Board] OffscreenCanvas will ${actualMode === RenderMode.Worker ? 'BE' : 'NOT be'} used`,
    );
    console.log(`[Board] ========================================`);

    // Handle messages from renderer
    renderer.onMessage((message: RendererToMainMessage) => {
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

        case 'animation-complete':
          setMessages((prev) => [...prev, 'Animation completed!']);
          break;
      }
    });

    // Cleanup on unmount
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      canvasTransferredRef.current = false;
    };
  }, []);

  // Initialize canvas and transfer to renderer
  useEffect(() => {
    // Wait for renderer to be ready
    if (
      !isWorkerReady ||
      !canvasRef.current ||
      !rendererRef.current ||
      !renderMode
    ) {
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
      let canvasToSend: OffscreenCanvas | HTMLCanvasElement;

      if (renderMode === RenderMode.Worker) {
        // Worker mode: transfer to OffscreenCanvas
        console.log('[Board] Transferring canvas to OffscreenCanvas...');
        canvasToSend = canvas.transferControlToOffscreen();
        console.log('[Board] ✓ Canvas transferred successfully');
        setMessages((prev) => [...prev, 'Canvas transferred to worker']);
      } else {
        // Main-thread mode: use canvas directly
        console.log('[Board] Using canvas directly (NO OffscreenCanvas)');
        canvasToSend = canvas;
        console.log('[Board] ✓ Canvas ready for main-thread rendering');
        setMessages((prev) => [...prev, 'Canvas using main thread']);
      }

      const message: MainToRendererMessage = {
        type: 'init',
        canvas: canvasToSend,
        width,
        height,
        dpr,
      };

      console.log('[Board] Sending init message to renderer...');
      rendererRef.current.sendMessage(message);
      console.log('[Board] ✓ Init message sent');

      // Debug: Check canvas DOM size after init
      setTimeout(() => {
        console.log('[Board] Canvas element check:');
        console.log('[Board] - canvas.width (attribute):', canvas.width);
        console.log('[Board] - canvas.height (attribute):', canvas.height);
        console.log('[Board] - canvas.style.width:', canvas.style.width);
        console.log('[Board] - canvas.style.height:', canvas.style.height);
        console.log('[Board] - canvas.clientWidth:', canvas.clientWidth);
        console.log('[Board] - canvas.clientHeight:', canvas.clientHeight);
      }, 100);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Board] ✗ Canvas init error:', errorMsg);
      setMessages((prev) => [...prev, `Canvas init error: ${errorMsg}`]);
      canvasTransferredRef.current = false; // Reset on error
    }
  }, [isWorkerReady, renderMode]);

  // Send ping message to renderer
  const handlePing = () => {
    if (!rendererRef.current) return;

    const message: MainToRendererMessage = {
      type: 'ping',
      data: `Hello from table ${tableId}`,
    };
    rendererRef.current.sendMessage(message);
  };

  // Send echo message to renderer
  const handleEcho = () => {
    if (!rendererRef.current) return;

    const message: MainToRendererMessage = {
      type: 'echo',
      data: `Echo test at ${new Date().toLocaleTimeString()}`,
    };
    rendererRef.current.sendMessage(message);
  };

  // Trigger test animation (rotates circle for 2 seconds)
  const handleAnimation = () => {
    if (!rendererRef.current) return;

    const message: MainToRendererMessage = {
      type: 'test-animation',
    };
    rendererRef.current.sendMessage(message);
    setMessages((prev) => [...prev, 'Starting animation...']);
  };

  return (
    <div className="board" data-testid="board">
      <h2>Board: {tableId}</h2>

      <div className="worker-status" data-testid="worker-status">
        Mode: {renderMode} | Worker:{' '}
        {isWorkerReady ? 'Ready' : 'Initializing...'} | Canvas:{' '}
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
        <button
          onClick={handleAnimation}
          disabled={!isCanvasInitialized}
          data-testid="animation-button"
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            fontWeight: 'bold',
          }}
        >
          Test Animation (2s)
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
