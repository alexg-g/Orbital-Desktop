# Orbital WebSocket Service - Implementation Summary

## What Was Created

### 1. Core WebSocket Service
**File:** `/ts/services/orbitalWebSocket.preload.ts`

A production-ready WebSocket service that handles real-time communication with the Orbital backend.

**Key Features:**
- ✅ JWT authentication (automatically uses stored token from `orbitalAuth.preload.ts`)
- ✅ Event subscription system (subscribe to specific events or all events)
- ✅ Automatic reconnection with exponential backoff (max 5 attempts)
- ✅ Connection state management (connecting, connected, disconnected, reconnecting)
- ✅ Type-safe event handling with TypeScript
- ✅ Error handling and logging
- ✅ Clean subscription/unsubscription API

**API Surface:**
```typescript
// Connect to WebSocket
async function connect(): Promise<boolean>

// Disconnect from WebSocket
function disconnect(): void

// Subscribe to events (returns unsubscribe function)
function subscribe(
  eventType: 'new_message' | 'new_thread' | 'new_reply' | 'media_uploaded' | 'all',
  callback: (event: WebSocketEvent) => void
): () => void

// Unsubscribe from events
function unsubscribe(eventType: string, callback: EventCallback): void

// Check if connected
function isConnected(): boolean

// Get connection state
function getConnectionState(): ConnectionState
```

### 2. Usage Documentation
**File:** `/ts/services/WEBSOCKET_USAGE.md`

Comprehensive guide covering:
- Basic usage examples
- React component integration patterns
- Storybook story examples with mocks
- Smart container pattern for production
- Connection lifecycle and reconnection logic
- Event structure and handling
- Error handling best practices
- Troubleshooting guide
- Environment variables
- Testing examples

### 3. Integration Example
**File:** `/ts/services/WEBSOCKET_INTEGRATION_EXAMPLE.tsx`

Complete reference implementation showing:
- How to define WebSocket operations as props (dependency injection)
- React hooks for WebSocket connection management
- Event subscription patterns
- Connection state monitoring and UI indicators
- Storybook mock implementation
- Smart container for production
- CSS examples for connection indicators

## Architecture Patterns

### Dependency Injection (Critical)

The service follows Signal-Desktop's pattern of separating browser-compatible code from Node.js APIs:

**✅ CORRECT:**
```typescript
// Component accepts WebSocket operations as props
export type ComponentProps = {
  websocket: {
    connect: () => Promise<boolean>;
    subscribe: (type: string, cb: Callback) => () => void;
    // ...
  };
};

// Storybook uses mocks
export const Story = {
  args: { websocket: createMockWebSocket() },
};

// Production uses real service
import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

<Component websocket={OrbitalWebSocket} />
```

**❌ WRONG:**
```typescript
// Component directly imports .preload file
import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

// This breaks Storybook (browser can't run .preload code)
```

### Event Flow

```
Backend WebSocket Server
         ↓
   JWT Authentication
         ↓
   WebSocket Connection
         ↓
    Event Broadcast
         ↓
 orbitalWebSocket.preload.ts
         ↓
    Event Listeners
         ↓
   Component Callbacks
         ↓
      UI Updates
```

### Connection States

```
disconnected → connecting → connected
                   ↓            ↓
                   ↓      (unexpected close)
                   ↓            ↓
                   ← reconnecting
```

### Reconnection Logic

- **Exponential Backoff:** 3s, 6s, 12s, 24s, 30s (max)
- **Max Attempts:** 5 attempts before giving up
- **Smart Reconnect:** Only reconnects on unexpected disconnections
- **Manual Reconnect:** User can trigger reconnect after max attempts reached

## Event Types

The backend broadcasts these events:

| Event Type | When | Data Structure |
|------------|------|----------------|
| `new_message` | Signal message relayed | `{ message: MessageInfo }` |
| `new_thread` | Thread created in orbit | `{ thread: ThreadInfo }` |
| `new_reply` | Reply posted to thread | `{ reply: ReplyInfo, threadId: string }` |
| `media_uploaded` | Media upload completed | `{ mediaId: string, url: string }` |

## Usage Example (Quick Reference)

```typescript
import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

// Connect
const connected = await OrbitalWebSocket.connect();

// Subscribe to new threads
const unsubscribe = OrbitalWebSocket.subscribe('new_thread', (event) => {
  console.log('New thread:', event.data.thread);
  // Update UI
});

// Cleanup
unsubscribe();
OrbitalWebSocket.disconnect();
```

## Integration Points

### Where to Use WebSocket

1. **OrbitalInbox** - Main component
   - Subscribe to all events
   - Update thread list when `new_thread` arrives
   - Update reply counts when `new_reply` arrives
   - Show connection status indicator

2. **OrbitalThreadDetail** - Thread view
   - Subscribe to `new_reply` for current thread
   - Auto-refresh replies when new ones arrive
   - Show "New reply" notification

3. **OrbitalComposer** - Thread/reply composer
   - Subscribe to `media_uploaded` for upload progress
   - Enable submit button when media upload completes

4. **Connection Monitor** - App-wide
   - Subscribe to `all` events to monitor connection
   - Show reconnecting indicator in app header
   - Allow manual reconnect when disconnected

### Next Steps for Integration

