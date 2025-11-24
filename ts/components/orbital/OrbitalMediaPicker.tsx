// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

/**
 * OrbitalMediaPicker - File picker for media uploads
 *
 * Features:
 * - File selection dialog (video/images)
 * - Multiple file selection
 * - Preview selected files with thumbnails
 * - Show file sizes
 * - Display quota warning at 80%
 * - Block selection if quota would be exceeded
 * - Show available space remaining
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { QuotaInfo } from '../../services/orbitalQuota.preload';

// Browser-compatible types for quota checking
export type UploadCheckResult = {
  allowed: boolean;
  reason?: string;
  quotaInfo: QuotaInfo;
};

export type SelectedFile = {
  file: File;
  preview?: string; // Data URL for preview
  size: number;
  name: string;
  type: string;
};

export type OrbitalMediaPickerProps = {
  groupId: string;
  onFilesSelected: (files: SelectedFile[]) => void;
  onCancel?: () => void;
  maxFiles?: number;
  acceptedTypes?: string; // e.g., "image/*,video/*"
  // Dependency injection for Node.js operations (allows Storybook mocking)
  getQuotaInfo: (groupId: string) => Promise<QuotaInfo>;
  checkUploadAllowed: (groupId: string, fileSizeBytes: number) => Promise<UploadCheckResult>;
  formatBytes: (bytes: number) => string;
};

/**
 * OrbitalMediaPicker Component
 *
 * File picker with quota checking and preview
 */
