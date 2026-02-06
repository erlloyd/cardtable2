import { Fragment, useEffect } from 'react';
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import useImage from 'use-image';
import type { Card, GameAssets } from '@cardtable2/shared';
import { getCardOrientation } from '../content/utils';
import {
  getPreviewDimensions,
  getLandscapeDimensions,
  DEFAULT_ROTATION_ENABLED,
  type PreviewDimensions,
} from '../constants/previewSizes';

export interface CardPreviewProps {
  /** Card data to preview */
  card: Card | null;
  /** Game assets for orientation lookup */
  gameAssets: GameAssets | null;
  /** Display mode: hover (positioned) or modal (centered) */
  mode: 'hover' | 'modal';
  /** Position for hover mode (ignored in modal mode) */
  position?: { x: number; y: number };
  /** Preview size preset or 'custom' */
  size?: string;
  /** Custom dimensions when size is 'custom' */
  customDimensions?: PreviewDimensions;
  /** Whether to rotate landscape cards 90 degrees */
  rotationEnabled?: boolean;
  /** Close handler */
  onClose: () => void;
}

/**
 * CardPreview - Display card image in larger size
 *
 * Supports two modes:
 * - hover: Positioned near cursor (desktop)
 * - modal: Centered with backdrop (mobile)
 *
 * Automatically rotates landscape cards when rotationEnabled is true.
 */
export function CardPreview({
  card,
  gameAssets,
  mode,
  position = { x: 0, y: 0 },
  size = 'medium',
  customDimensions,
  rotationEnabled = DEFAULT_ROTATION_ENABLED,
  onClose,
}: CardPreviewProps) {
  const isOpen = card !== null && gameAssets !== null;

  // Image URL (always show face for preview)
  const imageUrl = card?.face ?? '';

  // Load image with hook (must be called unconditionally)
  const [image, status] = useImage(imageUrl);

  // Close on ESC key (hover mode only - modal mode handled by Dialog)
  useEffect(() => {
    if (!isOpen || mode === 'modal') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, mode, onClose]);

  // Early return for hover mode (before null checks, like the red box that worked)
  if (card && gameAssets && mode === 'hover') {
    // Get desired orientation from metadata
    const desiredOrientation = getCardOrientation(card, gameAssets);
    const wantLandscape = desiredOrientation === 'landscape';

    // Check if rotation is needed (rotate when image doesn't match metadata)
    let needsRotation = false;
    if (rotationEnabled && image) {
      const imageIsLandscape = image.width > image.height;
      needsRotation = wantLandscape !== imageIsLandscape;
    }

    // Use metadata-based dimensions (landscape metadata = landscape preview)
    let dimensions = getPreviewDimensions(size, customDimensions);
    if (wantLandscape) {
      dimensions = getLandscapeDimensions(dimensions);
    }

    // Rotation transform
    const rotationTransform = needsRotation ? 'rotate(90deg)' : 'none';

    return (
      <div
        className="card-preview-container"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        <div className="card-preview-wrapper">
          {/* Gray box base (shows while loading or on error) */}
          <div
            className="card-preview-box"
            style={{
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
            }}
          >
            {status === 'loading' && 'Loading...'}
            {status === 'failed' && 'Failed to load'}
          </div>

          {/* Card image overlays gray box when loaded */}
          {status === 'loaded' && image && (
            <img
              src={imageUrl}
              alt="Card preview"
              style={{
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                transform: rotationTransform,
                transformOrigin: 'center center',
                position: 'absolute',
                top: 0,
                left: 0,
                borderRadius: '8px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (!card || !gameAssets) {
    return null;
  }

  // Get desired orientation from metadata
  const desiredOrientation = getCardOrientation(card, gameAssets);
  const wantLandscape = desiredOrientation === 'landscape';

  // Check if rotation is needed (rotate when image doesn't match metadata)
  let needsRotation = false;
  if (rotationEnabled && image) {
    const imageIsLandscape = image.width > image.height;
    needsRotation = wantLandscape !== imageIsLandscape;
  }

  // Use metadata-based dimensions (landscape metadata = landscape preview)
  let dimensions = getPreviewDimensions(size, customDimensions);
  if (wantLandscape) {
    dimensions = getLandscapeDimensions(dimensions);
  }

  // Rotation transform
  const rotationTransform = needsRotation ? 'rotate(90deg)' : 'none';

  if (mode === 'modal') {
    return (
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          {/* Backdrop */}
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/80" aria-hidden="true" />
          </TransitionChild>

          {/* Full-screen container to center the preview */}
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="relative">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
                  aria-label="Close preview"
                >
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>

                <div className="relative">
                  {/* Gray background box (always visible) */}
                  <div
                    className="rounded-lg shadow-2xl"
                    style={{
                      width: `${dimensions.width}px`,
                      height: `${dimensions.height}px`,
                      maxWidth: '90vw',
                      maxHeight: '90vh',
                      backgroundColor: '#4a5568',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '16px',
                    }}
                  >
                    {status === 'loading' && 'Loading...'}
                    {status === 'failed' && 'Failed to load'}
                  </div>

                  {/* Card image (overlays gray box when loaded) */}
                  {status === 'loaded' && image && (
                    <img
                      src={imageUrl}
                      alt="Card preview"
                      className="rounded-lg shadow-2xl"
                      style={{
                        width: `${dimensions.width}px`,
                        height: `${dimensions.height}px`,
                        transform: rotationTransform,
                        transformOrigin: 'center center',
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        objectFit: 'contain',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}
                    />
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    );
  }

  // Should never reach here (hover mode returns early, modal mode returns above)
  return null;
}
