// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { Button } from 'react-aria-components';
import type { LocalizerType } from '../../types/Util.std.js';
import { FunPicker } from '../fun/FunPicker.dom.js';
import { FunStaticEmoji } from '../fun/FunEmoji.dom.js';
import type { FunEmojiSelection } from '../fun/panels/FunPanelEmojis.dom.js';
import type { FunGifSelection } from '../fun/panels/FunPanelGifs.dom.js';
import type { FunStickerSelection } from '../fun/panels/FunPanelStickers.dom.js';
import { getEmojiVariantByKey, type EmojiVariantKey } from '../fun/data/emojis.std.js';
import { OrbitalQuillEditor } from './OrbitalQuillEditor.js';
import type { QuotaInfo } from '../../services/orbitalQuota.preload.js';
import { useDraft } from './useDraft.js';
import type { DraftOperations } from './useDraft.js';

// Browser-compatible types for media selection
export type SelectedFile = {
  file: File;
  preview?: string; // Data URL for preview
  size: number;
  name: string;
  type: string;
};

export type UploadCheckResult = {
  allowed: boolean;
  reason?: string;
  quotaInfo: QuotaInfo;
};

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
  /**
   * Context ID for draft persistence (e.g., groupId for threads, threadId for replies)
   * If not provided, drafts will not be persisted
   */
  contextId?: string;
  replyContext?: {
    author: string;
    body: string;
  };
  /**
   * Callback when user cancels replying to a specific message
   * (returns to top-level reply mode)
   */
  onCancelReply?: () => void;
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
  /**
   * Draft operations for persistence (optional - if not provided, drafts won't be saved)
   */
  draftOperations?: DraftOperations;
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
  contextId,
  replyContext,
  onCancelReply,
  onSubmit,
  onSelectGif,
  onSelectSticker,
  i18n: _i18n,
  getQuotaInfo,
  checkUploadAllowed,
  formatBytes: formatBytesFromProps,
  uploadMedia,
  getAbsoluteAttachmentPath,
  draftOperations,
}: OrbitalComposerProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedGif, setSelectedGif] = useState<FunGifSelection | null>(null);
  const [selectedSticker, setSelectedSticker] =
    useState<FunStickerSelection | null>(null);

  // Draft management
  const { getDraft, saveDraft: saveDraftToStorage, clearDraft } = useDraft(draftOperations);

  // Track the last contextId we loaded a draft for
  const lastLoadedContextRef = useRef<string | null>(null);

  // Media attachment state
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedMediaIds, setUploadedMediaIds] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // File input ref for direct file picking
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editorApiRef = useRef<{
    insertText: (text: string) => void;
    insertEmoji: (emoji: string) => void;
    clear: () => void;
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

  // Load draft when contextId changes
  useEffect(() => {
    if (!contextId) {
      return;
    }

    // Only process if context actually changed
    if (lastLoadedContextRef.current === contextId) {
      return;
    }

    // Context changed - reset state and load draft for new context
    lastLoadedContextRef.current = contextId;

    const draft = getDraft(contextId);
    if (draft) {
      // Restore draft content
      if (draft.title !== undefined) {
        setTitle(draft.title);
      } else {
        setTitle('');
      }

      // Set body state and update Quill editor
      const draftBody = draft.body || '';
      setBody(draftBody);

      // Clear Quill and insert draft content if available
      if (editorApiRef.current) {
        editorApiRef.current.clear();
        if (draftBody) {
          editorApiRef.current.insertText(draftBody);
        }
      }
    } else {
      // No draft for this context - clear everything
      setTitle('');
      setBody('');
      if (editorApiRef.current) {
        editorApiRef.current.clear();
      }
    }
  }, [contextId, getDraft]);

  // Save draft when content changes (debounced via hook)
  useEffect(() => {
    if (!contextId) {
      return;
    }

    // Don't save if we haven't finished loading this context's draft yet
    if (lastLoadedContextRef.current !== contextId) {
      return;
    }

    // Save current content (even if empty - to allow clearing drafts)
    saveDraftToStorage(contextId, {
      title: mode === 'thread' ? title : undefined,
      body,
      parentMessageId: providedThreadId,
    });
  }, [contextId, title, body, mode, providedThreadId, saveDraftToStorage]);

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
      // Thread mode requires title AND (body OR media)
      if (!title.trim()) {
        return;
      }
      if (!body.trim() && selectedFiles.length === 0 && uploadedMediaIds.length === 0) {
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
      editorApiRef.current?.clear();
    } else {
      // Reply mode requires body OR files/media
      if (!body.trim() && selectedFiles.length === 0 && uploadedMediaIds.length === 0) {
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
      editorApiRef.current?.clear();
    }
    // Clear attachments after submit
    setSelectedGif(null);
    setSelectedSticker(null);
    setSelectedFiles([]);
    setUploadedMediaIds([]);
    setUploadProgress({});
    setUploadErrors({});

    // Clear draft after successful submit
    if (contextId) {
      clearDraft(contextId);
    }
  }, [mode, title, body, onSubmit, uploadedMediaIds, selectedFiles, contextId, clearDraft]);

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

  // Handle opening file picker directly
  const handleOpenMediaPicker = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset to allow re-selection
      fileInputRef.current.click();
    }
  }, []);

  // Create file preview for images
  const createFilePreview = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Process selected files (shared logic for file input and drag-and-drop)
  const processFiles = useCallback(
    async (files: File[]) => {
      setQuotaError(null);
      const newFiles: SelectedFile[] = [];

      for (const file of files) {
        try {
          // Check if upload is allowed for this file
          const checkResult = await checkUploadAllowed(groupId, file.size);

          if (!checkResult.allowed) {
            setQuotaError(checkResult.reason || 'Upload not allowed');
            break; // Stop processing more files
          }

          // Generate preview for images
          let preview: string | undefined;
          if (file.type.startsWith('image/')) {
            preview = await createFilePreview(file);
          }

          newFiles.push({
            file,
            preview,
            size: file.size,
            name: file.name,
            type: file.type,
          });
        } catch (error) {
          console.error('Failed to process file:', error);
          setQuotaError('Failed to check storage quota');
          break;
        }
      }

      if (newFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...newFiles]);

        // Refresh quota info
        try {
          const info = await getQuotaInfo(groupId);
          setQuotaInfo(info);
        } catch (error) {
          console.error('Failed to refresh quota:', error);
        }
      }
    },
    [groupId, checkUploadAllowed, getQuotaInfo, createFilePreview]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        await processFiles(Array.from(files));
      }
    },
    [processFiles]
  );

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only leave if we're leaving the container, not a child
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await processFiles(Array.from(files));
      }
    },
    [processFiles]
  );

  // Upload all selected media files
  const uploadAllMedia = useCallback(
    async (files?: SelectedFile[]): Promise<string[]> => {
      const filesToUpload = files || selectedFiles;
      const mediaIds: string[] = [];
      const errors: Record<string, string> = {};

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

  // Check if there's any content to submit (text, files, or media)
  const hasContent =
    body.trim().length > 0 ||
    selectedGif !== null ||
    selectedSticker !== null ||
    selectedFiles.length > 0 ||
    uploadedMediaIds.length > 0;

  const isSubmitDisabled =
    uploadingMedia ||
    (mode === 'thread'
      ? !title.trim() || !hasContent // Thread mode: require title AND content
      : !hasContent); // Reply mode: just require content

  // Check if paperclip button should be disabled (quota full)
  const canUploadMedia = quotaInfo?.canUpload !== false;

  // Get the grinning face emoji for the picker button
  const smileEmoji = useMemo(
    () => getEmojiVariantByKey('1F600' as EmojiVariantKey),
    []
  );

  return (
    <div
      className={`OrbitalComposer ${isDragging ? 'OrbitalComposer--dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Reply Context (when replying to a message) */}
      {mode === 'reply' && replyContext && (
        <div className="OrbitalComposer__reply-context">
          <div className="OrbitalComposer__reply-context__content">
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
          {onCancelReply && (
            <button
              type="button"
              className="OrbitalComposer__reply-context__cancel"
              onClick={onCancelReply}
              aria-label="Cancel reply"
            >
              x
            </button>
          )}
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

      {/* Hidden file input for direct file picking */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="OrbitalComposer__drop-overlay">
          Drop files here to attach
        </div>
      )}

      {/* Inline Quota Warning */}
      {quotaInfo?.isNearLimit && (
        <div className="OrbitalComposer__quota-warning">
          ⚠️ Storage is near limit ({(quotaInfo.storagePercentUsed ?? 0).toFixed(1)}% used).
          Consider deleting old media.
        </div>
      )}

      {/* Inline Quota Error */}
      {quotaError && (
        <div className="OrbitalComposer__quota-error">
          ⚠️ {quotaError}
        </div>
      )}

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
                  {formatBytesFromProps(file.size)}
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

      {/* Actions */}
      <div className="OrbitalComposer__actions">
        <div className="OrbitalComposer__tools">
          <button
            type="button"
            className="OrbitalComposer__icon-btn"
            aria-label="Attach file"
            title={
              canUploadMedia ? 'Attach photos, videos, or files' : 'Storage quota full - cannot upload'
            }
            onClick={handleOpenMediaPicker}
            disabled={!canUploadMedia}
          >
            📎
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
                <FunStaticEmoji
                  emoji={smileEmoji}
                  size={20}
                  role="presentation"
                />
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
