import { useEffect, useRef, useState } from 'react';

/**
 * Diagnostic page to test OffscreenCanvas + WebGL without PixiJS.
 * This helps isolate whether the crash is OffscreenCanvas itself or PixiJS configuration.
 */
function DiagnosticTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [results, setResults] = useState<string[]>([]);
  const [testComplete, setTestComplete] = useState(false);

  const addResult = (message: string) => {
    console.log(`[Diagnostic] ${message}`);
    setResults((prev) => [...prev, message]);
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    addResult('Starting diagnostic tests...');
    addResult(`User Agent: ${navigator.userAgent}`);

    // Test 1: Check OffscreenCanvas availability
    addResult('---');
    addResult('Test 1: OffscreenCanvas availability');
    if (typeof OffscreenCanvas === 'undefined') {
      addResult('✗ OffscreenCanvas is NOT available');
    } else {
      addResult('✓ OffscreenCanvas is available');
    }

    // Test 2: Check transferControlToOffscreen availability
    addResult('---');
    addResult('Test 2: transferControlToOffscreen method');
    if (
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen ===
      'undefined'
    ) {
      addResult('✗ transferControlToOffscreen is NOT available');
    } else {
      addResult('✓ transferControlToOffscreen is available');
    }

    // Test 3: Try creating OffscreenCanvas directly
    addResult('---');
    addResult('Test 3: Create OffscreenCanvas directly');
    try {
      const offscreen = new OffscreenCanvas(300, 200);
      addResult('✓ OffscreenCanvas created successfully');

      // Test 3a: Try WebGL context
      const gl = offscreen.getContext('webgl');
      if (gl) {
        addResult('✓ WebGL context obtained');
        addResult(`  - Vendor: ${gl.getParameter(gl.VENDOR)}`);
        addResult(`  - Renderer: ${gl.getParameter(gl.RENDERER)}`);
        addResult(`  - Version: ${gl.getParameter(gl.VERSION)}`);

        // Try a simple WebGL operation
        try {
          gl.clearColor(1.0, 0.0, 0.0, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          addResult('✓ WebGL clear operation succeeded');
        } catch (error) {
          addResult(
            `✗ WebGL clear failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        addResult('✗ Failed to get WebGL context');
      }
    } catch (error) {
      addResult(
        `✗ Failed to create OffscreenCanvas: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Test 4: Try transferring canvas to OffscreenCanvas and rendering
    addResult('---');
    addResult('Test 4: Transfer canvas to OffscreenCanvas and render');
    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        addResult('✗ Canvas ref is null');
      } else {
        const offscreen = canvas.transferControlToOffscreen();
        addResult('✓ Canvas transferred successfully');

        // Try getting WebGL context from transferred canvas
        const gl = offscreen.getContext('webgl');
        if (gl) {
          addResult('✓ WebGL context obtained from transferred canvas');

          // Try rendering with WebGL
          try {
            // Clear to a blue background
            gl.clearColor(0.2, 0.3, 0.8, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            addResult('✓ WebGL clear (blue background) succeeded');

            // Try drawing a simple triangle
            const vertexShaderSource = `
              attribute vec2 position;
              void main() {
                gl_Position = vec4(position, 0.0, 1.0);
              }
            `;

            const fragmentShaderSource = `
              precision mediump float;
              void main() {
                gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0); // Orange
              }
            `;

            // Create shaders
            const vertexShader = gl.createShader(gl.VERTEX_SHADER);
            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

            if (vertexShader && fragmentShader) {
              gl.shaderSource(vertexShader, vertexShaderSource);
              gl.compileShader(vertexShader);

              gl.shaderSource(fragmentShader, fragmentShaderSource);
              gl.compileShader(fragmentShader);

              // Create program
              const program = gl.createProgram();
              if (program) {
                gl.attachShader(program, vertexShader);
                gl.attachShader(program, fragmentShader);
                gl.linkProgram(program);
                gl.useProgram(program);

                // Create triangle vertices
                const vertices = new Float32Array([
                  0.0,
                  0.6, // Top
                  -0.5,
                  -0.6, // Bottom left
                  0.5,
                  -0.6, // Bottom right
                ]);

                const buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

                const positionLocation = gl.getAttribLocation(
                  program,
                  'position',
                );
                gl.enableVertexAttribArray(positionLocation);
                gl.vertexAttribPointer(
                  positionLocation,
                  2,
                  gl.FLOAT,
                  false,
                  0,
                  0,
                );

                // Draw the triangle
                gl.drawArrays(gl.TRIANGLES, 0, 3);

                addResult('✓ WebGL triangle rendered successfully');
                addResult(
                  '  You should see an orange triangle on blue background',
                );
              } else {
                addResult('✗ Failed to create WebGL program');
              }
            } else {
              addResult('✗ Failed to create WebGL shaders');
            }
          } catch (error) {
            addResult(
              `✗ WebGL rendering failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          addResult('✗ Failed to get WebGL context from transferred canvas');
          addResult('  Trying 2D context instead...');

          // Try 2D context as fallback
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            addResult('✓ 2D context obtained from transferred canvas');
            try {
              // Draw a simple scene with 2D context
              ctx.fillStyle = '#2196F3';
              ctx.fillRect(0, 0, 300, 200);

              ctx.fillStyle = '#FF9800';
              ctx.beginPath();
              ctx.arc(150, 100, 50, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#4CAF50';
              ctx.fillRect(100, 150, 100, 30);

              addResult('✓ 2D rendering succeeded');
              addResult(
                '  You should see a blue background with orange circle and green rectangle',
              );
            } catch (error) {
              addResult(
                `✗ 2D rendering failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          } else {
            addResult('✗ Failed to get any context from transferred canvas');
          }
        }
      }
    } catch (error) {
      addResult(
        `✗ Canvas transfer failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    addResult('---');
    addResult('All tests complete!');
    setTestComplete(true);
  }, []);

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'monospace',
        backgroundColor: '#ffffff',
      }}
    >
      <h1 style={{ color: '#000000' }}>
        OffscreenCanvas + WebGL Diagnostic Test
      </h1>
      <p style={{ color: '#000000', fontSize: '16px' }}>
        This page tests OffscreenCanvas and WebGL support without using PixiJS.
      </p>
      <p style={{ color: '#000000', fontSize: '16px' }}>
        Use this to determine if the iOS crash is caused by OffscreenCanvas
        itself or by PixiJS configuration.
      </p>

      <canvas
        ref={canvasRef}
        width={300}
        height={200}
        style={{
          border: '2px solid #000000',
          display: 'block',
          margin: '20px 0',
        }}
      />

      <div
        style={{
          backgroundColor: testComplete ? '#4caf50' : '#ff9800',
          color: '#ffffff',
          padding: '15px',
          marginTop: '20px',
          borderRadius: '4px',
          fontSize: '18px',
          fontWeight: 'bold',
        }}
      >
        {testComplete ? '✓ Tests Complete' : '⏳ Running tests...'}
      </div>

      <pre
        style={{
          backgroundColor: '#1e1e1e',
          color: '#ffffff',
          padding: '20px',
          marginTop: '20px',
          overflow: 'auto',
          maxHeight: '500px',
          fontSize: '14px',
          lineHeight: '1.6',
          borderRadius: '4px',
          border: '2px solid #000000',
        }}
      >
        {results.join('\n')}
      </pre>

      <div style={{ marginTop: '20px' }}>
        <a
          href="/"
          style={{ color: '#0066cc', fontSize: '18px', fontWeight: 'bold' }}
        >
          ← Back to home
        </a>
      </div>
    </div>
  );
}

export default DiagnosticTest;
