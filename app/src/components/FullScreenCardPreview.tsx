import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Card, GameAssets } from '@cardtable2/shared';
import { resolveCardBackUrl } from '../content/loader';

const IGNORE_GESTURES_MS = 300;

interface FullScreenCardPreviewProps {
  card: Card;
  cardCode: string;
  faceUp: boolean;
  gameAssets: GameAssets;
  onClose: () => void;
}

/**
 * Decide which side of the card to show in the modal preview.
 *
 * Mirrors `CardPreview`'s rule: face-up shows the face; face-down with a
 * non-default back (`card.back` or a `back_code` partner) shows that back;
 * face-down with the generic `cardType.back` shows nothing — the user already
 * saw that exact image on the table when they double-tapped.
 */
function resolvePreviewImageUrl(
  card: Card,
  cardCode: string,
  faceUp: boolean,
  gameAssets: GameAssets,
): string | null {
  if (faceUp) {
    return card.face;
  }
  const cardType = gameAssets.cardTypes[card.type];
  if (!cardType) {
    return null;
  }
  const backUrl = resolveCardBackUrl(cardCode, card, cardType, gameAssets);
  if (!backUrl || backUrl === cardType.back) {
    return null;
  }
  return backUrl;
}

export function FullScreenCardPreview({
  card,
  cardCode,
  faceUp,
  gameAssets,
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

  const imageUrl = resolvePreviewImageUrl(card, cardCode, faceUp, gameAssets);
  if (imageUrl === null) {
    return null;
  }

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
        src={imageUrl}
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
