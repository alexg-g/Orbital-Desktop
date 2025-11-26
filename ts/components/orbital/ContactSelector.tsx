// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import classNames from 'classnames';
import type { OrbitalUser } from './mockThreadData';

export type ContactSelectorProps = {
  contacts: ReadonlyArray<OrbitalUser>;
  selectedContactIds: string[];
  onToggleContact: (contactId: string) => void;
  isLoading?: boolean;
  error?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
};

/**
 * ContactSelector - Multi-select contact list with search
 *
 * Features:
 * - Search contacts by name
 * - Multi-select contacts with checkmarks
 * - Online status indicators
 * - Avatar display
 * - Loading state
 * - Empty state when no contacts match search
 */
export function ContactSelector({
  contacts,
  selectedContactIds,
  onToggleContact,
  isLoading = false,
  error,
  searchTerm,
  onSearchChange,
}: ContactSelectorProps): JSX.Element {
  // Filter contacts by search term
  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="ContactSelector">
      {/* Search input */}
      <div className="ContactSelector__search">
        <input
          type="text"
          className="ContactSelector__search-input"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          aria-label="Search contacts"
        />
        {searchTerm && (
          <button
            type="button"
            className="ContactSelector__search-clear"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
          >
            x
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="ContactSelector__error" role="alert">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="ContactSelector__loading">
          <div className="orbital-loader">
            <div className="orbital-loader__ring">
              <div className="orbital-loader__dot orbital-loader__dot--one"><span /></div>
              <div className="orbital-loader__dot orbital-loader__dot--two"><span /></div>
              <div className="orbital-loader__dot orbital-loader__dot--three"><span /></div>
            </div>
          </div>
          <span>Loading contacts...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredContacts.length === 0 && (
        <div className="ContactSelector__empty">
          {searchTerm ? (
            <p className="ContactSelector__empty-text">
              No contacts matching "{searchTerm}"
            </p>
          ) : (
            <p className="ContactSelector__empty-text">
              No contacts available.
            </p>
          )}
        </div>
      )}

      {/* Contact list */}
      {!isLoading && filteredContacts.length > 0 && (
        <div className="ContactSelector__list" role="listbox" aria-label="Select contacts" aria-multiselectable="true">
          {filteredContacts.map(contact => {
            const isSelected = selectedContactIds.includes(contact.id);
            return (
              <button
                key={contact.id}
                type="button"
                className={classNames('ContactSelector__item', {
                  'ContactSelector__item--selected': isSelected,
                })}
                onClick={() => onToggleContact(contact.id)}
                role="option"
                aria-selected={isSelected}
              >
                {/* Avatar */}
                <div className="ContactSelector__avatar">
                  {contact.avatarUrl ? (
                    <img
                      src={contact.avatarUrl}
                      alt=""
                      className="ContactSelector__avatar-image"
                    />
                  ) : (
                    <div className="ContactSelector__avatar-placeholder">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {contact.isOnline && (
                    <div className="ContactSelector__online-indicator" aria-label="Online" />
                  )}
                </div>

                {/* Contact info */}
                <div className="ContactSelector__info">
                  <span className="ContactSelector__name">{contact.name}</span>
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="ContactSelector__checkmark" aria-hidden="true">
                    &#10003;
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
