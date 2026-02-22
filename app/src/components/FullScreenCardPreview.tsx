import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '@cardtable2/shared';

const IGNORE_GESTURES_MS = 300;

interface FullScreenCardPreviewProps {
  card: Card;
  onClose: () => void;
}

export function FullScreenCardPreview({
  card,
  onClose,
}: FullScreenCardPreviewProps) {
  const openTimeRef = useRef(Date.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      data-testid="card-preview-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        const elapsed = Date.now() - openTimeRef.current;
        if (elapsed > IGNORE_GESTURES_MS && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <img
        src={card.face}
        alt="Card preview"
        style={{
          maxWidth: 'clamp(280px, 60vw, 450px)',
          maxHeight: 'clamp(392px, 60vh, 630px)',
          borderRadius: '8px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      />
    </div>,
    document.body,
  );
}
