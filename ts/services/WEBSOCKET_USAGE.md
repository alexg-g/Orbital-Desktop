# Orbital WebSocket Service Usage Guide

## Overview

The `orbitalWebSocket.preload.ts` service provides real-time communication with the Orbital backend server. It handles WebSocket connections, automatic reconnection, and event dispatching.

## Features

- **JWT Authentication**: Automatically uses stored JWT token for authentication
- **Event System**: Subscribe to specific event types or all events
- **Auto-Reconnection**: Automatically reconnects with exponential backoff on disconnect
- **Connection State**: Track connection status (connecting, connected, disconnected, reconnecting)
- **Type-Safe**: Full TypeScript support for all event types

## Event Types

The backend broadcasts these event types:

| Event Type | Description | Data Structure |
|------------|-------------|----------------|
| `new_message` | Signal message relayed | `{ message: {...} }` |
| `new_thread` | Thread created | `{ thread: {...} }` |
| `new_reply` | Reply posted | `{ reply: {...}, threadId: string }` |
| `media_uploaded` | Media upload completed | `{ mediaId: string, url: string }` |

## Basic Usage

### 1. Connect to WebSocket

```typescript
import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

// Connect (automatically uses stored JWT token)
const connected = await OrbitalWebSocket.connect();
if (connected) {
  console.log('WebSocket connected');
}
```

### 2. Subscribe to Events

```typescript
// Subscribe to specific event type
const unsubscribe = OrbitalWebSocket.subscribe('new_thread', (event) => {
  console.log('New thread created:', event.data.thread);
  // Update UI, refresh thread list, etc.
});

// Subscribe to all events
const unsubscribeAll = OrbitalWebSocket.subscribe('all', (event) => {
  console.log('Event received:', event.type, event.data);
});

// Unsubscribe when component unmounts
unsubscribe();
unsubscribeAll();
```

### 3. Check Connection State

```typescript
// Check if connected
if (OrbitalWebSocket.isConnected()) {
  console.log('WebSocket is connected');
}

// Get detailed connection state
const state = OrbitalWebSocket.getConnectionState();
// Returns: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
```

### 4. Disconnect

```typescript
// Disconnect (prevents automatic reconnection)
OrbitalWebSocket.disconnect();
```

## React Component Integration

### Example: Real-Time Thread List Updates

```typescript
import React, { useEffect, useState } from 'react';
import type { WebSocketEvent } from '../../services/orbitalWebSocket.preload';

export type OrbitalInboxProps = {
  i18n: LocalizerType;
  // WebSocket operations (dependency injection)
  connectWebSocket: () => Promise<boolean>;
  disconnectWebSocket: () => void;
  subscribeToWebSocket: (
    eventType: 'new_thread' | 'new_reply' | 'all',
    callback: (event: WebSocketEvent) => void
  ) => () => void;
  isWebSocketConnected: () => boolean;
  getWebSocketState: () => 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
};

export function OrbitalInbox({
  i18n,
  connectWebSocket,
  disconnectWebSocket,
  subscribeToWebSocket,
  isWebSocketConnected,
  getWebSocketState,
}: OrbitalInboxProps) {
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [threads, setThreads] = useState<OrbitalThread[]>([]);

  useEffect(() => {
    // Connect to WebSocket on mount
    connectWebSocket();

    // Subscribe to new thread events
    const unsubscribeThreads = subscribeToWebSocket('new_thread', (event) => {
      console.log('New thread received:', event.data.thread);
      // Add new thread to list
      setThreads(prev => [event.data.thread, ...prev]);
    });

    // Subscribe to new reply events
    const unsubscribeReplies = subscribeToWebSocket('new_reply', (event) => {
      console.log('New reply received:', event.data.reply);
      // Update thread reply count
      setThreads(prev =>
        prev.map(thread =>
          thread.id === event.data.threadId
            ? { ...thread, replyCount: thread.replyCount + 1 }
            : thread
        )
      );
    });

    // Monitor connection state
    const unsubscribeAll = subscribeToWebSocket('all', (event) => {
      // Check for connection state changes
      const state = getWebSocketState();
      setConnectionState(state);
    });

    // Cleanup on unmount
    return () => {
      unsubscribeThreads();
      unsubscribeReplies();
      unsubscribeAll();
      disconnectWebSocket();
    };
  }, []);

  // Render connection indicator
  const renderConnectionIndicator = () => {
    switch (connectionState) {
      case 'connected':
        return <div className="status-connected">Connected</div>;
      case 'connecting':
      case 'reconnecting':
        return <div className="status-connecting">Connecting...</div>;
      case 'disconnected':
        return <div className="status-disconnected">Disconnected</div>;
      default:
        return null;
    }
  };

  return (
    <div>
      {renderConnectionIndicator()}
      {/* Rest of component */}
    </div>
  );
}
```

