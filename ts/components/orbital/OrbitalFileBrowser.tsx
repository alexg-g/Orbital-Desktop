// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * OrbitalFileBrowser - Browse aggregated local media
 *
 * Displays media from both Orbital's distributed media system and Signal's
 * legacy message attachments. Features:
 * - Filter by orbit/group
 * - Filter by media type (images, videos, other)
 * - Sort chronologically (newest/oldest)
 * - Infinite scroll with IntersectionObserver
 * - Grouped by date
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GroupInfo } from '../../services/orbitalGroups.preload';
import type {
  OrbitalFileBrowserItem as FileBrowserItemType,
  OrbitalFileBrowserMediaType,
  OrbitalFileBrowserSortOrder,
  OrbitalFileBrowserCursor,
} from '../../types/OrbitalFileBrowser.std';
import { FILE_BROWSER_PAGE_SIZE } from '../../types/OrbitalFileBrowser.std';
import {
  getFileBrowserMedia,
  groupMediaItemsByDate,
} from '../../services/orbitalFileBrowser.preload';
import { OrbitalFileBrowserItem } from './OrbitalFileBrowserItem';

export type OrbitalFileBrowserProps = {
  /** List of all groups user is a member of */
  groups: GroupInfo[];
  /** Currently selected group ID (null = all groups) */
  selectedGroupId?: string | null;
  /** Callback when user selects a different orbit */
  onSelectOrbit?: (groupId: string) => void;
  /** Callback when user clicks on a media item */
  onItemClick?: (item: FileBrowserItemType) => void;
  /** Function to convert relative paths to absolute paths */
  getAbsoluteAttachmentPath?: (relativePath: string) => string;
};

const MEDIA_TYPE_OPTIONS: Array<{
  value: OrbitalFileBrowserMediaType;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
  { value: 'other', label: 'Files' },
];

export function OrbitalFileBrowser({
  groups,
  selectedGroupId,
  onSelectOrbit,
  onItemClick,
  getAbsoluteAttachmentPath,
}: OrbitalFileBrowserProps): JSX.Element {
  // Filter state
  const [mediaType, setMediaType] = useState<OrbitalFileBrowserMediaType>('all');
  const [sortOrder, setSortOrder] = useState<OrbitalFileBrowserSortOrder>('newest');

  // Data state
  const [items, setItems] = useState<FileBrowserItemType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<OrbitalFileBrowserCursor | undefined>();
  const [error, setError] = useState<string | null>(null);

  // Ref for intersection observer
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Load initial data when filters change
  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      setError(null);
      setItems([]);
      setCursor(undefined);
      setHasMore(true);

      try {
        const result = await getFileBrowserMedia({
          groupId: selectedGroupId ?? undefined,
          mediaType,
          sortOrder,
          limit: FILE_BROWSER_PAGE_SIZE,
        });

        setItems(result.items);
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load media';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    loadInitialData();
  }, [selectedGroupId, mediaType, sortOrder]);

  // Load more data when scrolling
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !cursor) return;

    setIsLoading(true);

    try {
      const result = await getFileBrowserMedia({
        groupId: selectedGroupId ?? undefined,
        mediaType,
        sortOrder,
        cursor,
        limit: FILE_BROWSER_PAGE_SIZE,
      });

      setItems(prev => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setCursor(result.nextCursor);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more media';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, cursor, selectedGroupId, mediaType, sortOrder]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreElement);

    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  // Handle orbit change
  const handleOrbitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newGroupId = e.target.value;
      if (onSelectOrbit && newGroupId) {
        onSelectOrbit(newGroupId);
      }
    },
    [onSelectOrbit]
  );

  // Handle item click
  const handleItemClick = useCallback(
    (item: FileBrowserItemType) => {
      if (onItemClick) {
        onItemClick(item);
      }
    },
    [onItemClick]
  );

  // Group items by date for display
  const groupedItems = groupMediaItemsByDate(items);

  return (
    <div className="OrbitalFileBrowser">
      {/* Filter bar */}
      <div className="OrbitalFileBrowser__filters">
        {/* Orbit selector */}
        <div className="OrbitalFileBrowser__filter-group">
          <label className="OrbitalFileBrowser__filter-label">Orbit</label>
          <select
            className="OrbitalFileBrowser__select"
            value={selectedGroupId ?? ''}
            onChange={handleOrbitChange}
          >
            <option value="">All Orbits</option>
            {groups.map(group => (
              <option key={group.groupId} value={group.groupId}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        {/* Media type tabs */}
        <div className="OrbitalFileBrowser__filter-group">
          <label className="OrbitalFileBrowser__filter-label">Type</label>
          <div className="OrbitalFileBrowser__tabs">
            {MEDIA_TYPE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`OrbitalFileBrowser__tab ${
                  mediaType === option.value ? 'OrbitalFileBrowser__tab--active' : ''
                }`}
                onClick={() => setMediaType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort toggle */}
        <div className="OrbitalFileBrowser__filter-group">
          <label className="OrbitalFileBrowser__filter-label">Sort</label>
          <button
            type="button"
            className="OrbitalFileBrowser__sort-toggle"
            onClick={() =>
              setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'))
            }
          >
            {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
            <span className="OrbitalFileBrowser__sort-icon">
              {sortOrder === 'newest' ? '\u2193' : '\u2191'}
            </span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="OrbitalFileBrowser__error">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setItems([]);
              setCursor(undefined);
              setHasMore(true);
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && items.length === 0 && (
        <div className="OrbitalFileBrowser__empty">
          <div className="OrbitalFileBrowser__empty-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
            </svg>
          </div>
          <p className="OrbitalFileBrowser__empty-text">
            No media files found
          </p>
          <p className="OrbitalFileBrowser__empty-hint">
            {selectedGroupId
              ? 'Try selecting a different orbit or changing the filters'
              : 'Media you receive will appear here'}
          </p>
        </div>
      )}

      {/* Media grid grouped by date */}
      {groupedItems.length > 0 && (
        <div className="OrbitalFileBrowser__content">
          {groupedItems.map(group => (
            <div key={group.label} className="OrbitalFileBrowser__group">
              <h4 className="OrbitalFileBrowser__group-label">{group.label}</h4>
              <div className="OrbitalFileBrowser__grid">
                {group.items.map(item => (
                  <OrbitalFileBrowserItem
                    key={item.id}
                    item={item}
                    onClick={handleItemClick}
                    getAbsolutePath={getAbsoluteAttachmentPath}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="OrbitalFileBrowser__load-more">
        {isLoading && (
          <div className="OrbitalFileBrowser__loading">
            <div className="OrbitalFileBrowser__spinner" />
            <span>Loading...</span>
          </div>
        )}
      </div>
    </div>
  );
}
