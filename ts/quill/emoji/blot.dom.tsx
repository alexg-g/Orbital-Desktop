// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import EmbedBlot from '@signalapp/quill-cjs/blots/embed.js';
import { strictAssert } from '../../util/assert.std.js';
import {
  getEmojiVariantByKey,
  getEmojiVariantKeyByValue,
  isEmojiVariantValue,
  type EmojiVariantKey,
} from '../../components/fun/data/emojis.std.js';
import {
  createStaticEmojiBlot,
  FUN_STATIC_EMOJI_CLASS,
} from '../../components/fun/FunEmoji.dom.js';
import { createLogger } from '../../logging/log.std.js';

const log = createLogger('EmojiBlot');

// the DOM structure of this EmojiBlot should match the other emoji implementations:
// ts/components/fun/FunEmoji.tsx

export type EmojiBlotValue = Readonly<{
  value: string;
  source?: string;
}>;

export class EmojiBlot extends EmbedBlot {
  static override blotName = 'emoji';

  // See `createStaticEmojiBlot()`
  static override tagName = 'img';

  static override className = FUN_STATIC_EMOJI_CLASS;

  static override create({ value: emoji, source }: EmojiBlotValue): Node {
    const node = super.create(undefined) as HTMLImageElement;

    log.info('EmojiBlot.create:', {
      emoji,
      emojiLength: emoji.length,
      codePoints: [...emoji].map(c => c.codePointAt(0)?.toString(16)),
      isValid: isEmojiVariantValue(emoji),
    });

    strictAssert(isEmojiVariantValue(emoji), 'Value is not a known emoji');
    const variantKey = getEmojiVariantKeyByValue(emoji);
    const variant = getEmojiVariantByKey(variantKey);

    log.info('EmojiBlot.create variant:', {
      variantKey,
      variantValue: variant.value,
      sheetX: variant.sheetX,
      sheetY: variant.sheetY,
    });

    createStaticEmojiBlot(node, {
      role: 'img',
      'aria-label': emoji,
      emoji: variant,
      size: 20,
    });
    // Store the variant key instead of the emoji value to avoid Unicode corruption
    // The variant key is just hex codes (e.g., "1F635-200D-1F4AB") which are ASCII-safe
    node.setAttribute('data-emoji-key', variantKey);
    node.setAttribute('data-source', source ?? '');

    return node;
  }

  static override value(node: HTMLElement): EmojiBlotValue | undefined {
    const { emojiKey, emoji, source } = node.dataset;

    // Prefer emojiKey (new format) over emoji (old format) to avoid Unicode corruption
    if (emojiKey) {
      // New format: reconstruct from key
      const variant = getEmojiVariantByKey(emojiKey as EmojiVariantKey);
      log.info('EmojiBlot.value (from key):', {
        emojiKey,
        reconstructedValue: variant.value,
        valueLength: variant.value.length,
      });
      return { value: variant.value, source };
    }

    // Backward compatibility: old format with emoji value directly
    if (emoji) {
      log.info('EmojiBlot.value (from emoji - legacy):', {
        emoji,
        emojiLength: emoji.length,
      });
      return { value: emoji, source };
    }

    throw new Error(
      `Failed to make EmojiBlot - missing both data-emoji-key and data-emoji`
    );
  }
}