### Example: Storybook Story with Mock WebSocket

```typescript
// OrbitalInbox.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import type { WebSocketEvent } from '../../services/orbitalWebSocket.preload';

type EventCallback = (event: WebSocketEvent) => void;

// Mock WebSocket operations for Storybook
const mockConnectWebSocket = async (): Promise<boolean> => {
  console.log('[Mock] WebSocket connecting...');
  return true;
};

const mockDisconnectWebSocket = (): void => {
  console.log('[Mock] WebSocket disconnected');
};

const mockSubscribeToWebSocket = (
  eventType: string,
  callback: EventCallback
): (() => void) => {
  console.log('[Mock] Subscribed to', eventType);

  // Simulate receiving a new thread after 2 seconds
  if (eventType === 'new_thread') {
    setTimeout(() => {
      callback({
        type: 'new_thread',
        data: {
          thread: {
            id: 'thread-123',
            title: 'Just arrived via WebSocket!',
            author: 'Alice',
            timestamp: Date.now(),
            replyCount: 0,
          },
        },
        timestamp: Date.now(),
      });
    }, 2000);
  }

  return () => console.log('[Mock] Unsubscribed from', eventType);
};

const mockIsWebSocketConnected = (): boolean => true;

const mockGetWebSocketState = () => 'connected' as const;

const meta: Meta<typeof OrbitalInbox> = {
  title: 'Orbital/OrbitalInbox',
  component: OrbitalInbox,
};

export default meta;
type Story = StoryObj<typeof OrbitalInbox>;

export const WithWebSocket: Story = {
  args: {
    i18n: mockI18n,
    connectWebSocket: mockConnectWebSocket,
    disconnectWebSocket: mockDisconnectWebSocket,
    subscribeToWebSocket: mockSubscribeToWebSocket,
    isWebSocketConnected: mockIsWebSocketConnected,
    getWebSocketState: mockGetWebSocketState,
  },
};
```

### Example: Smart Container (Production)

```typescript
// ts/state/smart/OrbitalInbox.preload.tsx
import React from 'react';
import { OrbitalInbox } from '../../components/orbital/OrbitalInbox';
import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

export function SmartOrbitalInbox() {
  return (
    <OrbitalInbox
      i18n={window.i18n}
      // Wire real WebSocket service
      connectWebSocket={OrbitalWebSocket.connect}
      disconnectWebSocket={OrbitalWebSocket.disconnect}
      subscribeToWebSocket={OrbitalWebSocket.subscribe}
      isWebSocketConnected={OrbitalWebSocket.isConnected}
      getWebSocketState={OrbitalWebSocket.getConnectionState}
      // ... other props
    />
  );
}
```

## Connection Lifecycle

### Automatic Reconnection

The service automatically reconnects on unexpected disconnections:

1. **Exponential Backoff**: Reconnect delay doubles with each attempt (3s, 6s, 12s, 24s, 30s max)
2. **Max Attempts**: Tries up to 5 times before giving up
3. **Smart Reconnect**: Only reconnects on unexpected disconnects (not after manual disconnect)

### Connection States

```typescript
// disconnected → connecting → connected
//                    ↓            ↓
//                    ↓      (unexpected close)
//                    ↓            ↓
//                    ← reconnecting
```

## Event Structure

All WebSocket events follow this structure:

```typescript
interface WebSocketEvent {
  type: 'new_message' | 'new_thread' | 'new_reply' | 'media_uploaded';
  data: any; // Event-specific payload
  conversation_id?: string; // Optional group/conversation ID
  timestamp: number; // Unix timestamp
}
```

