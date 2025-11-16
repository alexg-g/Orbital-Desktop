// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Relay Integration Tests
 *
 * End-to-end integration tests for Issue #9 (Media Relay with Signal Encryption).
 * Tests the complete flow from upload → encryption → server relay → download → decryption.
 *
 * Test Coverage:
 * - Full upload/download round-trip
 * - Network interruption handling
 * - Quota enforcement
 * - Expiration handling
 * - Concurrent operations
 * - Error scenarios
 */

import { assert } from 'chai';
import { readFileSync } from 'node:fs';
import fsExtra from 'fs-extra';

import * as Bytes from '../../Bytes.std.js';
import { constantTimeEqual } from '../../Crypto.node.js';
import { getAbsoluteAttachmentPath } from '../../util/migrations.preload.js';
import { getPath } from '../../windows/main/attachments.preload.js';
import {
  uploadMediaToOrbital,
  type UploadMediaOptions,
} from '../../services/orbitalMediaUpload.js';
import {
  downloadMediaFromOrbital,
  type DownloadMediaOptions,
  getMediaDownloadStatus,
} from '../../services/orbitalMediaDownload.js';
import type { AttachmentWithHydratedData } from '../../types/Attachment.std.js';
import { DataReader, DataWriter } from '../../sql/Server.node.js';

const { emptyDir } = fsExtra;

