/**
 * PM2 Ecosystem Configuration for Orbital Backend
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 start ecosystem.config.js --env development
 *
 * More info: https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'orbital-backend',

      // Script to run
      script: './src/server.js',

      // Working directory
      cwd: '/home/orbital/apps/orbital/orbital-backend',

      // Number of instances
      // 1 instance for 1GB RAM droplet (1 CPU)
      instances: 1,

      // Execution mode
      // fork = single process (optimal for 1GB RAM)
      exec_mode: 'fork',

      // Don't watch for file changes in production
      watch: false,

      // Files to NOT watch
      ignore_watch: [
        'node_modules',
        'logs',
        'uploads',
        'coverage',
        '.git',
        'tests'
      ],

      // Log files
      error_file: '/var/log/orbital/error.log',
      out_file: '/var/log/orbital/out.log',
      log_file: '/var/log/orbital/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment variables for production
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // Environment variables for development
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },

      // Restart configuration
      restart_delay: 4000,  // Wait 4 seconds before restart
      min_uptime: '10s',    // App must run 10s to be considered "properly started"
      max_restarts: 10,     // Max 10 restart attempts within 1 minute
      autorestart: true,    // Auto restart on crash

      // Memory management
      max_memory_restart: '400M',  // Restart if process exceeds 400MB (1GB droplet)

      // Merge logs from multiple instances
      merge_logs: true,

      // Timeout for listening
      listen_timeout: 3000,

      // Kill timeout (force kill after 5 seconds if graceful shutdown fails)
      kill_timeout: 5000,

      // Graceful timeout
      wait_ready: false,

      // Advanced
      //
      // Allows the application to receive some system signals
      // for graceful shutdown:
      //   - SIGINT (Ctrl+C)
      //   - SIGTERM (termination)
      shutdown_with_message: false,

      // Ref: https://pm2.keymetrics.io/docs/usage/process-management/
      node_args: [
        '--max-old-space-size=384'  // Limit Node.js heap to 384MB (1GB droplet)
      ],

      // Error and output files template
      output: '/var/log/orbital/out-[instance].log',
      error: '/var/log/orbital/error-[instance].log',

      // Monitoring
      monitoring: true
    }
  ],

  // Deployment configuration
  // Usage: pm2 deploy ecosystem.config.js production
  deploy: {
    production: {
      user: 'orbital',
      host: 'api.orbitl.org',
      ref: 'origin/main',
      repo: 'https://github.com/alexg-g/Orbital-Desktop.git',
      path: '/home/orbital/apps/orbital',
      'pre-deploy-local': 'echo "Deploying to production..."',
      'post-deploy': 'npm install && npm run migrate && pm2 reload ecosystem.config.js --env production',
      'pre-deploy': 'echo "Pre-deployment checks..."',
      'ssh_options': 'StrictHostKeyChecking=no'
    },
    development: {
      user: 'orbital',
      host: 'dev.orbitl.org',
      ref: 'origin/develop',
      repo: 'https://github.com/alexg-g/Orbital-Desktop.git',
      path: '/home/orbital/apps/orbital',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env development'
    }
  }
};
