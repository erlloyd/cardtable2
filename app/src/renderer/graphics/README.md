# SVG Graphics

This directory contains manually-rendered SVG graphics for use in the renderer.

## Why Manual Rendering?

PixiJS's `.svg()` method requires the DOM (document object), which is not available in Web Workers. Since we render in workers for performance, we manually draw SVG paths using PixiJS Graphics API.

## Structure

Each SVG graphic lives in its own directory with two files:

```
graphics/
  myIcon/
    icon.svg         # Original SVG file (for reference)
    index.ts         # Implementation that exports render function
```

## Creating a New SVG Graphic

### 1. Create Directory Structure

```bash
mkdir app/src/renderer/graphics/myIcon
```

### 2. Add SVG File

Copy your original SVG file to `icon.svg` in the directory.

### 3. Implement Render Function

Create `index.ts` that exports a render function:

```typescript
import type { Graphics } from 'pixi.js';
import type { SvgGraphicOptions } from '../types';

/**
 * My Icon
 *
 * Description of what this icon represents.
 *
 * Source: icon.svg (WxH viewBox)
 * Original SVG paths:
 * - Path 1: [SVG path data]
 * - Path 2: [SVG path data]
 */
export function renderMyIcon(
  graphic: Graphics,
  options: SvgGraphicOptions,
): void {
  const { color, strokeWidth = 1.5, x = 0, y = 0 } = options;

  // Calculate offset to center icon (based on viewBox size)
  const offsetX = x - viewBoxWidth / 2;
  const offsetY = y - viewBoxHeight / 2;

  // Manually draw each SVG path
  // Track position for relative commands (lowercase in SVG)
  let px = startX;
  let py = startY;
  graphic.moveTo(px + offsetX, py + offsetY);
  // ... continue with path commands

  graphic.stroke({
    width: strokeWidth,
    color: color,
    cap: 'round', // Matches SVG stroke-linecap="round"
    join: 'round', // Matches SVG stroke-linejoin="round"
  });
}
```

### 4. Use in Code

```typescript
import { renderMyIcon } from '../../graphics/myIcon';

const graphic = new Graphics();
renderMyIcon(graphic, {
  color: 0xffffff,
  strokeWidth: 1.5,
  x: positionX,
  y: positionY,
});
container.addChild(graphic);
```

## SVG Path Translation Guide

### Understanding SVG Path Commands

- **M/m** = MoveTo (absolute/relative)
- **L/l** = LineTo (absolute/relative)
- **H/h** = Horizontal LineTo (absolute/relative)
- **V/v** = Vertical LineTo (absolute/relative)
- **Z/z** = Close Path

### Example Translation

SVG: `m4 6-2 1 6 3`

Code:

```typescript
let px = 4; // initial x from 'm4 6'
let py = 6; // initial y
graphic.moveTo(px + offsetX, py + offsetY);

px += -2; // relative move: '-2 1'
py += 1;
graphic.lineTo(px + offsetX, py + offsetY);

px += 6; // relative move: '6 3'
py += 3;
graphic.lineTo(px + offsetX, py + offsetY);
```

## Stroke Styles

Always include `cap: 'round'` and `join: 'round'` to match typical SVG styling:

```typescript
graphic.stroke({
  width: strokeWidth,
  color: color,
  cap: 'round',
  join: 'round',
});
```

## Existing Graphics

- **stackPop**: Stack/unstack icon with layers and upward arrow
