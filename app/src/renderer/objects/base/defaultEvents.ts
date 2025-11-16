// Default event handlers used by most object types
// Individual types can override as needed

import type { EventHandlers } from '../types';

export const defaultEventHandlers: EventHandlers = {
  // Default hover: scale and shadow (implemented by RendererCore)
  // Default click: select (implemented by RendererCore)
  // Default drag: move (implemented by RendererCore)
  // No default drop behavior
  // No default double-click behavior
};
