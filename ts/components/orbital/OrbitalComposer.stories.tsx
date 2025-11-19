// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { OrbitalComposer } from './OrbitalComposer';
import type { QuotaInfo } from '../../services/orbitalQuota.preload';
import type { UploadMediaFunction } from './OrbitalComposer';
import { FunProvider } from '../fun/FunProvider.dom';
import { packs, recentStickers } from '../stickers/mocks.std';
import { MOCK_GIFS_PAGINATED_ONE_PAGE, MOCK_RECENT_EMOJIS } from '../fun/mocks.dom';
import { EmojiSkinTone } from '../fun/data/emojis.std';

const { i18n } = window.SignalContext;

// Mock implementations for Node.js dependencies
const mockGetQuotaInfo = async (_groupId: string): Promise<QuotaInfo> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    groupId: _groupId,
    storageUsed: 2.5 * 1024 * 1024 * 1024, // 2.5 GB used
    storageLimit: 10 * 1024 * 1024 * 1024, // 10 GB total
    filesUsed: 25,
    filesLimit: 100,
    storagePercentUsed: 25,
    filesPercentUsed: 25,
    isNearLimit: false,
    canUpload: true,
  };
};

const mockCheckUploadAllowed = async (_groupId: string, _fileSizeBytes: number) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    allowed: true,
    quotaInfo: await mockGetQuotaInfo(_groupId),
  };
};

const mockFormatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

const mockUploadMedia: UploadMediaFunction = async ({ onProgress }) => {
  // Simulate upload with progress updates
  for (let progress = 0; progress <= 100; progress += 10) {
    onProgress(progress);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  action('uploadMedia')('Upload complete');
  return {
    mediaId: `mock-media-${Date.now()}`,
  };
};

const mockGetAbsoluteAttachmentPath = (relativePath: string): string => {
  return `/mock/attachments/path/${relativePath}`;
};

export default {
  title: 'Orbital/Composer',
  component: OrbitalComposer,
} satisfies Meta;

/**
 * Thread Mode - Create new threads
 */
export function ThreadMode(): JSX.Element {
  const [skinTone, setSkinTone] = React.useState(EmojiSkinTone.None);

  return (
    <FunProvider
      i18n={i18n}
      recentEmojis={MOCK_RECENT_EMOJIS}
      recentStickers={recentStickers}
      recentGifs={[]}
      emojiSkinToneDefault={skinTone}
      onEmojiSkinToneDefaultChange={setSkinTone}
      onOpenCustomizePreferredReactionsModal={() => null}
      onSelectEmoji={action('onSelectEmoji')}
      installedStickerPacks={packs}
      showStickerPickerHint={false}
      onClearStickerPickerHint={() => null}
      onSelectSticker={action('onSelectSticker')}
      fetchGifsSearch={() => Promise.resolve(MOCK_GIFS_PAGINATED_ONE_PAGE)}
      fetchGifsFeatured={() => Promise.resolve(MOCK_GIFS_PAGINATED_ONE_PAGE)}
      fetchGif={() => Promise.resolve(new Blob([new Uint8Array(1)]))}
      onSelectGif={action('onSelectGif')}
    >
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <OrbitalComposer
          mode="thread"
          groupId="mock-group-id"
          onSubmit={action('onSubmit')}
          i18n={i18n}
          getQuotaInfo={mockGetQuotaInfo}
          checkUploadAllowed={mockCheckUploadAllowed}
          formatBytes={mockFormatBytes}
          uploadMedia={mockUploadMedia}
          getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
        />
      </div>
    </FunProvider>
  );
}

/**
 * Reply Mode - Reply to posts
 */
export function ReplyMode(): JSX.Element {
  const [skinTone, setSkinTone] = React.useState(EmojiSkinTone.None);

  return (
    <FunProvider
      i18n={i18n}
      recentEmojis={MOCK_RECENT_EMOJIS}
      recentStickers={recentStickers}
      recentGifs={[]}
      emojiSkinToneDefault={skinTone}
      onEmojiSkinToneDefaultChange={setSkinTone}
      onOpenCustomizePreferredReactionsModal={() => null}
      onSelectEmoji={action('onSelectEmoji')}
      installedStickerPacks={packs}
      showStickerPickerHint={false}
      onClearStickerPickerHint={() => null}
      onSelectSticker={action('onSelectSticker')}
      fetchGifsSearch={() => Promise.resolve(MOCK_GIFS_PAGINATED_ONE_PAGE)}
      fetchGifsFeatured={() => Promise.resolve(MOCK_GIFS_PAGINATED_ONE_PAGE)}
      fetchGif={() => Promise.resolve(new Blob([new Uint8Array(1)]))}
      onSelectGif={action('onSelectGif')}
    >
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <OrbitalComposer
          mode="reply"
          groupId="mock-group-id"
          threadId="mock-thread-id"
          replyContext={{
            author: 'Mom',
            body: 'Emma took her first steps today! So proud! 🎉',
          }}
          onSubmit={action('onSubmit')}
          i18n={i18n}
          getQuotaInfo={mockGetQuotaInfo}
          checkUploadAllowed={mockCheckUploadAllowed}
          formatBytes={mockFormatBytes}
          uploadMedia={mockUploadMedia}
          getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
        />
      </div>
    </FunProvider>
  );
}
