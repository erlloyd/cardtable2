import { describe, it, expect, beforeEach } from 'vitest';
import { Application, Container } from 'pixi.js';
import { VisualManager } from './VisualManager';
import { RenderMode } from '../IRendererAdapter';

describe('VisualManager - Hide/Show Objects', () => {
  let visualManager: VisualManager;
  let app: Application;

  beforeEach(() => {
    visualManager = new VisualManager();
    app = new Application();
    visualManager.initialize(app, RenderMode.Worker);
  });

  describe('hideObject', () => {
    it('should mark object as hidden', () => {
      const objectId = 'test-stack-1';

      visualManager.hideObject(objectId);

      expect(visualManager.isHidden(objectId)).toBe(true);
    });

    it('should set visual alpha to 0 if visual exists', () => {
      const objectId = 'test-stack-1';
      const mockVisual = new Container();
      mockVisual.alpha = 1;

      // Manually add visual to internal map (simulating addObjectVisual)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (visualManager as any).objectVisuals.set(objectId, mockVisual);

      visualManager.hideObject(objectId);

      expect(mockVisual.alpha).toBe(0);
    });

    it('should not throw if visual does not exist', () => {
      const objectId = 'nonexistent';

      expect(() => visualManager.hideObject(objectId)).not.toThrow();
      expect(visualManager.isHidden(objectId)).toBe(true);
    });

    it('should handle multiple hide calls for same object', () => {
      const objectId = 'test-stack-1';

      visualManager.hideObject(objectId);
      visualManager.hideObject(objectId); // Second call

      expect(visualManager.isHidden(objectId)).toBe(true);
    });
  });

  describe('showObject', () => {
    it('should mark object as not hidden', () => {
      const objectId = 'test-stack-1';

      visualManager.hideObject(objectId);
      visualManager.showObject(objectId);

      expect(visualManager.isHidden(objectId)).toBe(false);
    });

    it('should set visual alpha to 1 if visual exists', () => {
      const objectId = 'test-stack-1';
      const mockVisual = new Container();
      mockVisual.alpha = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (visualManager as any).objectVisuals.set(objectId, mockVisual);
      visualManager.hideObject(objectId);

      visualManager.showObject(objectId);

      expect(mockVisual.alpha).toBe(1);
    });

    it('should not throw if visual does not exist', () => {
      const objectId = 'nonexistent';

      expect(() => visualManager.showObject(objectId)).not.toThrow();
    });

    it('should handle show without prior hide', () => {
      const objectId = 'test-stack-1';

      visualManager.showObject(objectId);

      expect(visualManager.isHidden(objectId)).toBe(false);
    });
  });

  describe('isHidden', () => {
    it('should return false for objects that were never hidden', () => {
      const objectId = 'test-stack-1';

      expect(visualManager.isHidden(objectId)).toBe(false);
    });

    it('should return true for hidden objects', () => {
      const objectId = 'test-stack-1';

      visualManager.hideObject(objectId);

      expect(visualManager.isHidden(objectId)).toBe(true);
    });

    it('should return false after object is shown', () => {
      const objectId = 'test-stack-1';

      visualManager.hideObject(objectId);
      visualManager.showObject(objectId);

      expect(visualManager.isHidden(objectId)).toBe(false);
    });
  });

  describe('Integration with redrawVisual', () => {
    it('should preserve hidden state after redraw', () => {
      const objectId = 'test-stack-1';
      const mockVisual = new Container();
      mockVisual.alpha = 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (visualManager as any).objectVisuals.set(objectId, mockVisual);
      visualManager.hideObject(objectId);

      // Simulate redraw setting alpha back to 1
      mockVisual.alpha = 1;

      // redrawVisual would check isHidden and set alpha to 0
      // We're testing that the hidden state persists
      expect(visualManager.isHidden(objectId)).toBe(true);
    });
  });

  describe('Multiple objects', () => {
    it('should track hidden state independently for each object', () => {
      const obj1 = 'stack-1';
      const obj2 = 'stack-2';
      const obj3 = 'stack-3';

      visualManager.hideObject(obj1);
      visualManager.hideObject(obj3);

      expect(visualManager.isHidden(obj1)).toBe(true);
      expect(visualManager.isHidden(obj2)).toBe(false);
      expect(visualManager.isHidden(obj3)).toBe(true);
    });

    it('should handle hiding multiple objects during remote drag', () => {
      const primaryId = 'stack-1';
      const secondaryIds = ['stack-2', 'stack-3', 'stack-4'];

      visualManager.hideObject(primaryId);
      secondaryIds.forEach((id) => visualManager.hideObject(id));

      expect(visualManager.isHidden(primaryId)).toBe(true);
      secondaryIds.forEach((id) => {
        expect(visualManager.isHidden(id)).toBe(true);
      });
    });

    it('should handle showing multiple objects when drag ends', () => {
      const draggedIds = ['stack-1', 'stack-2', 'stack-3'];

      draggedIds.forEach((id) => visualManager.hideObject(id));
      draggedIds.forEach((id) => visualManager.showObject(id));

      draggedIds.forEach((id) => {
        expect(visualManager.isHidden(id)).toBe(false);
      });
    });
  });
});
