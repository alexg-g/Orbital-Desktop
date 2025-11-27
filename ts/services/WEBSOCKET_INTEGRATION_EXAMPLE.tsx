// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WebSocket Integration Example
 *
 * This file demonstrates how to integrate the WebSocket service into
 * OrbitalInbox component for real-time updates.
 *
 * This is a REFERENCE EXAMPLE - not production code.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { WebSocketEvent, ConnectionState } from './orbitalWebSocket.preload';

// ============================================================================
// STEP 1: Define prop types for dependency injection
// ============================================================================

export type WebSocketOperations = {
  // Connect to WebSocket (returns true if successful)
  connect: () => Promise<boolean>;

  // Disconnect from WebSocket
  disconnect: () => void;

  // Subscribe to events (returns unsubscribe function)
  subscribe: (
    eventType: 'new_message' | 'new_thread' | 'new_reply' | 'media_uploaded' | 'all',
    callback: (event: WebSocketEvent) => void
  ) => () => void;

  // Check if connected
  isConnected: () => boolean;

  // Get connection state
  getConnectionState: () => ConnectionState;
};

export type ExampleComponentProps = {
  // WebSocket operations (injected)
  websocket: WebSocketOperations;

  // Other props...
  userId: string;
  onThreadUpdate?: (threadId: string) => void;
};

// ============================================================================
// STEP 2: Component implementation with WebSocket hooks
// ============================================================================

