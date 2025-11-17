// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Basic test to verify Orbital Media services compile and load correctly
 * Tests that Node.js https/http modules work in preload context
 */

import { assert } from 'chai';
import * as https from 'node:https';
import * as http from 'node:http';

describe('Orbital Media Services - Basic Integration', () => {
  it('can import Node.js https module in preload context', () => {
    assert.isDefined(https, 'https module should be available');
    assert.isFunction(https.request, 'https.request should be a function');
  });

  it('can import Node.js http module in preload context', () => {
    assert.isDefined(http, 'http module should be available');
    assert.isFunction(http.request, 'http.request should be a function');
  });

  it('can import Orbital Media upload service', async () => {
    const { uploadMediaToOrbital } = await import(
      '../../services/orbitalMediaUpload.preload.js'
    );
    assert.isFunction(
      uploadMediaToOrbital,
      'uploadMediaToOrbital should be a function'
    );
  });

  it('can import Orbital Media download service', async () => {
    const { downloadMediaFromOrbital } = await import(
      '../../services/orbitalMediaDownload.preload.js'
    );
    assert.isFunction(
      downloadMediaFromOrbital,
      'downloadMediaFromOrbital should be a function'
    );
  });
});
