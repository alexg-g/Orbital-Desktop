// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useCallback, useRef, useState } from 'react';
import type { OrbitalFileBrowserItem } from '../../types/OrbitalFileBrowser.std';

export type OrbitalMediaLightboxProps = {
  /** Array of media items to display */
  items: ReadonlyArray<OrbitalFileBrowserItem>;
  /** Current item index */
  currentIndex: number;
  /** Callback when closing the lightbox */
  onClose: () => void;
  /** Callback when navigating to a different item */
  onNavigate: (index: number) => void;
  /** Function to convert relative paths to absolute paths */
  getAbsolutePath?: (relativePath: string) => string;
};

/**
 * OrbitalMediaLightbox - Full-screen media viewer with navigation
 *
 * Supports:
 * - Images: Full-size display
 * - Videos: Native player with controls
 * - PDFs: Embedded viewer
 * - Other files: Download prompt
 *
 * Features:
 * - Dark overlay backdrop
 * - Previous/Next navigation arrows
 * - Item counter (e.g., "3 / 6")
 * - Close button (X)
 * - Keyboard navigation (arrow keys, escape, space for video)
 * - Retro styling consistent with Orbital aesthetic
 */
export function OrbitalMediaLightbox({
  items,
  currentIndex,
  onClose,
  onNavigate,
  getAbsolutePath,
}: OrbitalMediaLightboxProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);

  const currentItem = items[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  // Media type detection
  const isImage = currentItem?.contentType?.startsWith('image/');
  const isVideo = currentItem?.contentType?.startsWith('video/');
  const isPDF = currentItem?.contentType === 'application/pdf';

  // Get the file URL
  const getFileUrl = useCallback(
    (item: OrbitalFileBrowserItem): string | null => {
      if (!item.localPath) return null;
      if (getAbsolutePath) {
        return `file://${getAbsolutePath(item.localPath)}`;
      }
      return null;
    },
    [getAbsolutePath]
  );

  const fileUrl = currentItem ? getFileUrl(currentItem) : null;

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setVideoError(false);
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setVideoError(false);
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, items.length, onNavigate]);

  const toggleVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        handlePrevious();
      } else if (event.key === 'ArrowRight') {
        handleNext();
      } else if (event.key === ' ' && isVideo) {
        event.preventDefault();
        toggleVideoPlayback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, handlePrevious, handleNext, isVideo, toggleVideoPlayback]);

  // Reset video error when item changes
  useEffect(() => {
    setVideoError(false);
  }, [currentIndex]);

  // Button style helper
  const getButtonStyle = (position?: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    ...(position === 'left' ? { left: '24px' } : {}),
    ...(position === 'right' ? { right: '24px' } : {}),
    ...(position ? {} : { top: '24px', right: '24px' }),
    width: position ? '56px' : '48px',
    height: position ? '56px' : '48px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '4px',
    color: 'white',
    fontSize: position ? '28px' : '24px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    zIndex: 10001,
  });

  const handleButtonHover = (e: React.MouseEvent<HTMLButtonElement>, isEnter: boolean) => {
    e.currentTarget.style.background = isEnter ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
    e.currentTarget.style.borderColor = isEnter ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.3)';
  };

  const renderMediaContent = () => {
    if (!fileUrl) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          color: 'white',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', opacity: 0.5 }}>📁</div>
          <div style={{ fontSize: '16px' }}>File not available locally</div>
          <div style={{ fontSize: '14px', opacity: 0.7 }}>
            {currentItem?.fileName || 'Unknown file'}
          </div>
        </div>
      );
    }

    if (isImage) {
      return (
        <img
          src={fileUrl}
          alt={currentItem?.fileName || `Image ${currentIndex + 1}`}
          style={{
            maxWidth: '100%',
            maxHeight: '90vh',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        />
      );
    }

    if (isVideo) {
      if (videoError) {
        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            color: 'white',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', opacity: 0.5 }}>🎬</div>
            <div style={{ fontSize: '16px' }}>Unable to play video</div>
            <div style={{ fontSize: '14px', opacity: 0.7 }}>
              {currentItem?.fileName || 'Unknown video'}
            </div>
          </div>
        );
      }

      return (
        <video
          ref={videoRef}
          src={fileUrl}
          controls
          autoPlay
          style={{
            maxWidth: '90vw',
            maxHeight: '80vh',
            borderRadius: '4px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
          onError={() => setVideoError(true)}
        >
          Your browser does not support video playback.
        </video>
      );
    }

    if (isPDF) {
      return (
        <div style={{
          width: '80vw',
          height: '85vh',
          background: 'white',
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}>
          <embed
            src={fileUrl}
            type="application/pdf"
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      );
    }

    // Other file types - show info and file name
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        color: 'white',
        textAlign: 'center',
        padding: '32px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        border: '2px solid rgba(255, 255, 255, 0.2)',
      }}>
        <div style={{ fontSize: '64px', opacity: 0.7 }}>📄</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
          {currentItem?.fileName || 'Unknown file'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          {currentItem?.contentType || 'Unknown type'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          Preview not available for this file type
        </div>
      </div>
    );
  };

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
        style={getButtonStyle()}
        onMouseEnter={e => handleButtonHover(e, true)}
        onMouseLeave={e => handleButtonHover(e, false)}
        aria-label="Close lightbox"
      >
        ✕
      </button>

      {/* Item counter */}
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
        {currentIndex + 1} / {items.length}
      </div>

      {/* File name */}
      {currentItem?.fileName && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '80vw',
            padding: '8px 16px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '4px',
            color: 'white',
            fontSize: '13px',
            zIndex: 10001,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {currentItem.fileName}
        </div>
      )}

      {/* Previous button */}
      {hasPrevious && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handlePrevious();
          }}
          style={getButtonStyle('left')}
          onMouseEnter={e => handleButtonHover(e, true)}
          onMouseLeave={e => handleButtonHover(e, false)}
          aria-label="Previous item"
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
          style={getButtonStyle('right')}
          onMouseEnter={e => handleButtonHover(e, true)}
          onMouseLeave={e => handleButtonHover(e, false)}
          aria-label="Next item"
        >
          ›
        </button>
      )}

      {/* Main content */}
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
        {renderMediaContent()}
      </div>
    </div>
  );
}