export function ExampleComponent({
  websocket,
  userId,
  onThreadUpdate,
}: ExampleComponentProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [newThreadsCount, setNewThreadsCount] = useState(0);

  // Initialize WebSocket connection on mount
  useEffect(() => {
    let mounted = true;

    async function initWebSocket() {
      const connected = await websocket.connect();
      if (mounted && connected) {
        console.log('[WebSocket] Connected successfully');
        setConnectionState(websocket.getConnectionState());
      }
    }

    initWebSocket();

    // Cleanup on unmount
    return () => {
      mounted = false;
      websocket.disconnect();
    };
  }, [websocket]);

  // Monitor connection state changes
  useEffect(() => {
    const unsubscribe = websocket.subscribe('all', (event) => {
      // Update connection state whenever any event arrives
      const state = websocket.getConnectionState();
      setConnectionState(state);
    });

    return () => unsubscribe();
  }, [websocket]);

  // Handle new thread events
  useEffect(() => {
    const unsubscribe = websocket.subscribe('new_thread', (event) => {
      console.log('[WebSocket] New thread created:', event.data.thread);

      // Update thread count
      setNewThreadsCount(prev => prev + 1);

      // Notify parent component
      if (event.data.thread?.id) {
        onThreadUpdate?.(event.data.thread.id);
      }

      // Show browser notification
      if (Notification.permission === 'granted') {
        new Notification('New Thread', {
          body: event.data.thread?.title || 'A new thread was posted',
        });
      }
    });

    return () => unsubscribe();
  }, [websocket, onThreadUpdate]);

  // Handle new reply events
  useEffect(() => {
    const unsubscribe = websocket.subscribe('new_reply', (event) => {
      console.log('[WebSocket] New reply:', event.data.reply);

      // Notify parent component
      if (event.data.threadId) {
        onThreadUpdate?.(event.data.threadId);
      }
    });

    return () => unsubscribe();
  }, [websocket, onThreadUpdate]);

  // Handle media upload events
  useEffect(() => {
    const unsubscribe = websocket.subscribe('media_uploaded', (event) => {
      console.log('[WebSocket] Media uploaded:', event.data.mediaId);

      // Could trigger media download or UI update here
    });

    return () => unsubscribe();
  }, [websocket]);

  // Manual reconnect function
  const handleReconnect = useCallback(async () => {
    websocket.disconnect();
    const connected = await websocket.connect();
    if (connected) {
      setNewThreadsCount(0);
    }
  }, [websocket]);

  // Render connection indicator
  const renderConnectionIndicator = () => {
    switch (connectionState) {
      case 'connected':
        return (
          <div className="connection-indicator connection-indicator--connected">
            <span className="connection-indicator__dot"></span>
            <span>Connected</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="connection-indicator connection-indicator--connecting">
            <span className="connection-indicator__dot"></span>
            <span>Connecting...</span>
          </div>
        );
      case 'reconnecting':
        return (
          <div className="connection-indicator connection-indicator--reconnecting">
            <span className="connection-indicator__dot"></span>
            <span>Reconnecting...</span>
          </div>
        );
      case 'disconnected':
        return (
          <div className="connection-indicator connection-indicator--disconnected">
            <span className="connection-indicator__dot"></span>
            <span>Disconnected</span>
            <button onClick={handleReconnect}>Reconnect</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="example-component">
      <div className="example-component__header">
        {renderConnectionIndicator()}
        {newThreadsCount > 0 && (
          <div className="new-threads-badge">
            {newThreadsCount} new thread{newThreadsCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Rest of component UI */}
      <div className="example-component__content">
        {/* Your thread list, composer, etc. */}
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3: Storybook story with mock WebSocket
// ============================================================================

// Example Storybook story (ExampleComponent.stories.tsx)
/*
import type { Meta, StoryObj } from '@storybook/react';
import { ExampleComponent } from './ExampleComponent';

// Mock WebSocket operations for Storybook
const createMockWebSocket = (): WebSocketOperations => {
  const listeners: Map<string, Set<(event: WebSocketEvent) => void>> = new Map();
  let connected = false;
  let state: ConnectionState = 'disconnected';

  return {
    connect: async () => {
      console.log('[Mock WebSocket] Connecting...');
      state = 'connecting';
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 500));
      connected = true;
      state = 'connected';

      // Simulate receiving a new thread after 2 seconds
      setTimeout(() => {
        const event: WebSocketEvent = {
          type: 'new_thread',
          data: {
            thread: {
              id: 'thread-123',
              title: 'Just arrived via WebSocket!',
              author: 'Alice',
              timestamp: Date.now(),
            },
          },
          timestamp: Date.now(),
        };

        // Dispatch to subscribers
        listeners.get('new_thread')?.forEach(cb => cb(event));
        listeners.get('all')?.forEach(cb => cb(event));
      }, 2000);

      return true;
    },

    disconnect: () => {
      console.log('[Mock WebSocket] Disconnected');
      connected = false;
      state = 'disconnected';
    },

    subscribe: (eventType, callback) => {
      console.log('[Mock WebSocket] Subscribed to', eventType);
      if (!listeners.has(eventType)) {
        listeners.set(eventType, new Set());
      }
      listeners.get(eventType)!.add(callback);

      return () => {
        console.log('[Mock WebSocket] Unsubscribed from', eventType);
        listeners.get(eventType)?.delete(callback);
      };
    },

    isConnected: () => connected,

    getConnectionState: () => state,
  };
};

const meta: Meta<typeof ExampleComponent> = {
  title: 'Orbital/ExampleComponent',
  component: ExampleComponent,
};

export default meta;
type Story = StoryObj<typeof ExampleComponent>;

export const WithWebSocket: Story = {
  args: {
    websocket: createMockWebSocket(),
    userId: 'user-123',
    onThreadUpdate: (threadId) => {
      console.log('[Story] Thread updated:', threadId);
    },
  },
};
*/

// ============================================================================
// STEP 4: Smart container with real WebSocket service (production)
// ============================================================================

// Example Smart Container (ExampleComponent.preload.tsx)
/*
import React from 'react';
import { ExampleComponent } from '../../components/orbital/ExampleComponent';
import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

export function SmartExampleComponent() {
  const websocketOperations: WebSocketOperations = {
    connect: OrbitalWebSocket.connect,
    disconnect: OrbitalWebSocket.disconnect,
    subscribe: OrbitalWebSocket.subscribe,
    isConnected: OrbitalWebSocket.isConnected,
    getConnectionState: OrbitalWebSocket.getConnectionState,
  };

  return (
    <ExampleComponent
      websocket={websocketOperations}
      userId="current-user-id"
      onThreadUpdate={(threadId) => {
        // Handle thread update - refresh data, etc.
        console.log('Thread updated:', threadId);
      }}
    />
  );
}
*/

// ============================================================================
// STEP 5: Example CSS for connection indicator
// ============================================================================

/*
.connection-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.connection-indicator__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.connection-indicator--connected {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.connection-indicator--connected .connection-indicator__dot {
  background-color: #4caf50;
  animation: pulse 2s infinite;
}

.connection-indicator--connecting,
.connection-indicator--reconnecting {
  background-color: #fff3e0;
  color: #e65100;
}

.connection-indicator--connecting .connection-indicator__dot,
.connection-indicator--reconnecting .connection-indicator__dot {
  background-color: #ff9800;
  animation: blink 1s infinite;
}

.connection-indicator--disconnected {
  background-color: #ffebee;
  color: #c62828;
}

.connection-indicator--disconnected .connection-indicator__dot {
  background-color: #f44336;
}

.connection-indicator--disconnected button {
  margin-left: 8px;
  padding: 2px 8px;
  background: #c62828;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.connection-indicator--disconnected button:hover {
  background: #b71c1c;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes blink {
  0%, 50%, 100% { opacity: 1; }
  25%, 75% { opacity: 0.3; }
}

.new-threads-badge {
  background: #1976d2;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
*/

// ============================================================================
// KEY PATTERNS TO FOLLOW
// ============================================================================

/**
 * 1. DEPENDENCY INJECTION
 *    - Pass WebSocket operations as props (not direct imports)
 *    - Enables Storybook mocking and testing
 *
 * 2. CLEANUP
 *    - Always unsubscribe in useEffect cleanup
 *    - Disconnect WebSocket on component unmount
 *
 * 3. CONNECTION STATE
 *    - Monitor connection state changes
 *    - Show UI indicators for connection status
 *    - Provide manual reconnect option when disconnected
 *
 * 4. EVENT HANDLING
 *    - Subscribe to specific events you care about
 *    - Use 'all' subscription for connection monitoring
 *    - Handle errors gracefully in callbacks
 *
 * 5. STORYBOOK COMPATIBILITY
 *    - Mock WebSocket with similar behavior to real service
 *    - Simulate delays and events for realistic testing
 *    - Test all connection states
 */
