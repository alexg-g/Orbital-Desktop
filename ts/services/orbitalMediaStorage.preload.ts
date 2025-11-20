// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Storage Service
 *
 * Manages local storage of decrypted Orbital media files.
 *
 * Storage Layout:
 * - Location: userData/orbital-media/{first-2-chars}/{hash}
 * - Example: userData/orbital-media/ae/ae9b8c1f2d3e4f5a6b7c8d9e0f1a2b3c...
 *
 * Features:
 * - Store decrypted media for instant playback
 * - Read files for playback
 * - Delete files when needed
 * - Calculate storage usage
 * - Path validation for security
 *
 * Security:
 * - All paths validated to prevent directory traversal
 * - Media is decrypted on storage (encrypted at rest by SQLCipher references)
 */

import { join, normalize } from 'node:path';
import fse from 'fs-extra';

import { isPathInside } from '../util/isPathInside.node.js';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';

const log = createLogger('OrbitalMediaStorage');

/**
 * Get the user data path from window.SignalContext
 */
function getUserDataPath(): string {
  return window.SignalContext.getPath('userData');
}

/**
 * Get the root path for Orbital media storage
 */
export function getOrbitalMediaPath(): string {
  const userDataPath = getUserDataPath();
  return join(userDataPath, 'orbital-media');
}

/**
 * Get relative path for a media file based on its plaintext hash
 *
 * Uses the first 2 characters of the hash as a subdirectory for better
 * file system performance (similar to git's object storage pattern).
 *
 * @param plaintextHash - Hex-encoded SHA-256 hash of the plaintext media
 * @returns Relative path like "ae/ae9b8c1f2d3e4f5a6b7c8d9e0f1a2b3c..."
 */
export function getRelativePathForMedia(plaintextHash: string): string {
  if (!plaintextHash || plaintextHash.length < 2) {
    throw new Error('Invalid plaintext hash');
  }

  const prefix = plaintextHash.substring(0, 2).toLowerCase();
  return join(prefix, plaintextHash.toLowerCase());
}

/**
 * Get absolute path for a media file
 *
 * @param relativePath - Relative path from getRelativePathForMedia()
 * @returns Absolute path to the media file
 */
export function getAbsoluteOrbitalMediaPath(relativePath: string): string {
  const rootPath = getOrbitalMediaPath();
  const absolutePath = join(rootPath, relativePath);
  const normalized = normalize(absolutePath);

  if (!isPathInside(normalized, rootPath)) {
    throw new Error('Invalid relative path - directory traversal detected');
  }

  return normalized;
}

/**
 * Store decrypted media to local storage
 *
 * @param data - Decrypted media data
 * @param plaintextHash - Hex-encoded SHA-256 hash of the data
 * @returns Relative path where the file was stored
 */
