// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from 'react-aria-components';
import type { LocalizerType } from '../../types/Util.std.js';
import { FunPicker } from '../fun/FunPicker.dom.js';
import type { FunEmojiSelection } from '../fun/panels/FunPanelEmojis.dom.js';
import type { FunGifSelection } from '../fun/panels/FunPanelGifs.dom.js';
import type { FunStickerSelection } from '../fun/panels/FunPanelStickers.dom.js';
import { getEmojiVariantByKey } from '../fun/data/emojis.std.js';
import { OrbitalQuillEditor } from './OrbitalQuillEditor.js';
import { OrbitalMediaPicker } from './OrbitalMediaPicker.js';
import type { SelectedFile, UploadCheckResult } from './OrbitalMediaPicker.js';
import type { QuotaInfo } from '../../services/orbitalQuota.preload.js';

export type OrbitalComposerMode = 'thread' | 'reply';

// Type for attachment data (browser-compatible representation)
export type AttachmentData = {
  contentType: string;
  data: Uint8Array;
  size: number;
  fileName: string;
};

// Type for media upload result
export type UploadedMedia = {
  mediaId: string;
};

// Type for upload media function
export type UploadMediaFunction = (params: {
  attachment: AttachmentData;
  groupId: string;
  onProgress: (progress: number) => void;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
}) => Promise<UploadedMedia>;

