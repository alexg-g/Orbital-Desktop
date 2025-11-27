// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback } from 'react';
import type { LocalizerType } from '../../types/Util.std.js';
import { Modal } from '../Modal.dom.js';
import { ContactSelector } from './ContactSelector';
import type { OrbitalUser } from './orbitalTypes';

export type ContactPickerModalProps = {
  i18n: LocalizerType;
  contacts: ReadonlyArray<OrbitalUser>;
  onSelectContacts: (contactIds: string[], groupName?: string) => void;
  onClose: () => void;
};

/**
 * ContactPickerModal - Modal for selecting contacts to start a new chat
 *
 * Features:
 * - Single-select for 1:1 DM (click "Start Chat")
 * - Multi-select for group chat (shows group name input)
 * - Search contacts by name
 * - Cancel/close button
 * - "Start Chat" / "Create Group" button based on selection count
 */
export function ContactPickerModal({
  i18n,
  contacts,
  onSelectContacts,
  onClose,
}: ContactPickerModalProps): JSX.Element {
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupName, setGroupName] = useState('');

  const isGroupChat = selectedContactIds.length > 1;
  const canCreate = selectedContactIds.length > 0 &&
    (!isGroupChat || groupName.trim().length > 0);

  const handleToggleContact = useCallback((contactId: string) => {
    setSelectedContactIds(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  }, []);

  const handleCreate = useCallback(() => {
    if (isGroupChat) {
      onSelectContacts(selectedContactIds, groupName.trim());
    } else {
      onSelectContacts(selectedContactIds);
    }
  }, [isGroupChat, selectedContactIds, groupName, onSelectContacts]);

  return (
    <Modal
      modalName="ContactPickerModal"
      i18n={i18n}
      title="New Chat"
      hasXButton
      onClose={onClose}
      padded={false}
    >
      <div className="ContactPickerModal">
        <ContactSelector
          contacts={contacts}
          selectedContactIds={selectedContactIds}
          onToggleContact={handleToggleContact}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Show group name input when multiple contacts selected */}
        {isGroupChat && (
          <div className="ContactPickerModal__group-name">
            <label htmlFor="group-name-input" className="ContactPickerModal__group-name-label">
              Group Name
            </label>
            <input
              id="group-name-input"
              type="text"
              className="ContactPickerModal__group-name-input"
              placeholder="Enter group name..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
          </div>
        )}

        {/* Footer with action buttons */}
        <div className="ContactPickerModal__footer">
          <button
            type="button"
            className="ContactPickerModal__button ContactPickerModal__button--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ContactPickerModal__button ContactPickerModal__button--primary"
            onClick={handleCreate}
            disabled={!canCreate}
          >
            {isGroupChat ? 'Create Group' : 'Start Chat'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
