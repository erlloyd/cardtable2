import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Application, Graphics, Assets, Sprite, type Texture } from 'pixi.js';

export const Route = createFileRoute('/pixitest')({
  component: PixiTest,
});

function PixiTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Prevent double initialization in React Strict Mode (same pattern as useCanvasLifecycle)
    if (initializedRef.current) {
      return;
    }

    // Mark as initialized immediately to prevent race conditions
    initializedRef.current = true;

    const canvas = canvasRef.current;

    void (async () => {
      console.log('[PixiTest] Creating Application...');
      const app = new Application();

      const dpr = window.devicePixelRatio || 1;

      console.log('[PixiTest] Initializing with config...');
      await app.init({
        canvas,
        width: 800,
        height: 600,
        resolution: dpr,
        autoDensity: true,
        backgroundColor: 0xcccccc,
        autoStart: false, // Prevent automatic ticker start
        preference: 'webgl',
      });

      appRef.current = app;
      console.log(
        '[PixiTest] Init complete, renderer type:',
        app.renderer.type,
      );

      // Card dimensions (matching stack system)
      const CARD_WIDTH = 63;
      const CARD_HEIGHT = 88;

      // Test 1: Blue rectangle background
      const bg1 = new Graphics();
      bg1.rect(50, 50, CARD_WIDTH, CARD_HEIGHT);
      bg1.fill(0x3b82f6);
      bg1.stroke({ width: 2, color: 0x1e40af });
      app.stage.addChild(bg1);

      // Test 2: Green background (will have image on top)
      const bg2 = new Graphics();
      bg2.rect(200, 50, CARD_WIDTH, CARD_HEIGHT);
      bg2.fill(0x10b981);
      bg2.stroke({ width: 2, color: 0x059669 });
      app.stage.addChild(bg2);

      // Render backgrounds first
      app.renderer.render(app.stage);
      console.log('[PixiTest] Backgrounds rendered');

      // Load card back image
      try {
        console.log('[PixiTest] Loading card back image...');
        const texture: Texture = await Assets.load(
          'https://card-table.app/images/standard/card_back_marvelchampions.png',
        );
        console.log(
          '[PixiTest] Image loaded:',
          texture.width,
          'x',
          texture.height,
        );

        // Test 3: Card back on green background
        const sprite1 = new Sprite(texture);
        sprite1.x = 200;
        sprite1.y = 50;
        sprite1.width = CARD_WIDTH;
        sprite1.height = CARD_HEIGHT;
        app.stage.addChild(sprite1);

        // Test 4: Card back alone
        const sprite2 = new Sprite(texture);
        sprite2.x = 350;
        sprite2.y = 50;
        sprite2.width = CARD_WIDTH;
        sprite2.height = CARD_HEIGHT;
        app.stage.addChild(sprite2);

        app.renderer.render(app.stage);
        console.log('[PixiTest] Card backs rendered');
      } catch (error) {
        console.error('[PixiTest] Failed to load card back:', error);
      }

      // Load Azure card face via backend proxy
      // Backend serves images from same origin, bypassing CORS restrictions
      // Aggressive caching (1 year + ETags) minimizes bandwidth usage
      try {
        console.log('[PixiTest] Loading Azure card face via backend proxy...');
        const texture: Texture = await Assets.load(
          'http://localhost:3001/api/card-image/cerebro-cards/official/01030.jpg',
        );
        console.log(
          '[PixiTest] Azure image loaded:',
          texture.width,
          'x',
          texture.height,
        );

        // Test 5: Red background for Azure card
        const bg3 = new Graphics();
        bg3.rect(50, 200, CARD_WIDTH, CARD_HEIGHT);
        bg3.fill(0xef4444);
        bg3.stroke({ width: 2, color: 0xb91c1c });
        app.stage.addChild(bg3);

        // Test 6: Azure card on red background
        const sprite3 = new Sprite(texture);
        sprite3.x = 50;
        sprite3.y = 200;
        sprite3.width = CARD_WIDTH;
        sprite3.height = CARD_HEIGHT;
        app.stage.addChild(sprite3);

        // Test 7: Azure card alone
        const sprite4 = new Sprite(texture);
        sprite4.x = 200;
        sprite4.y = 200;
        sprite4.width = CARD_WIDTH;
        sprite4.height = CARD_HEIGHT;
        app.stage.addChild(sprite4);

        app.renderer.render(app.stage);
        console.log('[PixiTest] Azure cards rendered');
      } catch (error) {
        console.error('[PixiTest] Failed to load Azure card:', error);
      }

      console.log('[PixiTest] All rendering complete');
    })();

    return () => {
      console.log('[PixiTest] Cleanup');
      if (appRef.current) {
        appRef.current.destroy(false, true);
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>PixiJS Card Image Test</h1>
      <p>Testing card image loading (63x88 pixels each):</p>
      <p>
        <strong>Top row:</strong>
      </p>
      <ul>
        <li>Blue rectangle only</li>
        <li>Green rectangle + card back overlay (card-table.app)</li>
        <li>Card back alone</li>
      </ul>
      <p>
        <strong>Bottom row:</strong>
      </p>
      <ul>
        <li>Red rectangle + card face overlay (Azure Blob Storage)</li>
        <li>Card face alone</li>
      </ul>
      <canvas ref={canvasRef} style={{ border: '1px solid black' }} />
    </div>
  );
}