1. **Add WebSocket operations to OrbitalInbox props:**
   ```typescript
   export type OrbitalInboxProps = {
     // ... existing props
     websocket: WebSocketOperations;
   };
   ```

2. **Create Smart Container:**
   ```typescript
   // ts/state/smart/OrbitalInbox.preload.tsx
   import * as OrbitalWebSocket from '../../services/orbitalWebSocket.preload';

   export function SmartOrbitalInbox() {
     return (
       <OrbitalInbox
         websocket={OrbitalWebSocket}
         // ... other props
       />
     );
   }
   ```

3. **Update Storybook Stories:**
   ```typescript
   // Use mock WebSocket in stories
   export const Default: Story = {
     args: {
       websocket: createMockWebSocket(),
     },
   };
   ```

4. **Add Connection Indicator UI:**
   - Show connection status in app header
   - Allow manual reconnect when disconnected
   - Show "Reconnecting..." during reconnection

5. **Wire Event Handlers:**
   - `new_thread` → Refresh thread list
   - `new_reply` → Update reply count, refresh detail view
   - `media_uploaded` → Update media status

## Environment Variables

```bash
# Production
ORBITAL_WS_URL=wss://api.orbitl.org/v1/websocket

# Development (if running local backend)
ORBITAL_WS_URL=ws://localhost:3000/v1/websocket
```

**Default:** `wss://api.orbitl.org/v1/websocket` (if not set)

## Security Considerations

1. **JWT in URL:**
   - Token passed as query parameter: `?token=JWT_TOKEN`
   - Safe over WSS (encrypted connection)
   - Token expires after session timeout

2. **WSS Only in Production:**
   - Always use `wss://` in production
   - Development can use `ws://` for local testing

3. **Token Expiry:**
   - Service doesn't auto-refresh tokens
   - On 401 error, service will disconnect
   - User must re-login to get new token
   - Reconnect automatically uses latest stored token

4. **Connection State:**
   - UI should show connection status
   - Users know if updates are real-time or stale

## Testing

### Manual Testing

1. **Connect:**
   ```typescript
   const connected = await OrbitalWebSocket.connect();
   console.log('Connected:', connected);
   ```

2. **Subscribe:**
   ```typescript
   OrbitalWebSocket.subscribe('all', (event) => {
     console.log('Event:', event);
   });
   ```

3. **Trigger Events:**
   - Create a thread in another client
   - Post a reply in another client
   - Upload media in another client
   - Watch console for events

4. **Test Reconnection:**
   - Disconnect network
   - Watch reconnection attempts
   - Restore network
   - Verify reconnection succeeds

### Unit Testing

See `/ts/services/WEBSOCKET_USAGE.md` for Jest examples.

## File Locations

| File | Purpose |
|------|---------|
| `/ts/services/orbitalWebSocket.preload.ts` | Core WebSocket service |
| `/ts/services/WEBSOCKET_USAGE.md` | Comprehensive usage guide |
| `/ts/services/WEBSOCKET_INTEGRATION_EXAMPLE.tsx` | Integration reference |
| `/WEBSOCKET_SERVICE_SUMMARY.md` | This summary |

## Related Services

- **orbitalAuth.preload.ts** - JWT token management (used for authentication)
- **orbitalThreads.preload.ts** - Thread API (could trigger WebSocket events)
- **orbitalMedia.preload.ts** - Media API (could trigger `media_uploaded` events)

## Key Benefits

1. **Real-Time Updates:** Users see new threads/replies instantly
2. **Connection Resilience:** Automatic reconnection on network issues
3. **Type Safety:** Full TypeScript support for all events
4. **Testability:** Dependency injection enables Storybook and Jest testing
5. **Simplicity:** Clean API surface, easy to integrate
6. **Production Ready:** Error handling, logging, state management built-in

## Status

✅ **Service Implemented** - Ready for integration
✅ **Documentation Complete** - Usage guide and examples provided
✅ **Architecture Validated** - Follows Signal-Desktop patterns
⏳ **Integration Pending** - Needs to be wired into OrbitalInbox

## Known Limitations

1. **No Token Refresh:** Service doesn't automatically refresh expired JWT tokens
   - Users must re-login to get new token
   - Future enhancement: Add token refresh logic

2. **No Message Queuing:** Events received while component unmounted are lost
   - Future enhancement: Add event queue for missed events

3. **No Offline Support:** Requires network connection
   - Future enhancement: Add offline mode with event replay

4. **No Pagination:** Receives all events in real-time
   - Not needed for real-time updates
   - Historical events fetched via API

## Browser Compatibility

- **WebSocket API:** Supported in all modern browsers
- **Electron:** Full support (Chromium-based)
- **Storybook:** Works with mocks (browser-compatible)

## Performance

- **Memory:** Minimal overhead (event listener map)
- **CPU:** Low (only processes incoming messages)
- **Network:** Persistent connection (1 WebSocket per user)
- **Reconnection:** Exponential backoff prevents server overload

## Success Criteria

✅ Service connects to backend WebSocket
✅ Service authenticates with JWT token
✅ Service receives and dispatches events
✅ Service handles reconnection automatically
✅ Service provides clean subscription API
✅ Service is fully typed with TypeScript
✅ Service is testable via dependency injection
✅ Documentation is comprehensive

---

**Next Step:** Integrate WebSocket operations into OrbitalInbox component and create Storybook story demonstrating real-time updates.
