// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { OrbitalComposer } from './OrbitalComposer';
import { FunProvider } from '../fun/FunProvider.dom';
import { packs, recentStickers } from '../stickers/mocks.std';
import { MOCK_GIFS_PAGINATED_ONE_PAGE, MOCK_RECENT_EMOJIS } from '../fun/mocks.dom';
import { EmojiSkinTone } from '../fun/data/emojis.std';

const { i18n } = window.SignalContext;

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
          onSubmit={action('onSubmit')}
          i18n={i18n}
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
          replyContext={{
            author: 'Mom',
            body: 'Emma took her first steps today! So proud! 🎉',
          }}
          onSubmit={action('onSubmit')}
          i18n={i18n}
        />
      </div>
    </FunProvider>
  );
}
