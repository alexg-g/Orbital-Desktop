// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

/**
 * OrbitalUploadProgress - Upload progress indicator
 *
 * Features:
 * - Progress bar for each file
 * - Overall upload progress indicator
 * - Cancel upload button
 * - Error display with retry
 * - Success confirmation
 * - Chunked upload support (5MB chunks)
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { SelectedFile } from './OrbitalComposer';
import type { AttachmentWithHydratedData } from '../../types/Attachment.std';
import type { MIMEType } from '../../types/MIME.std';

// Browser-compatible types for media upload
export type UploadMediaParams = {
  attachment: AttachmentWithHydratedData;
  threadId: string;
  onProgress: (progress: number) => void;
  signal: AbortSignal;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
};

export type UploadMediaResult = {
  mediaId: string;
};

export type UploadMediaFunction = (params: UploadMediaParams) => Promise<UploadMediaResult>;

export type UploadFile = {
  file: SelectedFile;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
  mediaId?: string;
};

export type OrbitalUploadProgressProps = {
  files: SelectedFile[];
  threadId: string;
  groupId: string;
  onComplete: (uploadedMediaIds: string[]) => void;
  onCancel: () => void;
  // Dependency injection for Node.js operations (allows Storybook mocking)
  uploadMedia: UploadMediaFunction;
  formatBytes: (bytes: number) => string;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
};

/**
 * OrbitalUploadProgress Component
 *
 * Shows progress for uploading multiple files
 */