export function OrbitalMediaPicker({
  groupId,
  onFilesSelected,
  onCancel,
  maxFiles = 10,
  acceptedTypes = 'image/*,video/*',
  getQuotaInfo,
  checkUploadAllowed,
  formatBytes,
}: OrbitalMediaPickerProps): JSX.Element {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load quota info on mount
  useEffect(() => {
    async function loadQuota() {
      try {
        const info = await getQuotaInfo(groupId);
        setQuotaInfo(info);
      } catch (error) {
        console.error('Failed to load quota info:', error);
        setQuotaError('Failed to load storage quota information');
      }
    }

    loadQuota();
  }, [groupId]);

  // Handle file selection
  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }

      setLoading(true);
      setQuotaError(null);

      const fileArray = Array.from(files);
      const newFiles: SelectedFile[] = [];

      // Check quota for each file
      let totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

      for (const file of fileArray) {
        // Check if adding this file would exceed quota
        try {
          const checkResult = await checkUploadAllowed(groupId, file.size);

          if (!checkResult.allowed) {
            setQuotaError(checkResult.reason || 'Upload not allowed');
            break;
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

          totalSize += file.size;

          // Check max files limit
          if (selectedFiles.length + newFiles.length >= maxFiles) {
            break;
          }
        } catch (error) {
          console.error('Failed to check quota:', error);
          setQuotaError('Failed to check storage quota');
          break;
        }
      }

      if (newFiles.length > 0) {
        const allFiles = [...selectedFiles, ...newFiles];
        setSelectedFiles(allFiles);

        // Refresh quota info
        try {
          const info = await getQuotaInfo(groupId);
          setQuotaInfo(info);
        } catch (error) {
          console.error('Failed to refresh quota:', error);
        }
      }

      setLoading(false);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [groupId, selectedFiles, maxFiles, checkUploadAllowed, getQuotaInfo]
  );

  // Remove selected file
  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setQuotaError(null);
  }, []);

  // Open file picker
  const handleOpenPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Confirm selection
  const handleConfirm = useCallback(() => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
  }, [selectedFiles, onFilesSelected]);

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const isNearLimit = quotaInfo?.isNearLimit || false;
  const canUpload = quotaInfo?.canUpload !== false;

  return (
    <div className="OrbitalMediaPicker">
      <div className="OrbitalMediaPicker__header">
        <h2 className="OrbitalMediaPicker__title">Add Media</h2>
        <button
          type="button"
          className="OrbitalMediaPicker__close"
          onClick={onCancel}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Quota Info */}
      {quotaInfo && (
        <div
          className={`OrbitalMediaPicker__quota ${
            isNearLimit ? 'OrbitalMediaPicker__quota--warning' : ''
          }`}
        >
          <div className="OrbitalMediaPicker__quota-bar">
            <div
              className="OrbitalMediaPicker__quota-bar-fill"
              style={{ width: `${quotaInfo.storagePercentUsed}%` }}
            />
          </div>
          <div className="OrbitalMediaPicker__quota-text">
            Storage: {formatBytes(quotaInfo.storageUsed)} /{' '}
            {formatBytes(quotaInfo.storageLimit)} (
            {(quotaInfo.storagePercentUsed ?? 0).toFixed(1)}%)
            <br />
            Files: {quotaInfo.filesUsed} / {quotaInfo.filesLimit} (
            {(quotaInfo.filesPercentUsed ?? 0).toFixed(1)}%)
          </div>
          {isNearLimit && (
            <div className="OrbitalMediaPicker__quota-warning-text">
              ⚠️ Storage is near limit. Consider deleting old media.
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {quotaError && (
        <div className="OrbitalMediaPicker__error">
          <div className="OrbitalMediaPicker__error-icon">⚠️</div>
          <div className="OrbitalMediaPicker__error-message">{quotaError}</div>
        </div>
      )}

      {/* File Selection */}
      <div className="OrbitalMediaPicker__content">
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={!canUpload || loading}
        />

        {selectedFiles.length === 0 ? (
          <div className="OrbitalMediaPicker__empty">
            <div className="OrbitalMediaPicker__empty-icon">📎</div>
            <p className="OrbitalMediaPicker__empty-text">
              No files selected
            </p>
            <button
              type="button"
              className="OrbitalMediaPicker__select-button"
              onClick={handleOpenPicker}
              disabled={!canUpload || loading}
            >
              {loading ? 'Loading...' : 'Select Files'}
            </button>
          </div>
        ) : (
          <div className="OrbitalMediaPicker__files">
            {selectedFiles.map((selectedFile, index) => (
              <div key={index} className="OrbitalMediaPicker__file">
                {selectedFile.preview ? (
                  <img
                    src={selectedFile.preview}
                    alt={selectedFile.name}
                    className="OrbitalMediaPicker__file-preview"
                  />
                ) : (
                  <div className="OrbitalMediaPicker__file-icon">
                    {selectedFile.type.startsWith('video/') ? '🎥' : '📄'}
                  </div>
                )}
                <div className="OrbitalMediaPicker__file-info">
                  <div className="OrbitalMediaPicker__file-name">
                    {selectedFile.name}
                  </div>
                  <div className="OrbitalMediaPicker__file-size">
                    {formatBytes(selectedFile.size)}
                  </div>
                </div>
                <button
                  type="button"
                  className="OrbitalMediaPicker__file-remove"
                  onClick={() => handleRemoveFile(index)}
                  aria-label="Remove file"
                >
                  ×
                </button>
              </div>
            ))}

            {selectedFiles.length < maxFiles && canUpload && (
              <button
                type="button"
                className="OrbitalMediaPicker__add-more"
                onClick={handleOpenPicker}
                disabled={loading}
              >
                + Add More
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {selectedFiles.length > 0 && (
        <div className="OrbitalMediaPicker__footer">
          <div className="OrbitalMediaPicker__footer-info">
            {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} (
            {formatBytes(totalSize)})
          </div>
          <div className="OrbitalMediaPicker__footer-actions">
            <button
              type="button"
              className="OrbitalMediaPicker__cancel-button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="OrbitalMediaPicker__confirm-button"
              onClick={handleConfirm}
              disabled={loading}
            >
              Upload {selectedFiles.length} File
              {selectedFiles.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Create a preview data URL for an image file
 */
function createFilePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}