export type OrbitalComposerProps = {
  mode: OrbitalComposerMode;
  groupId: string;
  threadId?: string; // Optional for replies, will be generated for new threads
  replyContext?: {
    author: string;
    body: string;
  };
  /**
   * Submit handler receives mediaIds in camelCase.
   * IMPORTANT: When implementing API calls, convert to snake_case (media_ids)
   * before sending to backend, as the backend expects snake_case field names.
   */
  onSubmit:
    | ((title: string, body: string, mediaIds: string[]) => void)
    | ((body: string, mediaIds: string[]) => void);
  onCancel?: () => void;
  onSelectGif?: (gif: FunGifSelection) => void;
  onSelectSticker?: (sticker: FunStickerSelection) => void;
  i18n: LocalizerType;
  // Dependency injection for Node.js operations (allows Storybook mocking)
  getQuotaInfo: (groupId: string) => Promise<QuotaInfo>;
  checkUploadAllowed: (groupId: string, fileSizeBytes: number) => Promise<UploadCheckResult>;
  formatBytes: (bytes: number) => string;
  uploadMedia: UploadMediaFunction;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
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
  groupId,
  threadId: providedThreadId,
  replyContext,
  onSubmit,
  onSelectGif,
  onSelectSticker,
  i18n,
  getQuotaInfo,
  checkUploadAllowed,
  formatBytes,
  uploadMedia,
  getAbsoluteAttachmentPath,
}: OrbitalComposerProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedGif, setSelectedGif] = useState<FunGifSelection | null>(null);
  const [selectedSticker, setSelectedSticker] =
    useState<FunStickerSelection | null>(null);

  // Media attachment state
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedMediaIds, setUploadedMediaIds] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);

  const editorApiRef = useRef<{
    insertText: (text: string) => void;
    insertEmoji: (emoji: string) => void;
  } | null>(null);

  // Character limits
  const TITLE_MAX_LENGTH = 200;
  const BODY_MAX_LENGTH = 5000;

  // Load quota info on mount
  useEffect(() => {
    async function loadQuota() {
      try {
        const info = await getQuotaInfo(groupId);
        setQuotaInfo(info);
      } catch (error) {
        console.error('Failed to load quota info:', error);
      }
    }

    loadQuota();
  }, [groupId]);

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

  const handleSubmit = useCallback(async () => {
    if (mode === 'thread') {
      // Thread mode requires title
      if (!title.trim()) {
        return;
      }

      // Upload media first if any selected
      let mediaIds: string[] = [...uploadedMediaIds];
      if (selectedFiles.length > 0) {
        try {
          setUploadingMedia(true);
          mediaIds = await uploadAllMedia();
        } catch (error) {
          console.error('Failed to upload media:', error);
          setUploadingMedia(false);
          return; // Don't submit if upload fails
        }
        setUploadingMedia(false);
      }

      (onSubmit as (title: string, body: string, mediaIds: string[]) => void)(
        title,
        body,
        mediaIds
      );
      setTitle('');
      setBody('');
    } else {
      // Reply mode only needs body
      if (!body.trim()) {
        return;
      }

      // Upload media first if any selected
      let mediaIds: string[] = [...uploadedMediaIds];
      if (selectedFiles.length > 0) {
        try {
          setUploadingMedia(true);
          mediaIds = await uploadAllMedia();
        } catch (error) {
          console.error('Failed to upload media:', error);
          setUploadingMedia(false);
          return; // Don't submit if upload fails
        }
        setUploadingMedia(false);
      }

      (onSubmit as (body: string, mediaIds: string[]) => void)(body, mediaIds);
      setBody('');
    }
    // Clear attachments after submit
    setSelectedGif(null);
    setSelectedSticker(null);
    setSelectedFiles([]);
    setUploadedMediaIds([]);
    setUploadProgress({});
    setUploadErrors({});
  }, [mode, title, body, onSubmit, uploadedMediaIds, selectedFiles]);

  const handleSelectEmoji = useCallback((emojiSelection: FunEmojiSelection) => {
    // Get emoji character from selection
    const emojiData = getEmojiVariantByKey(emojiSelection.variantKey);
    const emojiChar = emojiData.value;

    // Debug logging
    console.log('Emoji selection:', {
      variantKey: emojiSelection.variantKey,
      value: emojiChar,
      codePoints: Array.from(emojiChar).map(c =>
        c.codePointAt(0)?.toString(16)
      ),
      length: emojiChar.length,
    });

    // Insert at cursor position in Quill editor using specialized emoji insertion
    if (editorApiRef.current) {
      editorApiRef.current.insertEmoji(emojiChar);
    }
  }, []);

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

  // Handle opening media picker
  const handleOpenMediaPicker = useCallback(() => {
    setShowMediaPicker(true);
  }, []);

  // Handle media files selected from picker
  const handleFilesSelected = useCallback(
    async (files: SelectedFile[]) => {
      setSelectedFiles(files);
      setShowMediaPicker(false);

      // Automatically start upload
      try {
        setUploadingMedia(true);
        const mediaIds = await uploadAllMedia(files);
        setUploadedMediaIds(mediaIds);

        // Refresh quota after upload
        const info = await getQuotaInfo(groupId);
        setQuotaInfo(info);
      } catch (error) {
        console.error('Failed to upload media:', error);
      } finally {
        setUploadingMedia(false);
      }
    },
    [groupId]
  );

  // Upload all selected media files
  const uploadAllMedia = useCallback(
    async (files?: SelectedFile[]): Promise<string[]> => {
      const filesToUpload = files || selectedFiles;
      const mediaIds: string[] = [];
      const errors: Record<string, string> = {};

      // Generate thread ID for new threads (for uploads to be associated with)
      const threadId = providedThreadId || uuidv4();

      for (const selectedFile of filesToUpload) {
        const fileId = `${selectedFile.name}-${selectedFile.size}`;

        try {
          // Convert File to AttachmentWithHydratedData
          const arrayBuffer = await selectedFile.file.arrayBuffer();
          const data = new Uint8Array(arrayBuffer);

          const attachment = {
            contentType: selectedFile.type,
            data,
            size: selectedFile.size,
            fileName: selectedFile.name,
          };

          // Upload with progress tracking
          const media = await uploadMedia({
            attachment,
            groupId, // Changed from threadId to groupId for backend compatibility
            onProgress: (progress: number) => {
              setUploadProgress(prev => ({
                ...prev,
                [fileId]: progress,
              }));
            },
            getAbsoluteAttachmentPath,
          });

          mediaIds.push(media.mediaId);

          // Clear progress for this file
          setUploadProgress(prev => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });
        } catch (error) {
          console.error(`Failed to upload ${selectedFile.name}:`, error);
          errors[fileId] = error instanceof Error ? error.message : 'Upload failed';
        }
      }

      setUploadErrors(errors);
      return mediaIds;
    },
    [selectedFiles, providedThreadId, groupId, uploadMedia, getAbsoluteAttachmentPath]
  );

  // Remove uploaded media attachment
  const handleRemoveMedia = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedMediaIds(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Check if there's any content to submit
  const hasContent =
    body.trim().length > 0 ||
    selectedGif !== null ||
    selectedSticker !== null ||
    selectedFiles.length > 0;

  const isSubmitDisabled =
    uploadingMedia ||
    (mode === 'thread'
      ? !title.trim() || !hasContent // Thread mode: require title AND content
      : !hasContent); // Reply mode: just require content

  // Check if paperclip button should be disabled (quota full)
  const canUploadMedia = quotaInfo?.canUpload !== false;

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
          onChange={markdown => setBody(markdown)}
          onReady={api => {
            editorApiRef.current = api;
          }}
          maxLength={BODY_MAX_LENGTH}
          className="OrbitalComposer__quill-editor"
        />
      </div>

      {/* Upload Progress Indicator */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="OrbitalComposer__upload-progress-container">
          {Object.entries(uploadProgress).map(([fileId, progress]) => (
            <div key={fileId} className="OrbitalComposer__upload-progress">
              <div className="OrbitalComposer__upload-progress__header">
                <div className="OrbitalComposer__upload-progress__info">
                  <span className="OrbitalComposer__upload-progress__filename">
                    {fileId.split('-')[0]}
                  </span>
                </div>
              </div>
              <div className="OrbitalComposer__upload-progress__bar-container">
                <div
                  className="OrbitalComposer__upload-progress__bar"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="OrbitalComposer__upload-progress__percent">
                {Math.round(progress)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Attachment Preview */}
      {selectedFiles.length > 0 && (
        <div className="OrbitalComposer__attachments">
          {selectedFiles.map((file, index) => (
            <div key={index} className="OrbitalComposer__attachment">
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.name}
                  className="OrbitalComposer__attachment-preview"
                />
              ) : (
                <div className="OrbitalComposer__attachment-icon">
                  {file.type.startsWith('video/') ? '🎥' : '📄'}
                </div>
              )}
              <div className="OrbitalComposer__attachment-info">
                <div className="OrbitalComposer__attachment-name">
                  {file.name}
                </div>
                <div className="OrbitalComposer__attachment-size">
                  {formatFileSize(file.size)}
                </div>
              </div>
              <button
                type="button"
                className="OrbitalComposer__attachment-remove"
                onClick={() => handleRemoveMedia(index)}
                aria-label="Remove media"
                title="Remove media"
              >
                ✕
              </button>
              {uploadErrors[`${file.name}-${file.size}`] && (
                <div className="OrbitalComposer__attachment-error">
                  Error: {uploadErrors[`${file.name}-${file.size}`]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* GIF/Sticker Attachment Preview */}
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
              <img src={selectedSticker.stickerUrl} alt="Selected sticker" />
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

      {/* OrbitalMediaPicker Modal */}
      {showMediaPicker && (
        <div className="OrbitalComposer__modal-overlay">
          <div className="OrbitalComposer__modal">
            <OrbitalMediaPicker
              groupId={groupId}
              onFilesSelected={handleFilesSelected}
              onCancel={() => setShowMediaPicker(false)}
              getQuotaInfo={getQuotaInfo}
              checkUploadAllowed={checkUploadAllowed}
              formatBytes={formatBytes}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="OrbitalComposer__actions">
        <div className="OrbitalComposer__tools">
          <button
            type="button"
            className="OrbitalComposer__icon-btn"
            aria-label="Attach file"
            title={
              canUploadMedia ? 'Attach file' : 'Storage quota full - cannot upload'
            }
            onClick={handleOpenMediaPicker}
            disabled={!canUploadMedia}
          >
            📎
          </button>
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
          <div style={{ position: 'relative' }}>
            <FunPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              placement="top start"
              onSelectEmoji={handleSelectEmoji}
              onSelectGif={handleSelectGif}
              onSelectSticker={handleSelectSticker}
              onAddStickerPack={null}
            >
              <Button
                className="OrbitalComposer__icon-btn"
                aria-label="Open emoji picker"
                onPress={() => setPickerOpen(true)}
              >
                😀
              </Button>
            </FunPicker>
          </div>
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
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