export function OrbitalUploadProgress({
  files,
  threadId,
  groupId: _groupId, // Reserved for future quota checks
  onComplete,
  onCancel,
  uploadMedia,
  formatBytes,
  getAbsoluteAttachmentPath,
}: OrbitalUploadProgressProps): JSX.Element {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>(() =>
    files.map(file => ({
      file,
      status: 'pending' as const,
      progress: 0,
    }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Calculate overall progress
  const overallProgress =
    uploadFiles.reduce((sum, f) => sum + f.progress, 0) / uploadFiles.length;

  const completedCount = uploadFiles.filter(
    f => f.status === 'completed'
  ).length;
  const failedCount = uploadFiles.filter(f => f.status === 'failed').length;
  const isComplete = completedCount + failedCount === uploadFiles.length;

  // Upload a single file
  const uploadFile = useCallback(
    async (index: number) => {
      const uploadFile = uploadFiles[index];
      if (!uploadFile || uploadFile.status !== 'pending') {
        return;
      }

      const controller = new AbortController();
      setAbortController(controller);

      // Update status to uploading
      setUploadFiles(prev =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'uploading' as const } : f
        )
      );

      try {
        // Convert File to AttachmentWithHydratedData
        const fileBuffer = await uploadFile.file.file.arrayBuffer();
        const attachment: AttachmentWithHydratedData = {
          contentType: uploadFile.file.type as MIMEType,
          fileName: uploadFile.file.name,
          size: uploadFile.file.size,
          data: new Uint8Array(fileBuffer),
          blurHash: undefined,
          caption: undefined,
        };

        // Upload using orbital service
        const result = await uploadMedia({
          attachment,
          threadId,
          onProgress: progress => {
            setUploadFiles(prev =>
              prev.map((f, i) => (i === index ? { ...f, progress } : f))
            );
          },
          signal: controller.signal,
          getAbsoluteAttachmentPath,
        });

        // Mark as completed
        setUploadFiles(prev =>
          prev.map((f, i) =>
            i === index
              ? {
                  ...f,
                  status: 'completed' as const,
                  progress: 100,
                  mediaId: result.mediaId,
                }
              : f
          )
        );

        setAbortController(null);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Upload failed';

        // Mark as failed
        setUploadFiles(prev =>
          prev.map((f, i) =>
            i === index
              ? {
                  ...f,
                  status: 'failed' as const,
                  error: errorMessage,
                }
              : f
          )
        );

        setAbortController(null);
      }
    },
    [uploadFiles, threadId, uploadMedia, getAbsoluteAttachmentPath]
  );

  // Upload next file in sequence
  useEffect(() => {
    if (currentIndex < uploadFiles.length && !abortController) {
      const currentFile = uploadFiles[currentIndex];
      if (currentFile.status === 'pending') {
        uploadFile(currentIndex).then(() => {
          setCurrentIndex(prev => prev + 1);
        });
      } else if (
        currentFile.status === 'completed' ||
        currentFile.status === 'failed'
      ) {
        setCurrentIndex(prev => prev + 1);
      }
    }
  }, [currentIndex, uploadFiles, abortController, uploadFile]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    onCancel();
  }, [abortController, onCancel]);

  // Handle retry failed upload
  const handleRetry = useCallback(
    (index: number) => {
      setUploadFiles(prev =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: 'pending' as const, error: undefined, progress: 0 }
            : f
        )
      );
      setCurrentIndex(index);
    },
    []
  );

  // Handle completion
  const handleComplete = useCallback(() => {
    const mediaIds = uploadFiles
      .filter(f => f.status === 'completed' && f.mediaId)
      .map(f => f.mediaId!);

    onComplete(mediaIds);
  }, [uploadFiles, onComplete]);

  return (
    <div className="OrbitalUploadProgress">
      <div className="OrbitalUploadProgress__header">
        <h2 className="OrbitalUploadProgress__title">
          Uploading {uploadFiles.length} File{uploadFiles.length > 1 ? 's' : ''}
        </h2>
        {!isComplete && (
          <button
            type="button"
            className="OrbitalUploadProgress__cancel"
            onClick={handleCancel}
            aria-label="Cancel upload"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Overall Progress */}
      <div className="OrbitalUploadProgress__overall">
        <div className="OrbitalUploadProgress__overall-text">
          Overall Progress: {Math.round(overallProgress)}%
        </div>
        <div className="OrbitalUploadProgress__overall-bar">
          <div
            className="OrbitalUploadProgress__overall-bar-fill"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="OrbitalUploadProgress__overall-status">
          {completedCount} completed, {failedCount} failed,{' '}
          {uploadFiles.length - completedCount - failedCount} remaining
        </div>
      </div>

      {/* Individual File Progress */}
      <div className="OrbitalUploadProgress__files">
        {uploadFiles.map((uploadFile, index) => (
          <div
            key={index}
            className={`OrbitalUploadProgress__file OrbitalUploadProgress__file--${uploadFile.status}`}
          >
            {/* File Icon/Preview */}
            <div className="OrbitalUploadProgress__file-icon">
              {uploadFile.file.preview ? (
                <img
                  src={uploadFile.file.preview}
                  alt={uploadFile.file.name}
                  className="OrbitalUploadProgress__file-preview"
                />
              ) : (
                <div className="OrbitalUploadProgress__file-emoji">
                  {uploadFile.file.type.startsWith('video/') ? '🎥' : '📄'}
                </div>
              )}
            </div>

            {/* File Info */}
            <div className="OrbitalUploadProgress__file-info">
              <div className="OrbitalUploadProgress__file-name">
                {uploadFile.file.name}
              </div>
              <div className="OrbitalUploadProgress__file-size">
                {formatBytes(uploadFile.file.size)}
              </div>

              {/* Status */}
              <div className="OrbitalUploadProgress__file-status">
                {uploadFile.status === 'pending' && (
                  <span className="OrbitalUploadProgress__file-status-text">
                    Waiting...
                  </span>
                )}
                {uploadFile.status === 'uploading' && (
                  <>
                    <div className="OrbitalUploadProgress__file-progress-bar">
                      <div
                        className="OrbitalUploadProgress__file-progress-bar-fill"
                        style={{ width: `${uploadFile.progress}%` }}
                      />
                    </div>
                    <span className="OrbitalUploadProgress__file-status-text">
                      {Math.round(uploadFile.progress)}%
                    </span>
                  </>
                )}
                {uploadFile.status === 'completed' && (
                  <span className="OrbitalUploadProgress__file-status-text OrbitalUploadProgress__file-status-text--success">
                    ✓ Completed
                  </span>
                )}
                {uploadFile.status === 'failed' && (
                  <>
                    <span className="OrbitalUploadProgress__file-status-text OrbitalUploadProgress__file-status-text--error">
                      ✗ Failed: {uploadFile.error}
                    </span>
                    <button
                      type="button"
                      className="OrbitalUploadProgress__file-retry"
                      onClick={() => handleRetry(index)}
                    >
                      Retry
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {isComplete && (
        <div className="OrbitalUploadProgress__footer">
          {failedCount === 0 ? (
            <>
              <div className="OrbitalUploadProgress__success-icon">✓</div>
              <div className="OrbitalUploadProgress__success-text">
                All files uploaded successfully!
              </div>
              <button
                type="button"
                className="OrbitalUploadProgress__done-button"
                onClick={handleComplete}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <div className="OrbitalUploadProgress__warning-icon">⚠️</div>
              <div className="OrbitalUploadProgress__warning-text">
                {completedCount > 0
                  ? `${completedCount} file${
                      completedCount > 1 ? 's' : ''
                    } uploaded, ${failedCount} failed`
                  : `Upload failed for ${failedCount} file${
                      failedCount > 1 ? 's' : ''
                    }`}
              </div>
              <button
                type="button"
                className="OrbitalUploadProgress__done-button"
                onClick={handleComplete}
              >
                {completedCount > 0 ? 'Continue with Successful' : 'Close'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
