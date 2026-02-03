import { Fragment, useEffect } from 'react';
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react';
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

  if (!card || !gameAssets) {
    return null;
  }

  // Determine orientation
  const orientation = getCardOrientation(card, gameAssets);
  const isLandscape = orientation === 'landscape';

  // Get dimensions
  let dimensions = getPreviewDimensions(size, customDimensions);
  if (isLandscape) {
    dimensions = getLandscapeDimensions(dimensions);
  }

  // Image URL (always show face for preview)
  const imageUrl = card.face;

  // Rotation transform
  const rotationTransform =
    isLandscape && rotationEnabled ? 'rotate(90deg)' : 'none';

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

                {/* Card image */}
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
                  }}
                />
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    );
  }

  // Hover mode: positioned absolute
  return isOpen ? (
    <div
      className="fixed z-40 pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="relative pointer-events-auto">
        {/* Card image */}
        <img
          src={imageUrl}
          alt="Card preview"
          className="rounded-lg shadow-2xl border-2 border-white/20"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            transform: rotationTransform,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  ) : null;
}
