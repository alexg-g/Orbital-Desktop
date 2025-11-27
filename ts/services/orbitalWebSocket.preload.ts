// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital WebSocket Service
 *
 * Real-time communication with Orbital backend server.
 *
 * Features:
 * - WebSocket connection with JWT authentication
 * - Event dispatching for new threads, replies, and media
 * - Automatic reconnection with exponential backoff
 * - Connection state management
 * - Event subscription system
 *
 * Events:
 * - new_message: Signal message relayed
 * - new_thread: Thread created
 * - new_reply: Reply posted
 * - media_uploaded: Media upload completed
 */

import { createLogger } from '../logging/log.std.js';
import { getJWT } from './orbitalAuth.preload.js';
import * as Errors from '../types/errors.std.js';

const log = createLogger('OrbitalWebSocket');

/**
 * WebSocket server URL
 */
const WEBSOCKET_URL =
  process.env.ORBITAL_WS_URL || 'wss://api.orbitl.org/v1/websocket';

/**
 * Reconnection configuration
 */
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 3000; // 3 seconds
const RECONNECT_MAX_DELAY = 30000; // 30 seconds

/**
 * WebSocket event types from backend
 */
export type WebSocketEventType =
  | 'new_message'
  | 'new_thread'
  | 'new_reply'
  | 'media_uploaded'
  | 'member_left'
  | 'key_rotated';

/**
 * WebSocket event structure
 */
export interface WebSocketEvent {
  type: WebSocketEventType;
  data: any;
  conversation_id?: string;
  timestamp: number;
}

/**
 * Connection state
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/**
 * Event callback function
 */
export type EventCallback = (event: WebSocketEvent) => void;

/**
 * Internal state
 */
let socket: WebSocket | null = null;
let connectionState: ConnectionState = 'disconnected';
let reconnectAttempts = 0;
let reconnectTimeoutId: NodeJS.Timeout | null = null;
let isIntentionalDisconnect = false;

/**
 * Event listeners organized by event type
 * Special type 'all' receives all events
 */
const eventListeners: Map<string, Set<EventCallback>> = new Map();

/**
 * Connect to WebSocket server with JWT authentication
 * Returns true if connection successful, false otherwise
 */
