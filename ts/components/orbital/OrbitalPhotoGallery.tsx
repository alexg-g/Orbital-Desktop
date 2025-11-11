// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback } from 'react';
import { OrbitalPhotoLightbox } from './OrbitalPhotoLightbox';

export type OrbitalPhotoGalleryProps = {
  photos: ReadonlyArray<string>;
  onPhotoClick?: (index: number) => void;
};

/**
 * OrbitalPhotoGallery - Display multiple images in a clean grid layout
 *
 * Layouts:
 * - 1 photo: Full width (max 600px)
 * - 2 photos: Two columns
 * - 3 photos: First large (left), two small stacked (right)
 * - 4+ photos: 2x2 grid, with "+N more" overlay on last tile if >4
 *
 * Features:
 * - Click any photo to open full-screen lightbox
 * - Navigate between photos with arrow buttons or keyboard
 * - Retro styling with rounded corners and 2px gaps
 */
export function OrbitalPhotoGallery({
  photos,
  onPhotoClick,
}: OrbitalPhotoGalleryProps): JSX.Element {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (photos.length === 0) {
    return <></>;
  }

  const handleClick = useCallback((index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
    if (onPhotoClick) {
      onPhotoClick(index);
    }
  }, [onPhotoClick]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const handleNavigate = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Single photo - full width
  if (photos.length === 1) {
    return (
      <>
        <div
          style={{
            maxWidth: '600px',
            borderRadius: '4px',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
          onClick={() => handleClick(0)}
          role="button"
          tabIndex={0}
        >
          <img
            src={photos[0]}
            alt="Photo 1"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
            }}
          />
        </div>

        {/* Lightbox */}
        {lightboxOpen && (
          <OrbitalPhotoLightbox
            photos={photos}
            currentIndex={currentIndex}
            onClose={handleCloseLightbox}
            onNavigate={handleNavigate}
          />
        )}
      </>
    );
  }

  // Two photos - side by side
  if (photos.length === 2) {
    return (
      <>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            maxWidth: '600px',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {photos.map((photo, index) => (
            <div
              key={index}
              style={{
                position: 'relative',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={() => handleClick(index)}
              role="button"
              tabIndex={0}
            >
              <img
                src={photo}
                alt={`Photo ${index + 1}`}
                style={{
                  width: '100%',
                  height: '300px',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>

        {/* Lightbox */}
        {lightboxOpen && (
          <OrbitalPhotoLightbox
            photos={photos}
            currentIndex={currentIndex}
            onClose={handleCloseLightbox}
            onNavigate={handleNavigate}
          />
        )}
      </>
    );
  }

  // Three photos - first large, two stacked on right
  if (photos.length === 3) {
    return (
      <>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '4px',
            maxWidth: '600px',
            height: '400px',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {/* First photo - spans both rows */}
          <div
            style={{
              gridRow: '1 / 3',
              position: 'relative',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
            onClick={() => handleClick(0)}
            role="button"
            tabIndex={0}
          >
            <img
              src={photos[0]}
              alt="Photo 1"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>

          {/* Second and third photos - stacked on right */}
          {photos.slice(1).map((photo, index) => (
            <div
              key={index + 1}
              style={{
                position: 'relative',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={() => handleClick(index + 1)}
              role="button"
              tabIndex={0}
            >
              <img
                src={photo}
                alt={`Photo ${index + 2}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>

        {/* Lightbox */}
        {lightboxOpen && (
          <OrbitalPhotoLightbox
            photos={photos}
            currentIndex={currentIndex}
            onClose={handleCloseLightbox}
            onNavigate={handleNavigate}
          />
        )}
      </>
    );
  }

  // Four or more photos - 2x2 grid
  const visiblePhotos = photos.slice(0, 4);
  const remainingCount = photos.length - 4;

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: '4px',
          maxWidth: '600px',
          height: '400px',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        {visiblePhotos.map((photo, index) => (
          <div
            key={index}
            style={{
              position: 'relative',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
            onClick={() => handleClick(index)}
            role="button"
            tabIndex={0}
          >
            <img
              src={photo}
              alt={`Photo ${index + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />

            {/* Show "+N more" overlay on last photo if more than 4 */}
            {index === 3 && remainingCount > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(42, 45, 53, 0.75)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontFamily: 'Trebuchet MS, sans-serif',
                  fontSize: '28px',
                  fontWeight: 'bold',
                }}
              >
                +{remainingCount}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <OrbitalPhotoLightbox
          photos={photos}
          currentIndex={currentIndex}
          onClose={handleCloseLightbox}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}
