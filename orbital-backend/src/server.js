// Load environment variables (.env.local takes priority for local dev)
// Skip if NODE_ENV=test - test environment is configured by jest.setup.js
const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV !== 'test') {
  const envLocalPath = path.join(__dirname, '../.env.local');
  const envPath = path.join(__dirname, '../.env');

  if (fs.existsSync(envLocalPath)) {
    // Explicitly unset DATABASE_URL to prevent shell environment conflicts
    delete process.env.DATABASE_URL;
    require('dotenv').config({ path: envLocalPath, override: true });
  } else {
    require('dotenv').config({ path: envPath });
  }
}
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');

// Import utilities
const logger = require('./utils/logger');
const db = require('./config/database');

// Import middleware
const corsMiddleware = require('./middleware/cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const signalRelayRoutes = require('./routes/signal-relay');
const threadsRoutes = require('./routes/threads');
const groupsRoutes = require('./routes/groups');
const mediaRoutes = require('./routes/media');
const mediaSyncRoutes = require('./routes/mediaSync');
const usersRoutes = require('./routes/users');
const invitesRoutes = require('./routes/invites');

// Import WebSocket server
const { initWebSocketServer } = require('./websocket/signalWebSocket');

// Import scheduled jobs
const { scheduleMediaCleanup } = require('./jobs/mediaCleanup');

/**
 * Orbital Backend Server
 *
 * Express server with:
 * - Signal Protocol relay endpoints
 * - Threading API
 * - Group management
 * - Media relay (7-day storage)
 * - WebSocket real-time delivery
 */

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust first proxy (Nginx) for rate limiting behind reverse proxy
// Using '1' instead of 'true' to prevent IP spoofing attacks
app.set('trust proxy', 1);

// Create HTTP server (for WebSocket upgrade)
const server = http.createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(corsMiddleware);

// Check if we should skip rate limiting (test or development environment)
const skipRateLimiting = () =>
  process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

// Rate limiting (disabled in test/development environment)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: skipRateLimiting() ? 0 : 100, // Disable in test/dev, 100 requests per windowMs in production
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimiting
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints (disabled in test/development environment)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: skipRateLimiting() ? 0 : 10,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts, please try again later.'
  },
  skip: skipRateLimiting
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });

  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: require('../package.json').version
  });
});

// Static file serving for avatars (no authentication required for avatars within groups)
// Avatars are served directly from the filesystem
const avatarPath = process.env.AVATAR_STORAGE_PATH || './uploads/avatars';
// Override CORS headers for avatars to allow cross-origin access from Electron app
app.use('/avatars', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(avatarPath));

// API Routes
app.use('/api', authLimiter, authRoutes);
app.use('/v1', signalRelayRoutes); // Signal Protocol relay endpoints
app.use('/api/threads', threadsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/media-sync', mediaSyncRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/invites', invitesRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Store cleanup job reference for graceful shutdown
let mediaCleanupJob = null;

/**
 * Start server
 */
async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    await db.testConnection();
    logger.info('Database connection successful');

    // Initialize WebSocket server
    logger.info('Initializing WebSocket server...');
    initWebSocketServer(server);
    logger.info('WebSocket server initialized');

    // Schedule media cleanup job
    logger.info('Scheduling media cleanup job...');
    mediaCleanupJob = scheduleMediaCleanup();
    logger.info('Media cleanup job scheduled');

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info('Orbital Backend Server started', {
        port: PORT,
        environment: NODE_ENV,
        nodeVersion: process.version
      });

      console.log('');
      console.log('='.repeat(60));
      console.log('  Orbital Backend Server');
      console.log('='.repeat(60));
      console.log(`  Environment:  ${NODE_ENV}`);
      console.log(`  HTTP Server:  http://localhost:${PORT}`);
      console.log(`  WebSocket:    ws://localhost:${PORT}/v1/websocket`);
      console.log(`  Health Check: http://localhost:${PORT}/health`);
      console.log('='.repeat(60));
      console.log('');
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Stop media cleanup job
  if (mediaCleanupJob) {
    logger.info('Stopping media cleanup job...');
    mediaCleanupJob.stop();
    logger.info('Media cleanup job stopped');
  }

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close database connections
      await db.closePool();
      logger.info('Database connections closed');

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error.message
      });
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason,
    promise
  });
});

// Start the server
startServer();

module.exports = { app, server };