export async function connect(): Promise<boolean> {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    log.info('WebSocket already connecting or connected');
    return true;
  }

  try {
    const token = await getJWT();
    if (!token) {
      log.warn('Cannot connect: No JWT token available');
      connectionState = 'disconnected';
      return false;
    }

    log.info('Connecting to WebSocket', { url: WEBSOCKET_URL });
    connectionState = 'connecting';
    isIntentionalDisconnect = false;

    // Append JWT token as query parameter
    const wsUrl = `${WEBSOCKET_URL}?token=${encodeURIComponent(token)}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = handleOpen;
    socket.onclose = handleClose;
    socket.onerror = handleError;
    socket.onmessage = handleMessage;

    return true;
  } catch (error) {
    log.error('Failed to connect', { error: Errors.toLogFormat(error) });
    connectionState = 'disconnected';
    return false;
  }
}

/**
 * Disconnect from WebSocket server
 */
export function disconnect(): void {
  log.info('Disconnecting WebSocket');
  isIntentionalDisconnect = true;

  // Clear any pending reconnect attempts
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  connectionState = 'disconnected';
  reconnectAttempts = 0;
}

/**
 * Subscribe to WebSocket events
 *
 * @param eventType - Event type to subscribe to, or 'all' for all events
 * @param callback - Function to call when event occurs
 * @returns Unsubscribe function
 */
export function subscribe(
  eventType: WebSocketEventType | 'all',
  callback: EventCallback
): () => void {
  if (!eventListeners.has(eventType)) {
    eventListeners.set(eventType, new Set());
  }

  eventListeners.get(eventType)!.add(callback);
  log.info('Subscribed to event', { eventType });

  // Return unsubscribe function
  return () => unsubscribe(eventType, callback);
}

/**
 * Unsubscribe from WebSocket events
 */
export function unsubscribe(
  eventType: WebSocketEventType | 'all',
  callback: EventCallback
): void {
  const listeners = eventListeners.get(eventType);
  if (listeners) {
    listeners.delete(callback);
    log.info('Unsubscribed from event', { eventType });
  }
}

/**
 * Check if currently connected
 */
export function isConnected(): boolean {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

/**
 * Get current connection state
 */
export function getConnectionState(): ConnectionState {
  return connectionState;
}

/**
 * Handle WebSocket open event
 */
function handleOpen(): void {
  log.info('WebSocket connected');
  connectionState = 'connected';
  reconnectAttempts = 0;

  // Notify connection state listeners
  dispatchConnectionStateChange('connected');
}

/**
 * Handle WebSocket close event
 */
function handleClose(event: CloseEvent): void {
  log.info('WebSocket closed', {
    code: event.code,
    reason: event.reason,
    wasClean: event.wasClean,
  });

  socket = null;

  // If this was an intentional disconnect, don't reconnect
  if (isIntentionalDisconnect) {
    connectionState = 'disconnected';
    dispatchConnectionStateChange('disconnected');
    return;
  }

  // Attempt to reconnect
  attemptReconnect();
}

/**
 * Handle WebSocket error event
 */
function handleError(event: Event): void {
  log.error('WebSocket error', { event });

  // Don't change state here - let close handler manage reconnection
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data);

    // Validate message structure
    if (!message.type || !message.timestamp) {
      log.warn('Invalid WebSocket message structure', { message });
      return;
    }

    const wsEvent: WebSocketEvent = {
      type: message.type,
      data: message.data,
      conversation_id: message.conversation_id,
      timestamp: message.timestamp,
    };

    log.info('Received WebSocket event', {
      type: wsEvent.type,
      conversationId: wsEvent.conversation_id,
    });

    // Dispatch to specific event type listeners
    dispatchEvent(wsEvent);

    // Dispatch to 'all' event listeners
    dispatchToAllListeners(wsEvent);
  } catch (error) {
    log.error('Failed to parse WebSocket message', {
      error: Errors.toLogFormat(error),
    });
  }
}

/**
 * Dispatch event to registered listeners for specific event type
 */
function dispatchEvent(event: WebSocketEvent): void {
  const listeners = eventListeners.get(event.type);
  if (listeners && listeners.size > 0) {
    listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        log.error('Error in event callback', {
          eventType: event.type,
          error: Errors.toLogFormat(error),
        });
      }
    });
  }
}

/**
 * Dispatch event to 'all' event listeners
 */
function dispatchToAllListeners(event: WebSocketEvent): void {
  const allListeners = eventListeners.get('all');
  if (allListeners && allListeners.size > 0) {
    allListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        log.error('Error in "all" event callback', {
          eventType: event.type,
          error: Errors.toLogFormat(error),
        });
      }
    });
  }
}

/**
 * Dispatch connection state change to listeners
 */
function dispatchConnectionStateChange(state: ConnectionState): void {
  // Dispatch as a special 'connection_state' event
  const event: WebSocketEvent = {
    type: 'new_message', // Use existing type to satisfy type system
    data: { connectionState: state },
    timestamp: Date.now(),
  };

  // Only dispatch to 'all' listeners for connection state changes
  dispatchToAllListeners(event);
}

/**
 * Attempt to reconnect with exponential backoff
 */
function attemptReconnect(): void {
  if (isIntentionalDisconnect) {
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.warn('Max reconnection attempts reached', {
      attempts: reconnectAttempts,
    });
    connectionState = 'disconnected';
    dispatchConnectionStateChange('disconnected');
    return;
  }

  connectionState = 'reconnecting';
  reconnectAttempts += 1;

  // Calculate delay with exponential backoff: base * 2^(attempts-1)
  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1),
    RECONNECT_MAX_DELAY
  );

  log.info('Scheduling reconnection', {
    attempt: reconnectAttempts,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    delayMs: delay,
  });

  dispatchConnectionStateChange('reconnecting');

  reconnectTimeoutId = setTimeout(async () => {
    log.info('Attempting reconnection', { attempt: reconnectAttempts });
    const success = await connect();

    if (!success) {
      // Connect failed, try again
      attemptReconnect();
    }
  }, delay);
}

/**
 * Reset reconnection state (useful for testing)
 */
export function resetReconnectState(): void {
  reconnectAttempts = 0;
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
}
