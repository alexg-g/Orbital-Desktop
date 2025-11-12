// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quill, { Delta } from '@signalapp/quill-cjs';
import { EmojiBlot } from '../../quill/emoji/blot.dom';

// Register EmojiBlot at module level to ensure it's available before any Quill instances are created
// This prevents race conditions in Storybook and ensures complex emojis (ZWJ sequences) render correctly
Quill.register('formats/emoji', EmojiBlot, true);

export type OrbitalQuillEditorProps = {
  placeholder?: string;
  initialMarkdown?: string;
  onChange?: (markdown: string) => void;
  onTextChange?: (text: string) => void;
  maxLength?: number;
  className?: string;
  readOnly?: boolean;
  onReady?: (editor: {
    insertText: (text: string) => void;
    insertEmoji: (emoji: string) => void;
  }) => void;
};

/**
 * OrbitalQuillEditor - Lightweight WYSIWYG editor with markdown output
 *
 * Features:
 * - Retro toolbar (Bold, Italic, Underline, Lists, Quote)
 * - Stores as markdown for portability
 * - Minimal bundle size (uses Signal's existing Quill)
 * - Classic phpBB/vBulletin styling
 *
 * Formatting support:
 * - Bold (**text**)
 * - Italic (*text*)
 * - Underline (HTML fallback: <u>text</u>)
 * - Bulleted list (- item)
 * - Numbered list (1. item)
 * - Blockquote (> quote)
 */
