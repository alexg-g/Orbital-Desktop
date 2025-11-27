// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import React, { memo, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { ChatsTab } from '../../components/ChatsTab.dom.js';
import type { SmartConversationViewProps } from './ConversationView.preload.js';
import { SmartConversationView } from './ConversationView.preload.js';
import { SmartMiniPlayer } from './MiniPlayer.preload.js';
import { SmartLeftPane } from './LeftPane.preload.js';
import type { NavTabPanelProps } from '../../components/NavTabs.dom.js';
import { useGlobalModalActions } from '../ducks/globalModals.preload.js';
import { getIntl } from '../selectors/user.std.js';
import { usePrevious } from '../../hooks/usePrevious.std.js';
import { TargetedMessageSource } from '../ducks/conversationsEnums.std.js';
import { useConversationsActions } from '../ducks/conversations.preload.js';
import { useToastActions } from '../ducks/toast.preload.js';
import { strictAssert } from '../../util/assert.std.js';
import { isStagingServer } from '../../util/isStagingServer.dom.js';
import { ToastType } from '../../types/Toast.dom.js';
import { getNavTabsCollapsed } from '../selectors/items.dom.js';
import { useItemsActions } from '../ducks/items.preload.js';
import { getHasPendingUpdate } from '../selectors/updates.std.js';
import { getOtherTabsUnreadStats } from '../selectors/nav.preload.js';
import {
  getSelectedConversationId,
  getTargetedMessage,
  getTargetedMessageSource,
} from '../selectors/conversations.dom.js';
import { getDisplayMode, getSelectedThreadId } from '../ducks/nav.std.js';

function renderConversationView(props: SmartConversationViewProps) {
  return <SmartConversationView {...props} />;
}

function renderLeftPane(props: NavTabPanelProps) {
  return <SmartLeftPane {...props} />;
}

function renderMiniPlayer(options: { shouldFlow: boolean }) {
  return <SmartMiniPlayer {...options} />;
}

// Legacy thread detail renderer - threads are now handled by OrbitalInbox
function renderThreadDetail(
  _props: { threadId: string },
  _i18n: ReturnType<typeof getIntl>
) {
  // Thread detail is now handled by OrbitalInbox component
  return <div>Thread view moved to Orbital</div>;
}

export const SmartChatsTab = memo(function SmartChatsTab() {
  const i18n = useSelector(getIntl);
  const navTabsCollapsed = useSelector(getNavTabsCollapsed);
  const hasPendingUpdate = useSelector(getHasPendingUpdate);
  const otherTabsUnreadStats = useSelector(getOtherTabsUnreadStats);
  const selectedConversationId = useSelector(getSelectedConversationId);
  const targetedMessageId = useSelector(getTargetedMessage)?.id;
  const targetedMessageSource = useSelector(getTargetedMessageSource);

  // Orbital: Thread selection state
  const displayMode = useSelector(getDisplayMode);
  const selectedThreadId = useSelector(getSelectedThreadId);

  const {
    onConversationClosed,
    onConversationOpened,
    scrollToMessage,
    showConversation,
  } = useConversationsActions();
  const { showWhatsNewModal } = useGlobalModalActions();
  const { toggleNavTabsCollapse } = useItemsActions();
  const { showToast } = useToastActions();

  const lastOpenedConversationId = useRef<string | undefined>();

  useEffect(() => {
    if (selectedConversationId !== lastOpenedConversationId.current) {
      lastOpenedConversationId.current = selectedConversationId;
      if (selectedConversationId) {
        onConversationOpened(
          selectedConversationId,
          targetedMessageId,
          targetedMessageSource
        );
      }
    } else if (
      selectedConversationId &&
      targetedMessageId &&
      targetedMessageSource !== TargetedMessageSource.Focus
    ) {
      scrollToMessage(selectedConversationId, targetedMessageId);
    }
  }, [
    onConversationOpened,
    selectedConversationId,
    scrollToMessage,
    targetedMessageId,
    targetedMessageSource,
  ]);

  const prevConversationId = usePrevious(
    selectedConversationId,
    selectedConversationId
  );

  useEffect(() => {
    if (
      selectedConversationId != null &&
      selectedConversationId !== prevConversationId
    ) {
      const conversation = window.ConversationController.get(
        selectedConversationId
      );
      strictAssert(conversation, 'Conversation must be found');
      conversation.setMarkedUnread(false);
    }
  }, [prevConversationId, selectedConversationId]);

  useEffect(() => {
    // Close current opened conversation to reload the group information once
    // linked.
    function unload() {
      if (!prevConversationId) {
        return;
      }
      onConversationClosed(prevConversationId, 'force unload requested');
    }

    function packInstallFailed() {
      showToast({ toastType: ToastType.StickerPackInstallFailed });
    }

    window.Whisper.events.on('pack-install-failed', packInstallFailed);
    window.Whisper.events.on('setupAsNewDevice', unload);

    return () => {
      window.Whisper.events.off('pack-install-failed', packInstallFailed);
      window.Whisper.events.off('setupAsNewDevice', unload);
    };
  }, [onConversationClosed, prevConversationId, showConversation, showToast]);

  useEffect(() => {
    if (!selectedConversationId) {
      window.SignalCI?.handleEvent('empty-inbox:rendered', null);
    }
  }, [selectedConversationId]);

  return (
    <ChatsTab
      otherTabsUnreadStats={otherTabsUnreadStats}
      i18n={i18n}
      isStaging={isStagingServer()}
      hasPendingUpdate={hasPendingUpdate}
      navTabsCollapsed={navTabsCollapsed}
      onToggleNavTabsCollapse={toggleNavTabsCollapse}
      renderConversationView={renderConversationView}
      renderLeftPane={renderLeftPane}
      renderMiniPlayer={renderMiniPlayer}
      renderThreadDetail={(props) => renderThreadDetail(props, i18n)}
      selectedConversationId={selectedConversationId}
      displayMode={displayMode}
      selectedThreadId={selectedThreadId}
      showWhatsNewModal={showWhatsNewModal}
    />
  );
});
