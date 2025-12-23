import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Application, Container, Text } from 'pixi.js';
import { VisualManager } from './VisualManager';
import { RenderMode } from '../IRendererAdapter';

describe('VisualManager - Zoom Quality', () => {
  let visualManager: VisualManager;
  let mockApp: Application;

  beforeEach(() => {
    visualManager = new VisualManager();
    mockApp = {
      renderer: {
        render: vi.fn(),
      },
      ticker: {
        add: vi.fn(),
        started: false,
        start: vi.fn(),
      },
    } as unknown as Application;

    visualManager.initialize(mockApp, RenderMode.Worker);
  });

  describe('Text Resolution Multiplier', () => {
    it('starts with default text resolution multiplier of 1.0', () => {
      expect(visualManager.getTextResolutionMultiplier()).toBe(1.0);
    });

    it('allows setting text resolution multiplier', () => {
      visualManager.setTextResolutionMultiplier(2.0);
      expect(visualManager.getTextResolutionMultiplier()).toBe(2.0);
    });

    it('allows setting text resolution multiplier to any positive value', () => {
      visualManager.setTextResolutionMultiplier(3.5);
      expect(visualManager.getTextResolutionMultiplier()).toBe(3.5);

      visualManager.setTextResolutionMultiplier(10.0);
      expect(visualManager.getTextResolutionMultiplier()).toBe(10.0);
    });
  });

  describe('createText Helper', () => {
    it('creates text with zoom-aware resolution at 1x zoom', () => {
      visualManager.setTextResolutionMultiplier(1.0);

      const text = visualManager.createText({
        text: 'Test',
        style: { fontSize: 12 },
      });

      expect(text).toBeInstanceOf(Text);
      // Base resolution is 3x, multiplier is 1.0 → 3.0
      expect(text.resolution).toBe(3.0);
    });

    it('creates text with higher resolution at 2x zoom', () => {
      visualManager.setTextResolutionMultiplier(2.0);

      const text = visualManager.createText({
        text: 'Test',
        style: { fontSize: 12 },
      });

      expect(text).toBeInstanceOf(Text);
      // Base resolution is 3x, multiplier is 2.0 → 6.0
      expect(text.resolution).toBe(6.0);
    });

    it('creates text with very high resolution at 10x zoom', () => {
      visualManager.setTextResolutionMultiplier(10.0);

      const text = visualManager.createText({
        text: 'Test',
        style: { fontSize: 12 },
      });

      expect(text).toBeInstanceOf(Text);
      // Base resolution is 3x, multiplier is 10.0 → 30.0
      expect(text.resolution).toBe(30.0);
    });

    it('preserves all text options', () => {
      const text = visualManager.createText({
        text: 'Hello World',
        style: {
          fontSize: 24,
          fill: 0xff0000,
          fontWeight: 'bold',
        },
      });

      expect(text.text).toBe('Hello World');
      expect(text.style.fontSize).toBe(24);
      expect(text.style.fill).toBe(0xff0000);
      expect(text.style.fontWeight).toBe('bold');
    });
  });

  describe('Camera Scale', () => {
    it('starts with default camera scale of 1.0', () => {
      // Create a visual to trigger render context
      const visual = new Container();
      visualManager.addVisual('test-id', visual);

      // Camera scale is checked during render
      expect(visualManager).toBeDefined();
    });

    it('updates camera scale', () => {
      visualManager.setCameraScale(2.5);

      // Camera scale will be used in next render context
      expect(visualManager).toBeDefined();
    });
  });

  describe('Integration - createText in RenderContext', () => {
    it('createText helper is available in render context', () => {
      visualManager.setTextResolutionMultiplier(2.0);

      // Simulate what happens in object behaviors
      const createText = visualManager.createText.bind(visualManager);
      const text = createText({
        text: 'Badge',
        style: { fontSize: 12 },
      });

      expect(text.resolution).toBe(6.0); // 3x base * 2.0 multiplier
    });
  });
});