export function OrbitalQuillEditor({
  placeholder = 'Write your message...',
  initialMarkdown = '',
  onChange,
  onTextChange,
  maxLength,
  className = '',
  readOnly = false,
  onReady,
}: OrbitalQuillEditorProps): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const [characterCount, setCharacterCount] = useState(0);

  // Store latest callbacks in refs to avoid re-initializing Quill
  const onChangeRef = useRef(onChange);
  const onTextChangeRef = useRef(onTextChange);

  // Update callback refs when they change
  useEffect(() => {
    onChangeRef.current = onChange;
    onTextChangeRef.current = onTextChange;
  }, [onChange, onTextChange]);

  // Initialize Quill instance ONCE
  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    // Prevent double initialization (e.g., from React StrictMode)
    if (quillRef.current) {
      return;
    }

    const element = editorRef.current;

    const quill = new Quill(element, {
      theme: 'snow',
      readOnly,
      placeholder,
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote'],
        ],
        clipboard: {
          matchVisual: false,
        },
      },
      formats: ['bold', 'italic', 'underline', 'list', 'blockquote', 'emoji'],
    });

    quillRef.current = quill;

    // Set initial content from markdown
    if (initialMarkdown) {
      const delta = markdownToDelta(initialMarkdown);
      quill.setContents(delta);
    }

    // Expose editor API to parent
    if (onReady) {
      onReady({
        insertText: (text: string) => {
          const selection = quill.getSelection();
          const index = selection ? selection.index : quill.getLength() - 1;
          quill.insertText(index, text);
          quill.setSelection(index + text.length);
        },
        insertEmoji: (emoji: string) => {
          // Insert emoji using EmojiBlot to preserve complex emojis with ZWJ sequences
          const selection = quill.getSelection();
          const index = selection ? selection.index : quill.getLength() - 1;

          // Use EmojiBlot format (same as CompositionInput) to properly handle complex emojis
          const delta = new Delta()
            .retain(index)
            .insert({ emoji: { value: emoji } });

          quill.updateContents(delta, 'user');

          // Move cursor to after the emoji
          // EmojiBlot is treated as a single character position in Quill
          quill.setSelection(index + 1, 0, 'user');
        },
      });
    }

    // Listen for text changes
    quill.on('text-change', () => {
      const text = quill.getText();
      const trimmedText = text.trim();
      setCharacterCount(trimmedText.length);

      // Use refs to get latest callbacks
      if (onChangeRef.current) {
        const delta = quill.getContents();
        const markdown = deltaToMarkdown(delta);
        onChangeRef.current(markdown);
      }

      if (onTextChangeRef.current) {
        onTextChangeRef.current(trimmedText);
      }
    });

    // Cleanup: only run on true unmount
    return () => {
      if (quillRef.current) {
        // Remove all event listeners
        quillRef.current.off('text-change');

        // Clear the ref
        quillRef.current = null;
      }

      // Clean up DOM - Quill creates elements as SIBLINGS
      if (editorRef.current) {
        const container = editorRef.current;

        // Remove the toolbar (Quill inserts it as previousSibling)
        const toolbar = container.previousSibling;
        if (toolbar && toolbar instanceof Element && toolbar.classList.contains('ql-toolbar')) {
          toolbar.parentNode?.removeChild(toolbar);
        }

        // Remove all child nodes from the container
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        // Remove all Quill classes from the container
        container.className = container.className.split(' ').filter(c => !c.startsWith('ql-')).join(' ');
      }
    };
    // Empty dependency array = only run once on mount
  }, []);

  // Handle max length enforcement
  useEffect(() => {
    if (!quillRef.current || !maxLength) {
      return;
    }

    const quill = quillRef.current;

    const handleTextChange = (delta: Delta, oldDelta: Delta, source: string) => {
      if (source === 'user') {
        const text = quill.getText().trim();
        if (text.length > maxLength) {
          // Undo the change
          quill.setContents(oldDelta);
        }
      }
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
    };
  }, [maxLength]);

  const getMarkdown = useCallback((): string => {
    if (!quillRef.current) {
      return '';
    }
    return deltaToMarkdown(quillRef.current.getContents());
  }, []);

  const getText = useCallback((): string => {
    if (!quillRef.current) {
      return '';
    }
    return quillRef.current.getText().trim();
  }, []);

  return (
    <div className={`OrbitalQuillEditor ${className}`}>
      <div ref={editorRef} className="OrbitalQuillEditor__editor" />
      {maxLength && (
        <div className="OrbitalQuillEditor__counter">
          <span
            className={
              characterCount >= maxLength * 0.9
                ? 'OrbitalQuillEditor__counter--warning'
                : ''
            }
          >
            {characterCount} / {maxLength}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Convert Quill Delta to Markdown
 *
 * Supports:
 * - Bold: **text**
 * - Italic: *text*
 * - Underline: <u>text</u> (HTML fallback, not pure markdown)
 * - Bulleted list: - item
 * - Numbered list: 1. item
 * - Blockquote: > quote
 */
function deltaToMarkdown(delta: Delta): string {
  const ops = delta.ops || [];
  let markdown = '';
  let listIndex = 1;
  let isStartOfLine = true;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (typeof op.insert !== 'string') {
      continue;
    }

    let text = op.insert;

    // Check if the next op (newline) has list/blockquote formatting
    const nextOp = i + 1 < ops.length ? ops[i + 1] : null;
    const nextIsFormattedNewline =
      nextOp &&
      typeof nextOp.insert === 'string' &&
      nextOp.insert === '\n' &&
      nextOp.attributes &&
      (nextOp.attributes.list || nextOp.attributes.blockquote);

    // If we're at the start of a line and the next newline has list/blockquote formatting,
    // add the appropriate prefix
    if (isStartOfLine && nextIsFormattedNewline && text !== '\n') {
      const { list, blockquote } = nextOp.attributes || {};

      if (list === 'ordered') {
        markdown += `${listIndex}. `;
        listIndex++;
      } else if (list === 'bullet') {
        markdown += '- ';
      } else if (blockquote) {
        markdown += '> ';
      }
      isStartOfLine = false;
    }

    // Apply inline formatting (but not to newlines)
    if (op.attributes && text !== '\n') {
      const { bold, italic, underline } = op.attributes;

      if (bold) {
        text = `**${text}**`;
      }
      if (italic) {
        text = `*${text}*`;
      }
      if (underline) {
        text = `<u>${text}</u>`;
      }
    }

    markdown += text;

    // Track when we're at the start of a new line
    if (text === '\n') {
      isStartOfLine = true;

      // Reset list index if we're no longer in a list
      if (!nextIsFormattedNewline) {
        listIndex = 1;
      }
    }
  }

  return markdown.trim();
}

/**
 * Convert Markdown to Quill Delta
 *
 * Simple parser for basic markdown syntax
 * NOTE: This is a minimal implementation. For production,
 * consider using a proper markdown parser like `marked`
 */
function markdownToDelta(markdown: string): Delta {
  const delta = new Delta();
  const lines = markdown.split('\n');

  for (const line of lines) {
    // Blockquote
    if (line.startsWith('> ')) {
      delta.insert(line.substring(2));
      delta.insert('\n', { blockquote: true });
      continue;
    }

    // Ordered list
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      delta.insert(orderedMatch[2]);
      delta.insert('\n', { list: 'ordered' });
      continue;
    }

    // Bullet list
    if (line.startsWith('- ')) {
      delta.insert(line.substring(2));
      delta.insert('\n', { list: 'bullet' });
      continue;
    }

    // Inline formatting (bold, italic, underline)
    let processedLine = line;
    const segments: Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean }> = [];

    // Simple regex-based parsing (not perfect, but good enough for MVP)
    // TODO: Use a proper markdown parser for production
    const boldRegex = /\*\*(.+?)\*\*/g;
    const italicRegex = /\*(.+?)\*/g;
    const underlineRegex = /<u>(.+?)<\/u>/g;

    let lastIndex = 0;
    let match;

    // Extract bold segments
    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: line.substring(lastIndex, match.index) });
      }
      segments.push({ text: match[1], bold: true });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      segments.push({ text: line.substring(lastIndex) });
    }

    // Insert segments
    for (const segment of segments) {
      const attrs: Record<string, boolean> = {};
      if (segment.bold) attrs.bold = true;
      if (segment.italic) attrs.italic = true;
      if (segment.underline) attrs.underline = true;

      delta.insert(segment.text, Object.keys(attrs).length > 0 ? attrs : undefined);
    }

    delta.insert('\n');
  }

  return delta;
}
