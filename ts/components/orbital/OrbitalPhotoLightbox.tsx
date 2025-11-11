// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useCallback } from 'react';

export type OrbitalPhotoLightboxProps = {
  photos: ReadonlyArray<string>;
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
};

/**
 * OrbitalPhotoLightbox - Full-screen photo viewer with navigation
 *
 * Features:
 * - Dark overlay backdrop
 * - Large centered image
 * - Previous/Next navigation arrows
 * - Image counter (e.g., "3 / 6")
 * - Close button (X)
 * - Keyboard navigation (arrow keys, escape)
 * - Retro styling consistent with Orbital aesthetic
 */
export function OrbitalPhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
}: OrbitalPhotoLightboxProps): JSX.Element {
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, photos.length, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        handlePrevious();
      } else if (event.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, handlePrevious, handleNext]);

  const currentPhoto = photos[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(42, 45, 53, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Verdana, sans-serif',
      }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          width: '48px',
          height: '48px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          zIndex: 10001,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        }}
        aria-label="Close lightbox"
      >
        ✕
      </button>

      {/* Image counter */}
      <div
        style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
          zIndex: 10001,
        }}
      >
        {currentIndex + 1} / {photos.length}
      </div>

      {/* Previous button */}
      {hasPrevious && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handlePrevious();
          }}
          style={{
            position: 'absolute',
            left: '24px',
            width: '56px',
            height: '56px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '4px',
            color: 'white',
            fontSize: '28px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10001,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          aria-label="Previous image"
        >
          ‹
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handleNext();
          }}
          style={{
            position: 'absolute',
            right: '24px',
            width: '56px',
            height: '56px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '4px',
            color: 'white',
            fontSize: '28px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10001,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          aria-label="Next image"
        >
          ›
        </button>
      )}

      {/* Main image */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={currentPhoto}
          alt={`Photo ${currentIndex + 1} of ${photos.length}`}
          style={{
            maxWidth: '100%',
            maxHeight: '90vh',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        />
      </div>
    </div>
  );
}