export async function storeDecryptedMedia(
  data: Uint8Array,
  plaintextHash: string
): Promise<string> {
  const logId = `storeDecryptedMedia(${plaintextHash.substring(0, 8)}...)`;

  const relativePath = getRelativePathForMedia(plaintextHash);
  const absolutePath = getAbsoluteOrbitalMediaPath(relativePath);

  try {
    // Ensure directory exists
    await fse.ensureFile(absolutePath);

    // Write the file
    await fse.writeFile(absolutePath, Buffer.from(data));

    log.info(`${logId}: Stored ${data.byteLength} bytes at ${relativePath}`);

    return relativePath;
  } catch (error) {
    log.error(`${logId}: Failed to store media`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Read decrypted media from local storage
 *
 * @param localPath - Relative path to the media file
 * @returns Media data as Uint8Array
 * @throws Error if file doesn't exist or can't be read
 */
export async function readLocalMedia(localPath: string): Promise<Uint8Array> {
  const logId = `readLocalMedia(${localPath.substring(0, 20)}...)`;

  const absolutePath = getAbsoluteOrbitalMediaPath(localPath);

  try {
    const data = await fse.readFile(absolutePath);
    log.info(`${logId}: Read ${data.byteLength} bytes`);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn(`${logId}: File not found`);
      throw new Error(`Media file not found: ${localPath}`);
    }
    log.error(`${logId}: Failed to read media`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Check if a media file exists locally
 *
 * @param localPath - Relative path to the media file
 * @returns True if the file exists
 */
export async function doesOrbitalMediaExist(localPath: string): Promise<boolean> {
  const absolutePath = getAbsoluteOrbitalMediaPath(localPath);

  try {
    await fse.access(absolutePath, fse.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a media file from local storage
 *
 * @param localPath - Relative path to the media file
 */
export async function deleteLocalMedia(localPath: string): Promise<void> {
  const logId = `deleteLocalMedia(${localPath.substring(0, 20)}...)`;

  const absolutePath = getAbsoluteOrbitalMediaPath(localPath);

  try {
    await fse.unlink(absolutePath);
    log.info(`${logId}: Deleted media file`);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn(`${logId}: File already deleted or doesn't exist`);
      return;
    }
    log.error(`${logId}: Failed to delete media`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Get total storage usage for Orbital media
 *
 * Calculates the total size of all files in the orbital-media directory.
 *
 * @returns Total storage usage in bytes
 */
export async function getStorageUsage(): Promise<number> {
  const logId = 'getStorageUsage';
  const rootPath = getOrbitalMediaPath();

  try {
    // Check if directory exists
    const exists = await fse.pathExists(rootPath);
    if (!exists) {
      return 0;
    }

    // Calculate total size recursively
    let totalSize = 0;

    async function calculateDirSize(dirPath: string): Promise<void> {
      const entries = await fse.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await calculateDirSize(entryPath);
        } else if (entry.isFile()) {
          const stats = await fse.stat(entryPath);
          totalSize += stats.size;
        }
      }
    }

    await calculateDirSize(rootPath);

    log.info(`${logId}: Total storage usage: ${totalSize} bytes`);
    return totalSize;
  } catch (error) {
    log.error(`${logId}: Failed to calculate storage usage`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Get storage statistics for Orbital media
 *
 * @returns Object with file count and total size
 */
export async function getStorageStats(): Promise<{
  fileCount: number;
  totalSize: number;
}> {
  const logId = 'getStorageStats';
  const rootPath = getOrbitalMediaPath();

  try {
    const exists = await fse.pathExists(rootPath);
    if (!exists) {
      return { fileCount: 0, totalSize: 0 };
    }

    let fileCount = 0;
    let totalSize = 0;

    async function scanDir(dirPath: string): Promise<void> {
      const entries = await fse.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await scanDir(entryPath);
        } else if (entry.isFile()) {
          fileCount += 1;
          const stats = await fse.stat(entryPath);
          totalSize += stats.size;
        }
      }
    }

    await scanDir(rootPath);

    log.info(`${logId}: ${fileCount} files, ${totalSize} bytes total`);
    return { fileCount, totalSize };
  } catch (error) {
    log.error(`${logId}: Failed to get storage stats`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Clean up empty subdirectories in the orbital-media folder
 *
 * This helps keep the storage directory tidy after deletions.
 */
export async function cleanupEmptyDirectories(): Promise<void> {
  const logId = 'cleanupEmptyDirectories';
  const rootPath = getOrbitalMediaPath();

  try {
    const exists = await fse.pathExists(rootPath);
    if (!exists) {
      return;
    }

    const subdirs = await fse.readdir(rootPath, { withFileTypes: true });

    for (const subdir of subdirs) {
      if (!subdir.isDirectory()) {
        continue;
      }

      const subdirPath = join(rootPath, subdir.name);
      const contents = await fse.readdir(subdirPath);

      if (contents.length === 0) {
        await fse.rmdir(subdirPath);
        log.info(`${logId}: Removed empty directory: ${subdir.name}`);
      }
    }
  } catch (error) {
    log.error(`${logId}: Failed to cleanup directories`, Errors.toLogFormat(error));
    // Don't throw - this is a cleanup operation
  }
}

/**
 * Format bytes into human-readable string
 *
 * @param bytes - Number of bytes
 * @returns Formatted string like "1.5 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Ensure the orbital-media directory exists
 */
export async function ensureOrbitalMediaDirectory(): Promise<void> {
  const rootPath = getOrbitalMediaPath();
  await fse.ensureDir(rootPath);
}
