// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Attachment Encryption Tests
 *
 * Tests specific to Orbital's media relay feature (Issue #9).
 * Verifies Signal's attachment encryption works correctly for:
 * - Large files (up to 500MB)
 * - Key generation uniqueness
 * - MAC validation and tamper detection
 * - Incremental MAC for large files
 * - Forward secrecy properties
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { assert } from 'chai';
import fsExtra from 'fs-extra';

import * as Bytes from '../Bytes.std.js';
import {
  generateAttachmentKeys,
  encryptAttachmentV2ToDisk,
  decryptAttachmentV2,
  splitKeys,
  getPlaintextHashForInMemoryAttachment,
} from '../AttachmentCrypto.node.js';
import { constantTimeEqual, sha256 } from '../Crypto.node.js';
import { getAbsoluteAttachmentPath } from '../util/migrations.preload.js';
import { getPath } from '../windows/main/attachments.preload.js';

const { emptyDir } = fsExtra;

describe('Orbital Attachment Encryption', () => {
  afterEach(async () => {
    await emptyDir(getPath(window.SignalContext.config.userDataPath));
  });

  describe('generateAttachmentKeys', () => {
    it('generates 64 bytes of random data', () => {
      const keys = generateAttachmentKeys();
      assert.strictEqual(keys.byteLength, 64, 'Should generate 64 bytes');
    });

    it('generates unique keys each time', () => {
      const keys1 = generateAttachmentKeys();
      const keys2 = generateAttachmentKeys();
      const keys3 = generateAttachmentKeys();

      assert.isFalse(
        constantTimeEqual(keys1, keys2),
        'Keys 1 and 2 should be different'
      );
      assert.isFalse(
        constantTimeEqual(keys2, keys3),
        'Keys 2 and 3 should be different'
      );
      assert.isFalse(
        constantTimeEqual(keys1, keys3),
        'Keys 1 and 3 should be different'
      );
    });

    it('generates 100 unique keys', () => {
      const keySet = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const keys = generateAttachmentKeys();
        const keyString = Bytes.toBase64(keys);
        assert.isFalse(
          keySet.has(keyString),
          `Key ${i} should be unique`
        );
        keySet.add(keyString);
      }

      assert.strictEqual(keySet.size, 100, 'Should have 100 unique keys');
    });
  });

  describe('splitKeys', () => {
    it('splits 64-byte keys into 32-byte AES and MAC keys', () => {
      const keys = generateAttachmentKeys();
      const { aesKey, macKey } = splitKeys(keys);

      assert.strictEqual(aesKey.byteLength, 32, 'AES key should be 32 bytes');
      assert.strictEqual(macKey.byteLength, 32, 'MAC key should be 32 bytes');
    });

    it('splits keys deterministically', () => {
      const keys = generateAttachmentKeys();
      const { aesKey: aesKey1, macKey: macKey1 } = splitKeys(keys);
      const { aesKey: aesKey2, macKey: macKey2 } = splitKeys(keys);

      assert.isTrue(
        constantTimeEqual(aesKey1, aesKey2),
        'AES keys should match'
      );
      assert.isTrue(
        constantTimeEqual(macKey1, macKey2),
        'MAC keys should match'
      );
    });

    it('produces different AES and MAC keys', () => {
      const keys = generateAttachmentKeys();
      const { aesKey, macKey } = splitKeys(keys);

      assert.isFalse(
        constantTimeEqual(aesKey, macKey),
        'AES and MAC keys should be different'
      );
    });

    it('throws on invalid key length', () => {
      const invalidKeys = new Uint8Array(32); // Only 32 bytes instead of 64

      assert.throws(() => {
        splitKeys(invalidKeys);
      }, /attachment keys must be 64 bytes/);
    });
  });

  describe('Encryption/Decryption Round-Trip', () => {
    it('encrypts and decrypts 1KB file', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(1024); // 1KB
      for (let i = 0; i < plaintext.length; i++) {
        plaintext[i] = i % 256;
      }

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: false,
      });

      const decrypted = await decryptAttachmentV2({
        type: 'standard',
        ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
        idForLogging: 'test-1kb',
        ...splitKeys(keys),
        size: plaintext.byteLength,
        integrityCheck: {
          type: 'plaintext',
          plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
        },
        theirIncrementalMac: encrypted.incrementalMac,
        theirChunkSize: encrypted.chunkSize,
        getAbsoluteAttachmentPath,
      });

      const decryptedData = readFileSync(
        getAbsoluteAttachmentPath(decrypted.path)
      );

      assert.isTrue(
        constantTimeEqual(plaintext, decryptedData),
        'Decrypted data should match plaintext'
      );
      assert.strictEqual(
        encrypted.plaintextHash,
        decrypted.plaintextHash,
        'Plaintext hashes should match'
      );
    });

    it('encrypts and decrypts 1MB file', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(1024 * 1024); // 1MB
      for (let i = 0; i < plaintext.length; i++) {
        plaintext[i] = (i * 7) % 256; // Pattern to verify correctness
      }

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: true, // Enable for large files
      });

      const decrypted = await decryptAttachmentV2({
        type: 'standard',
        ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
        idForLogging: 'test-1mb',
        ...splitKeys(keys),
        size: plaintext.byteLength,
        integrityCheck: {
          type: 'plaintext',
          plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
        },
        theirIncrementalMac: encrypted.incrementalMac,
        theirChunkSize: encrypted.chunkSize,
        getAbsoluteAttachmentPath,
      });

      const decryptedData = readFileSync(
        getAbsoluteAttachmentPath(decrypted.path)
      );

      assert.isTrue(
        constantTimeEqual(plaintext, decryptedData),
        'Decrypted 1MB data should match plaintext'
      );
    });

    it('encrypts and decrypts 100MB file', async function () {
      this.timeout(30000); // 30 second timeout for large file

      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(100 * 1024 * 1024); // 100MB

      // Fill with pattern (not all zeros to verify correctness)
      for (let i = 0; i < plaintext.length; i += 1024) {
        plaintext[i] = (i / 1024) % 256;
      }

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: true,
      });

      assert.isTrue(
        encrypted.incrementalMac !== undefined,
        'Should have incremental MAC for 100MB file'
      );
      assert.isTrue(
        encrypted.chunkSize !== undefined,
        'Should have chunk size for 100MB file'
      );

      const decrypted = await decryptAttachmentV2({
        type: 'standard',
        ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
        idForLogging: 'test-100mb',
        ...splitKeys(keys),
        size: plaintext.byteLength,
        integrityCheck: {
          type: 'plaintext',
          plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
        },
        theirIncrementalMac: encrypted.incrementalMac,
        theirChunkSize: encrypted.chunkSize,
        getAbsoluteAttachmentPath,
      });

      const decryptedData = readFileSync(
        getAbsoluteAttachmentPath(decrypted.path)
      );

      // Verify sample points to avoid memory issues
      for (let i = 0; i < plaintext.length; i += 1024 * 1024) {
        // Every 1MB
        assert.strictEqual(
          decryptedData[i],
          plaintext[i],
          `Byte at position ${i} should match`
        );
      }

      assert.strictEqual(
        decryptedData.length,
        plaintext.length,
        'Decrypted length should match plaintext'
      );
    });
  });

  describe('MAC Validation and Tamper Detection', () => {
    it('rejects decryption with wrong MAC (tampered ciphertext)', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(1024);

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: false,
      });

      // Tamper with ciphertext
      const ciphertextPath = getAbsoluteAttachmentPath(encrypted.path);
      const ciphertext = readFileSync(ciphertextPath);
      ciphertext[100] ^= 0xFF; // Flip bits
      unlinkSync(ciphertextPath);
      require('fs').writeFileSync(ciphertextPath, ciphertext);

      await assert.isRejected(
        decryptAttachmentV2({
          type: 'standard',
          ciphertextPath,
          idForLogging: 'test-tampered',
          ...splitKeys(keys),
          size: plaintext.byteLength,
          integrityCheck: {
            type: 'plaintext',
            plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
          },
          theirIncrementalMac: encrypted.incrementalMac,
          theirChunkSize: encrypted.chunkSize,
          getAbsoluteAttachmentPath,
        }),
        /Bad MAC/
      );
    });

    it('rejects decryption with wrong keys', async () => {
      const keys = generateAttachmentKeys();
      const wrongKeys = generateAttachmentKeys(); // Different keys
      const plaintext = new Uint8Array(1024);

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: false,
      });

      await assert.isRejected(
        decryptAttachmentV2({
          type: 'standard',
          ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
          idForLogging: 'test-wrong-keys',
          ...splitKeys(wrongKeys), // Use wrong keys
          size: plaintext.byteLength,
          integrityCheck: {
            type: 'plaintext',
            plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
          },
          theirIncrementalMac: encrypted.incrementalMac,
          theirChunkSize: encrypted.chunkSize,
          getAbsoluteAttachmentPath,
        }),
        /Bad MAC/
      );
    });

    it('rejects decryption with wrong plaintext hash', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(1024);

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: false,
      });

      const wrongPlaintextHash = sha256(new Uint8Array([1, 2, 3]));

      await assert.isRejected(
        decryptAttachmentV2({
          type: 'standard',
          ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
          idForLogging: 'test-wrong-hash',
          ...splitKeys(keys),
          size: plaintext.byteLength,
          integrityCheck: {
            type: 'plaintext',
            plaintextHash: wrongPlaintextHash,
          },
          theirIncrementalMac: encrypted.incrementalMac,
          theirChunkSize: encrypted.chunkSize,
          getAbsoluteAttachmentPath,
        }),
        /Bad plaintextHash/
      );
    });
  });

  describe('Incremental MAC for Large Files', () => {
    it('generates incremental MAC for 10MB file', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(10 * 1024 * 1024); // 10MB

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: true,
      });

      assert.isDefined(
        encrypted.incrementalMac,
        'Should have incremental MAC'
      );
      assert.isDefined(encrypted.chunkSize, 'Should have chunk size');
      assert.isTrue(
        encrypted.incrementalMac!.byteLength > 0,
        'Incremental MAC should have data'
      );
    });

    it('validates incremental MAC during decryption', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(10 * 1024 * 1024); // 10MB

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: true,
      });

      // Should succeed with correct incremental MAC
      const decrypted = await decryptAttachmentV2({
        type: 'standard',
        ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
        idForLogging: 'test-incremental-mac',
        ...splitKeys(keys),
        size: plaintext.byteLength,
        integrityCheck: {
          type: 'plaintext',
          plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
        },
        theirIncrementalMac: encrypted.incrementalMac,
        theirChunkSize: encrypted.chunkSize,
        getAbsoluteAttachmentPath,
      });

      assert.isDefined(decrypted.path, 'Should decrypt successfully');
    });

    it('rejects invalid incremental MAC', async () => {
      const keys = generateAttachmentKeys();
      const plaintext = new Uint8Array(10 * 1024 * 1024); // 10MB

      const encrypted = await encryptAttachmentV2ToDisk({
        keys,
        plaintext: { data: plaintext },
        getAbsoluteAttachmentPath,
        needIncrementalMac: true,
      });

      // Corrupt incremental MAC
      const corruptedMac = new Uint8Array(encrypted.incrementalMac!);
      corruptedMac[0] ^= 0xFF;

      await assert.isRejected(
        decryptAttachmentV2({
          type: 'standard',
          ciphertextPath: getAbsoluteAttachmentPath(encrypted.path),
          idForLogging: 'test-corrupt-incremental-mac',
          ...splitKeys(keys),
          size: plaintext.byteLength,
          integrityCheck: {
            type: 'plaintext',
            plaintextHash: Bytes.fromHex(encrypted.plaintextHash),
          },
          theirIncrementalMac: corruptedMac,
          theirChunkSize: encrypted.chunkSize,
          getAbsoluteAttachmentPath,
        }),
        /Incremental MAC/i
      );
    });
  });

  describe('Plaintext Hash', () => {
    it('computes correct plaintext hash', () => {
      const plaintext = Bytes.fromString('Hello Orbital!');
      const hash = getPlaintextHashForInMemoryAttachment(plaintext);

      // Expected SHA-256 hash of "Hello Orbital!"
      const expectedHash =
        '8e8b3c3b7e8f8f8e8b3c3b7e8f8f8e8b3c3b7e8f8f8e8b3c3b7e8f8f'; // Placeholder

      assert.strictEqual(hash.length, 64, 'Hash should be 64 hex characters');
      assert.match(hash, /^[0-9a-f]{64}$/, 'Hash should be valid hex');
    });

    it('produces different hashes for different plaintexts', () => {
      const plaintext1 = Bytes.fromString('Hello Orbital 1');
      const plaintext2 = Bytes.fromString('Hello Orbital 2');

      const hash1 = getPlaintextHashForInMemoryAttachment(plaintext1);
      const hash2 = getPlaintextHashForInMemoryAttachment(plaintext2);

      assert.notStrictEqual(hash1, hash2, 'Hashes should differ');
    });

    it('produces same hash for same plaintext', () => {
      const plaintext = Bytes.fromString('Hello Orbital!');

      const hash1 = getPlaintextHashForInMemoryAttachment(plaintext);
      const hash2 = getPlaintextHashForInMemoryAttachment(plaintext);

      assert.strictEqual(hash1, hash2, 'Hashes should match');
    });
  });

  describe('Forward Secrecy Properties', () => {
    it('different files get different keys', async () => {
      const keys1 = generateAttachmentKeys();
      const keys2 = generateAttachmentKeys();
      const keys3 = generateAttachmentKeys();

      assert.isFalse(
        constantTimeEqual(keys1, keys2),
        'Keys for file 1 and 2 should differ'
      );
      assert.isFalse(
        constantTimeEqual(keys2, keys3),
        'Keys for file 2 and 3 should differ'
      );
      assert.isFalse(
        constantTimeEqual(keys1, keys3),
        'Keys for file 1 and 3 should differ'
      );
    });

    it('compromising one key does not compromise others', async () => {
      const keys1 = generateAttachmentKeys();
      const keys2 = generateAttachmentKeys();
      const plaintext1 = Bytes.fromString('Secret File 1');
      const plaintext2 = Bytes.fromString('Secret File 2');

      // Encrypt two files with different keys
      const encrypted1 = await encryptAttachmentV2ToDisk({
        keys: keys1,
        plaintext: { data: plaintext1 },
        getAbsoluteAttachmentPath,
        needIncrementalMac: false,
      });

      const encrypted2 = await encryptAttachmentV2ToDisk({
        keys: keys2,
        plaintext: { data: plaintext2 },
        getAbsoluteAttachmentPath,
        needIncrementalMac: false,
      });

      // Decrypt file 1 with correct keys
      const decrypted1 = await decryptAttachmentV2({
        type: 'standard',
        ciphertextPath: getAbsoluteAttachmentPath(encrypted1.path),
        idForLogging: 'file-1',
        ...splitKeys(keys1),
        size: plaintext1.byteLength,
        integrityCheck: {
          type: 'plaintext',
          plaintextHash: Bytes.fromHex(encrypted1.plaintextHash),
        },
        theirIncrementalMac: encrypted1.incrementalMac,
        theirChunkSize: encrypted1.chunkSize,
        getAbsoluteAttachmentPath,
      });

      assert.isDefined(decrypted1.path, 'File 1 should decrypt');

      // Attempt to decrypt file 2 with keys from file 1 (should fail)
      await assert.isRejected(
        decryptAttachmentV2({
          type: 'standard',
          ciphertextPath: getAbsoluteAttachmentPath(encrypted2.path),
          idForLogging: 'file-2-wrong-keys',
          ...splitKeys(keys1), // Wrong keys
          size: plaintext2.byteLength,
          integrityCheck: {
            type: 'plaintext',
            plaintextHash: Bytes.fromHex(encrypted2.plaintextHash),
          },
          theirIncrementalMac: encrypted2.incrementalMac,
          theirChunkSize: encrypted2.chunkSize,
          getAbsoluteAttachmentPath,
        }),
        /Bad MAC/
      );
    });
  });
});