describe('Orbital Media Relay Integration Tests', () => {
  const testThreadId = 'test-thread-123';
  const testUploaderId = 'test-uploader-456';

  beforeEach(async () => {
    // Clean up attachments directory before each test
    await emptyDir(getPath(window.SignalContext.config.userDataPath));
  });

  afterEach(async () => {
    // Clean up after each test
    await emptyDir(getPath(window.SignalContext.config.userDataPath));
  });

  describe('Full Upload/Download Flow', () => {
    it('uploads 1MB file and downloads it back successfully', async function () {
      this.timeout(30000); // 30 seconds

      // Create test attachment (1MB)
      const plaintext = new Uint8Array(1024 * 1024); // 1MB
      for (let i = 0; i < plaintext.length; i++) {
        plaintext[i] = (i * 7) % 256;
      }

      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'test-video.mp4',
      };

      // Track upload progress
      const uploadProgress: number[] = [];
      const uploadOptions: UploadMediaOptions = {
        attachment,
        threadId: testThreadId,
        uploadedBy: testUploaderId,
        caption: 'Test video upload',
        onProgress: progress => uploadProgress.push(progress),
        getAbsoluteAttachmentPath,
      };

      // Upload media
      const uploadResult = await uploadMediaToOrbital(uploadOptions);

      // Verify upload result
      assert.isDefined(uploadResult.id, 'Should have media ID');
      assert.isDefined(uploadResult.mediaId, 'Should have server media ID');
      assert.strictEqual(
        uploadResult.threadId,
        testThreadId,
        'Thread ID should match'
      );
      assert.strictEqual(uploadResult.size, plaintext.byteLength);
      assert.strictEqual(uploadResult.downloaded, 0, 'Should not be downloaded yet');
      assert.isNull(uploadResult.localPath, 'Should not have local path yet');

      // Verify progress was tracked
      assert.isTrue(
        uploadProgress.length > 0,
        'Should have upload progress updates'
      );
      assert.strictEqual(
        uploadProgress[uploadProgress.length - 1],
        100,
        'Should reach 100% progress'
      );

      // Verify media saved to SQLCipher
      const savedMedia = await DataReader.getOrbitalMedia(uploadResult.id);
      assert.isDefined(savedMedia, 'Media should be saved to database');
      assert.strictEqual(savedMedia!.attachmentKeys.byteLength, 64);

      // Download media
      const downloadProgress: number[] = [];
      const downloadOptions: DownloadMediaOptions = {
        mediaId: uploadResult.id,
        onProgress: progress => downloadProgress.push(progress),
        getAbsoluteAttachmentPath,
      };

      const downloadedPath = await downloadMediaFromOrbital(downloadOptions);

      // Verify download
      assert.isDefined(downloadedPath, 'Should have downloaded path');

      // Verify downloaded file content matches original
      const downloadedData = readFileSync(downloadedPath);
      assert.isTrue(
        constantTimeEqual(plaintext, downloadedData),
        'Downloaded data should match original plaintext'
      );

      // Verify download progress
      assert.isTrue(
        downloadProgress.length > 0,
        'Should have download progress updates'
      );
      assert.strictEqual(
        downloadProgress[downloadProgress.length - 1],
        100,
        'Should reach 100% download progress'
      );

      // Verify database updated
      const updatedMedia = await DataReader.getOrbitalMedia(uploadResult.id);
      assert.strictEqual(
        updatedMedia!.downloaded,
        1,
        'Should be marked as downloaded'
      );
      assert.isDefined(updatedMedia!.localPath, 'Should have local path');
    });

    it('uploads 10MB file and downloads it back successfully', async function () {
      this.timeout(60000); // 60 seconds

      // Create test attachment (10MB)
      const plaintext = new Uint8Array(10 * 1024 * 1024); // 10MB

      // Fill with pattern for verification
      for (let i = 0; i < plaintext.length; i += 1024) {
        plaintext[i] = (i / 1024) % 256;
      }

      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'large-test-video.mp4',
      };

      // Upload
      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      assert.isDefined(uploadResult.id);

      // Download
      const downloadedPath = await downloadMediaFromOrbital({
        mediaId: uploadResult.id,
        getAbsoluteAttachmentPath,
      });

      // Verify sample points (avoid loading full 10MB into memory for comparison)
      const downloadedData = readFileSync(downloadedPath);
      assert.strictEqual(downloadedData.length, plaintext.length);

      // Check every 1MB
      for (let i = 0; i < plaintext.length; i += 1024 * 1024) {
        assert.strictEqual(
          downloadedData[i],
          plaintext[i],
          `Byte at position ${i} should match`
        );
      }
    });

    it('handles already downloaded media (returns cached path)', async function () {
      this.timeout(30000);

      // Create and upload media
      const plaintext = new Uint8Array(1024); // 1KB
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'image/png',
        fileName: 'test.png',
      };

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      // First download
      const firstDownloadPath = await downloadMediaFromOrbital({
        mediaId: uploadResult.id,
        getAbsoluteAttachmentPath,
      });

      // Second download (should use cached path)
      const secondDownloadPath = await downloadMediaFromOrbital({
        mediaId: uploadResult.id,
        getAbsoluteAttachmentPath,
      });

      assert.strictEqual(
        firstDownloadPath,
        secondDownloadPath,
        'Should return same cached path'
      );
    });
  });

  describe('Network Interruption Handling', () => {
    it('aborts upload when signal is triggered', async function () {
      this.timeout(10000);

      const plaintext = new Uint8Array(5 * 1024 * 1024); // 5MB
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'abort-test.mp4',
      };

      const abortController = new AbortController();

      // Abort after 100ms
      setTimeout(() => abortController.abort(), 100);

      await assert.isRejected(
        uploadMediaToOrbital({
          attachment,
          threadId: testThreadId,
          getAbsoluteAttachmentPath,
          signal: abortController.signal,
        }),
        /aborted/i
      );
    });

    it('aborts download when signal is triggered', async function () {
      this.timeout(30000);

      // First upload media
      const plaintext = new Uint8Array(5 * 1024 * 1024); // 5MB
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'abort-download-test.mp4',
      };

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      // Try to download with abort
      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 100);

      await assert.isRejected(
        downloadMediaFromOrbital({
          mediaId: uploadResult.id,
          getAbsoluteAttachmentPath,
          signal: abortController.signal,
        }),
        /aborted/i
      );
    });
  });

  describe('File Size Validation', () => {
    it('rejects files larger than 500MB', async function () {
      // Create 501MB attachment (mock - don't actually allocate memory)
      const oversizedAttachment: AttachmentWithHydratedData = {
        data: new Uint8Array(0), // Empty (we're testing size check)
        size: 501 * 1024 * 1024, // 501MB
        contentType: 'video/mp4',
        fileName: 'oversized.mp4',
      };

      await assert.isRejected(
        uploadMediaToOrbital({
          attachment: oversizedAttachment,
          threadId: testThreadId,
          getAbsoluteAttachmentPath,
        }),
        /too large/i
      );
    });

    it('accepts files at exactly 500MB', async function () {
      this.timeout(120000); // 2 minutes

      // Create exactly 500MB (testing boundary)
      // WARNING: This test allocates 500MB of memory
      const plaintext = new Uint8Array(500 * 1024 * 1024); // 500MB

      // Fill with minimal pattern to verify correctness
      for (let i = 0; i < plaintext.length; i += 1024 * 1024) {
        plaintext[i] = i % 256;
      }

      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'max-size.mp4',
      };

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      assert.isDefined(uploadResult.id, 'Should upload successfully');
      assert.strictEqual(uploadResult.size, 500 * 1024 * 1024);
    });
  });

  describe('Metadata Preservation', () => {
    it('preserves all metadata fields through upload/download cycle', async function () {
      this.timeout(30000);

      const plaintext = new Uint8Array(1024); // 1KB
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'metadata-test.mp4',
        width: 1920,
        height: 1080,
        duration: 30000, // 30 seconds
        blurHash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', // Sample BlurHash
      };

      const caption = 'Test caption with metadata';

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        uploadedBy: testUploaderId,
        caption,
        getAbsoluteAttachmentPath,
      });

      // Verify metadata saved
      const savedMedia = await DataReader.getOrbitalMedia(uploadResult.id);
      assert.strictEqual(savedMedia!.contentType, 'video/mp4');
      assert.strictEqual(savedMedia!.fileName, 'metadata-test.mp4');
      assert.strictEqual(savedMedia!.width, 1920);
      assert.strictEqual(savedMedia!.height, 1080);
      assert.strictEqual(savedMedia!.duration, 30000);
      assert.strictEqual(savedMedia!.blurHash, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj');
      assert.strictEqual(savedMedia!.caption, caption);
      assert.strictEqual(savedMedia!.uploadedBy, testUploaderId);
    });
  });

  describe('Download Status Tracking', () => {
    it('correctly reports download status', async function () {
      this.timeout(30000);

      const plaintext = new Uint8Array(1024);
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'image/png',
        fileName: 'status-test.png',
      };

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      // Check status before download
      const statusBefore = await getMediaDownloadStatus(uploadResult.id);
      assert.isFalse(statusBefore.isDownloaded, 'Should not be downloaded yet');
      assert.isTrue(
        statusBefore.isAvailableOnServer,
        'Should be available on server'
      );
      assert.isNull(statusBefore.localPath, 'Should not have local path');

      // Download
      await downloadMediaFromOrbital({
        mediaId: uploadResult.id,
        getAbsoluteAttachmentPath,
      });

      // Check status after download
      const statusAfter = await getMediaDownloadStatus(uploadResult.id);
      assert.isTrue(statusAfter.isDownloaded, 'Should be downloaded');
      assert.isTrue(
        statusAfter.isAvailableOnServer,
        'Should still be available on server'
      );
      assert.isDefined(statusAfter.localPath, 'Should have local path');
    });
  });

  describe('Error Handling', () => {
    it('throws error when downloading non-existent media', async function () {
      await assert.isRejected(
        downloadMediaFromOrbital({
          mediaId: 'non-existent-id',
          getAbsoluteAttachmentPath,
        }),
        /not found/i
      );
    });

    it('throws error when media has expired on server', async function () {
      this.timeout(30000);

      // Create and upload media
      const plaintext = new Uint8Array(1024);
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'image/png',
        fileName: 'expired-test.png',
      };

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      // Manually set expiration to past
      await DataWriter.updateMediaExpiration(
        uploadResult.id,
        Date.now() - 1000
      );

      // Try to download expired media
      await assert.isRejected(
        downloadMediaFromOrbital({
          mediaId: uploadResult.id,
          getAbsoluteAttachmentPath,
        }),
        /expired/i
      );
    });
  });

  describe('Concurrent Operations', () => {
    it('handles multiple concurrent uploads', async function () {
      this.timeout(60000); // 60 seconds

      const uploadCount = 3;
      const uploads: Promise<any>[] = [];

      for (let i = 0; i < uploadCount; i++) {
        const plaintext = new Uint8Array(1024 * 1024); // 1MB each
        for (let j = 0; j < plaintext.length; j++) {
          plaintext[j] = (i + j) % 256; // Different pattern per upload
        }

        const attachment: AttachmentWithHydratedData = {
          data: plaintext,
          size: plaintext.byteLength,
          contentType: 'video/mp4',
          fileName: `concurrent-${i}.mp4`,
        };

        uploads.push(
          uploadMediaToOrbital({
            attachment,
            threadId: testThreadId,
            getAbsoluteAttachmentPath,
          })
        );
      }

      // Wait for all uploads to complete
      const results = await Promise.all(uploads);

      assert.strictEqual(results.length, uploadCount, 'All uploads should succeed');

      // Verify each upload has unique ID
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, uploadCount, 'All IDs should be unique');
    });

    it('handles concurrent downloads', async function () {
      this.timeout(60000);

      // Upload 3 files first
      const uploadCount = 3;
      const mediaIds: string[] = [];

      for (let i = 0; i < uploadCount; i++) {
        const plaintext = new Uint8Array(1024 * 1024); // 1MB
        const attachment: AttachmentWithHydratedData = {
          data: plaintext,
          size: plaintext.byteLength,
          contentType: 'video/mp4',
          fileName: `download-concurrent-${i}.mp4`,
        };

        const result = await uploadMediaToOrbital({
          attachment,
          threadId: testThreadId,
          getAbsoluteAttachmentPath,
        });

        mediaIds.push(result.id);
      }

      // Download all concurrently
      const downloads = mediaIds.map(mediaId =>
        downloadMediaFromOrbital({
          mediaId,
          getAbsoluteAttachmentPath,
        })
      );

      const downloadPaths = await Promise.all(downloads);

      assert.strictEqual(
        downloadPaths.length,
        uploadCount,
        'All downloads should succeed'
      );

      // Verify all paths are unique
      const uniquePaths = new Set(downloadPaths);
      assert.strictEqual(
        uniquePaths.size,
        uploadCount,
        'All download paths should be unique'
      );
    });
  });

  describe('Progress Tracking', () => {
    it('reports incremental upload progress', async function () {
      this.timeout(30000);

      const plaintext = new Uint8Array(10 * 1024 * 1024); // 10MB
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'progress-test.mp4',
      };

      const progressUpdates: number[] = [];

      await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        onProgress: progress => progressUpdates.push(progress),
        getAbsoluteAttachmentPath,
      });

      // Verify progress updates
      assert.isTrue(
        progressUpdates.length > 1,
        'Should have multiple progress updates'
      );

      // Verify progress is monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        assert.isTrue(
          progressUpdates[i] >= progressUpdates[i - 1],
          'Progress should be monotonically increasing'
        );
      }

      // Verify final progress is 100%
      assert.strictEqual(
        progressUpdates[progressUpdates.length - 1],
        100,
        'Final progress should be 100%'
      );
    });

    it('reports incremental download progress', async function () {
      this.timeout(60000);

      // Upload 10MB file
      const plaintext = new Uint8Array(10 * 1024 * 1024);
      const attachment: AttachmentWithHydratedData = {
        data: plaintext,
        size: plaintext.byteLength,
        contentType: 'video/mp4',
        fileName: 'download-progress-test.mp4',
      };

      const uploadResult = await uploadMediaToOrbital({
        attachment,
        threadId: testThreadId,
        getAbsoluteAttachmentPath,
      });

      // Download with progress tracking
      const progressUpdates: number[] = [];

      await downloadMediaFromOrbital({
        mediaId: uploadResult.id,
        onProgress: progress => progressUpdates.push(progress),
        getAbsoluteAttachmentPath,
      });

      // Verify progress updates
      assert.isTrue(
        progressUpdates.length > 1,
        'Should have multiple progress updates'
      );

      // Verify monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        assert.isTrue(
          progressUpdates[i] >= progressUpdates[i - 1],
          'Download progress should be monotonically increasing'
        );
      }

      // Verify reaches 100%
      assert.strictEqual(
        progressUpdates[progressUpdates.length - 1],
        100,
        'Final download progress should be 100%'
      );
    });
  });
});
