// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useState, useRef } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import { FunPicker } from '../fun/FunPicker.dom';
import { FunPickerButton } from '../fun/FunButton.dom';
import type { FunEmojiSelection } from '../fun/panels/FunPanelEmojis.dom';
import type { FunGifSelection } from '../fun/panels/FunPanelGifs.dom';
import type { FunStickerSelection } from '../fun/panels/FunPanelStickers.dom';
import { getEmojiVariantByKey } from '../fun/data/emojis.std';
import { OrbitalQuillEditor } from './OrbitalQuillEditor';

export type OrbitalComposerMode = 'thread' | 'reply';

export type OrbitalComposerProps = {
  mode: OrbitalComposerMode;
  replyContext?: {
    author: string;
    body: string;
  };
  onSubmit: (title: string, body: string) => void | ((body: string) => void);
  onCancel?: () => void;
  onSelectGif?: (gif: FunGifSelection) => void;
  onSelectSticker?: (sticker: FunStickerSelection) => void;
  i18n: LocalizerType;
};

/**
 * OrbitalComposer - Create threads or post replies
 *
 * Modes:
 * - thread: Title + body input (for creating new threads)
 * - reply: Body input only (for replying to posts)
 *
 * Features:
 * - Retro styling with Verdana font
 * - Blue primary button (Create Thread / Send)
 * - Purple secondary button (Upload Media)
 * - 2px border for input fields (retro 2000s style)
 * - Reply context display when replying
 * - Keyboard shortcuts (Cmd/Ctrl+Enter to send)
 */