## Error Handling

The service handles errors gracefully:

- **Connection Errors**: Automatically triggers reconnection
- **Parse Errors**: Logs error and continues listening
- **Callback Errors**: Logs error but doesn't affect other listeners
- **Auth Errors**: Returns `false` from `connect()` if no JWT token

## Best Practices

### 1. Always Unsubscribe

```typescript
useEffect(() => {
  const unsubscribe = subscribeToWebSocket('new_thread', handleNewThread);
  return () => unsubscribe(); // Cleanup on unmount
}, []);
```

### 2. Use Dependency Injection

Pass WebSocket operations as props for testability:

```typescript
// Component accepts WebSocket operations as props
export type MyComponentProps = {
  subscribeToWebSocket: (type: string, cb: EventCallback) => () => void;
};

// Storybook uses mocks
export const Default: Story = {
  args: { subscribeToWebSocket: mockSubscribeToWebSocket },
};

// Production uses real service
<MyComponent subscribeToWebSocket={OrbitalWebSocket.subscribe} />
```

### 3. Handle All Connection States

```typescript
const state = getWebSocketState();
switch (state) {
  case 'connected':
    // Show connected UI
    break;
  case 'connecting':
  case 'reconnecting':
    // Show loading/reconnecting UI
    break;
  case 'disconnected':
    // Show disconnected UI, allow manual reconnect
    break;
}
```

### 4. Monitor Connection State

```typescript
// Subscribe to all events to detect connection changes
const unsubscribe = subscribeToWebSocket('all', (event) => {
  const newState = getWebSocketState();
  setConnectionState(newState);
});
```

## Troubleshooting

### WebSocket Not Connecting

1. **Check JWT Token**: Ensure user is logged in
   ```typescript
   const token = await getJWT();
   if (!token) {
     console.error('No JWT token - user not logged in');
   }
   ```

2. **Check Backend URL**: Verify `ORBITAL_WS_URL` environment variable
   ```bash
   # .env.production
   ORBITAL_WS_URL=wss://api.orbitl.org/v1/websocket
   ```

3. **Check Browser Console**: Look for WebSocket errors

### Events Not Received

1. **Verify Subscription**: Ensure callback is registered
   ```typescript
   const unsubscribe = subscribeToWebSocket('new_thread', (event) => {
     console.log('Event received!', event);
   });
   ```

2. **Check Event Type**: Ensure subscribing to correct event type
3. **Check Backend**: Verify backend is broadcasting events

### Frequent Reconnections

1. **Check Network**: Unstable connection may cause disconnects
2. **Check Backend**: Server restarts trigger reconnection
3. **Check JWT**: Expired token causes auth failures

## Environment Variables

```bash
# .env.production
ORBITAL_WS_URL=wss://api.orbitl.org/v1/websocket

# .env.development
ORBITAL_WS_URL=ws://localhost:3000/v1/websocket
```

## Security Notes

- **JWT in URL**: Token is passed as query parameter (encrypted over WSS)
- **Token Expiry**: Service doesn't handle token refresh - reconnect with new token manually
- **WSS Only**: Production should always use `wss://` (WebSocket Secure)

## Testing

### Unit Tests

```typescript
import * as OrbitalWebSocket from './orbitalWebSocket.preload';

describe('OrbitalWebSocket', () => {
  beforeEach(() => {
    OrbitalWebSocket.disconnect();
    OrbitalWebSocket.resetReconnectState();
  });

  it('connects to WebSocket', async () => {
    const connected = await OrbitalWebSocket.connect();
    expect(connected).toBe(true);
    expect(OrbitalWebSocket.isConnected()).toBe(true);
  });

  it('dispatches events to subscribers', async () => {
    const callback = jest.fn();
    OrbitalWebSocket.subscribe('new_thread', callback);

    // Simulate incoming event (requires mock WebSocket)
    // ...

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'new_thread' })
    );
  });
});
```

## Related Documentation

- **Backend WebSocket API**: `/planning-docs/websocket-realtime.md`
- **Orbital Auth Service**: `ts/services/orbitalAuth.preload.ts`
- **Component Integration**: This guide (see React examples above)