export function OrbitalComposer({
  mode,
  replyContext,
  onSubmit,
  onCancel,
  onSelectGif,
  onSelectSticker,
  i18n}: OrbitalComposerProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedGif, setSelectedGif] = useState<FunGifSelection | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<FunStickerSelection | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [uploadFileSize, setUploadFileSize] = useState<string>('');
  const editorApiRef = useRef<{ insertText: (text: string) => void } | null>(null);

  // Character limits
  const TITLE_MAX_LENGTH = 200;
  const BODY_MAX_LENGTH = 5000;

  const handleTitleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      // Enforce character limit
      if (newValue.length <= TITLE_MAX_LENGTH) {
        setTitle(newValue);
      }
    },
    [TITLE_MAX_LENGTH]
  );

  const handleSubmit = useCallback(() => {
    if (mode === 'thread') {
      // Thread mode requires title
      if (!title.trim()) {
        return;
      }
      (onSubmit as (title: string, body: string) => void)(title, body);
      setTitle('');
      setBody('');
    } else {
      // Reply mode only needs body
      if (!body.trim()) {
        return;
      }
      (onSubmit as (body: string) => void)(body);
      setBody('');
    }
    // Clear attachments after submit
    setSelectedGif(null);
    setSelectedSticker(null);
  }, [mode, title, body, onSubmit]);

  const handleSelectEmoji = useCallback(
    (emojiSelection: FunEmojiSelection) => {
      // Get emoji character from selection
      const emojiData = getEmojiVariantByKey(emojiSelection.variantKey);
      const emojiChar = emojiData.value;

      // Debug logging
      console.log('Emoji selection:', {
        variantKey: emojiSelection.variantKey,
        value: emojiChar,
        codePoints: Array.from(emojiChar).map(c => c.codePointAt(0)?.toString(16)),
        length: emojiChar.length,
      });

      // Insert at cursor position in Quill editor
      if (editorApiRef.current) {
        editorApiRef.current.insertText(emojiChar);
      }
    },
    []
  );

  const handleSelectGif = useCallback(
    (gif: FunGifSelection) => {
      // GIFs are typically sent as attachments, not inline text
      setSelectedGif(gif);
      setPickerOpen(false);
      // Pass to parent component to handle attachment
      if (onSelectGif) {
        onSelectGif(gif);
      }
    },
    [onSelectGif]
  );

  const handleSelectSticker = useCallback(
    (sticker: FunStickerSelection) => {
      // Stickers are typically sent as attachments, not inline text
      setSelectedSticker(sticker);
      setPickerOpen(false);
      // Pass to parent component to handle attachment
      if (onSelectSticker) {
        onSelectSticker(sticker);
      }
    },
    [onSelectSticker]
  );

  const handleRemoveGif = useCallback(() => {
    setSelectedGif(null);
  }, []);

  const handleRemoveSticker = useCallback(() => {
    setSelectedSticker(null);
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Set file info
    setUploadFileName(file.name);
    setUploadFileSize(formatFileSize(file.size));

    // Simulate upload progress
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev === null) return null;
        if (prev >= 100) {
          clearInterval(interval);
          // Clear progress after completion
          setTimeout(() => {
            setUploadProgress(null);
            setUploadFileName('');
            setUploadFileSize('');
          }, 1000);
          return 100;
        }
        // Increment by random amount (5-15%)
        return Math.min(100, prev + Math.random() * 10 + 5);
      });
    }, 200);
  }, []);

  const handleCancelUpload = useCallback(() => {
    setUploadProgress(null);
    setUploadFileName('');
    setUploadFileSize('');
  }, []);

  // Check if there's any content to submit
  const hasContent =
    body.trim().length > 0 ||
    selectedGif !== null ||
    selectedSticker !== null ||
    uploadFileName.length > 0;

  const isSubmitDisabled =
    mode === 'thread'
      ? !title.trim() || !hasContent  // Thread mode: require title AND content
      : !hasContent;                   // Reply mode: just require content

  return (
    <div className="OrbitalComposer">
      {/* Reply Context (when replying to a message) */}
      {mode === 'reply' && replyContext && (
        <div className="OrbitalComposer__reply-context">
          <div className="OrbitalComposer__reply-context__label">
            Replying to{' '}
            <span className="OrbitalComposer__reply-context__author">
              {replyContext.author}
            </span>
          </div>
          <div className="OrbitalComposer__reply-context__preview">
            {truncateText(replyContext.body, 100)}
          </div>
        </div>
      )}

      {/* Thread Title Input (only in thread mode) */}
      {mode === 'thread' && (
        <div className="OrbitalComposer__field">
          <input
            type="text"
            className="OrbitalComposer__title-input"
            placeholder="Thread title (required)"
            value={title}
            onChange={handleTitleChange}
            maxLength={TITLE_MAX_LENGTH}
            aria-label="Thread title"
            aria-describedby="title-char-count"
          />
          <div
            id="title-char-count"
            className={`OrbitalComposer__char-count ${
              title.length > 180 ? 'OrbitalComposer__char-count--warning' : ''
            }`}
            aria-live="polite"
          >
            {title.length} / {TITLE_MAX_LENGTH}
          </div>
        </div>
      )}

      {/* Body Rich Text Editor */}
      <div className="OrbitalComposer__field">
        <OrbitalQuillEditor
          placeholder={
            mode === 'thread'
              ? 'Share your thoughts... (use toolbar for formatting)'
              : 'Add a reply...'
          }
          initialMarkdown={body}
          onChange={(markdown) => setBody(markdown)}
          onReady={(api) => {
            editorApiRef.current = api;
          }}
          maxLength={BODY_MAX_LENGTH}
          className="OrbitalComposer__quill-editor"
        />
      </div>

      {/* Upload Progress Indicator */}
      {uploadProgress !== null && (
        <div className="OrbitalComposer__upload-progress">
          <div className="OrbitalComposer__upload-progress__header">
            <div className="OrbitalComposer__upload-progress__info">
              <span className="OrbitalComposer__upload-progress__filename">
                {uploadFileName}
              </span>
              <span className="OrbitalComposer__upload-progress__filesize">
                {uploadFileSize}
              </span>
            </div>
            <button
              type="button"
              className="OrbitalComposer__upload-progress__cancel"
              onClick={handleCancelUpload}
              aria-label="Cancel upload"
              title="Cancel upload"
            >
              ✕
            </button>
          </div>
          <div className="OrbitalComposer__upload-progress__bar-container">
            <div
              className="OrbitalComposer__upload-progress__bar"
              style={{ width: `${uploadProgress}%` }}
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="OrbitalComposer__upload-progress__percent">
            {Math.round(uploadProgress)}%
          </div>
        </div>
      )}

      {/* Attachment Preview */}
      {(selectedGif || selectedSticker) && (
        <div className="OrbitalComposer__attachments">
          {selectedGif && (
            <div className="OrbitalComposer__attachment">
              <video
                src={selectedGif.gif.previewMedia.url}
                loop
                autoPlay
                muted
                playsInline
              />
              <button
                type="button"
                className="OrbitalComposer__attachment-remove"
                onClick={handleRemoveGif}
                aria-label="Remove GIF"
                title="Remove GIF"
              >
                ✕
              </button>
            </div>
          )}
          {selectedSticker && (
            <div className="OrbitalComposer__attachment">
              <img
                src={selectedSticker.sticker.url}
                alt="Selected sticker"
              />
              <button
                type="button"
                className="OrbitalComposer__attachment-remove"
                onClick={handleRemoveSticker}
                aria-label="Remove sticker"
                title="Remove sticker"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="OrbitalComposer__actions">
        <div className="OrbitalComposer__tools">
          <input
            type="file"
            id="file-upload"
            className="OrbitalComposer__file-input"
            accept="image/*,video/*,.gif"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="Select file to upload"
          />
          <label htmlFor="file-upload">
            <button
              type="button"
              className="OrbitalComposer__icon-btn"
              aria-label="Attach file"
              title="Attach file"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              📎
            </button>
          </label>
          <button
            type="button"
            className="OrbitalComposer__icon-btn"
            aria-label="Record video"
            title="Record video"
          >
            🎥
          </button>
          <button
            type="button"
            className="OrbitalComposer__icon-btn"
            aria-label="Add photo"
            title="Add photo"
          >
            📷
          </button>

          {/* Fun Picker: Emojis, GIFs, and Stickers */}
          <FunPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            placement="top"
            onSelectEmoji={handleSelectEmoji}
            onSelectGif={handleSelectGif}
            onSelectSticker={handleSelectSticker}
            onAddStickerPack={null}
          >
            <FunPickerButton i18n={i18n} />
          </FunPicker>
        </div>

        <button
          type="button"
          className="OrbitalComposer__button-primary"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          aria-label={mode === 'thread' ? 'Create thread' : 'Send reply'}
        >
          {mode === 'thread' ? 'Create Thread >>' : 'Send >>'}
        </button>
      </div>
    </div>
  );
}

/**
 * Truncate text to specified length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
