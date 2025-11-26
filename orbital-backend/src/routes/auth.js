const express = require('express');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const { asyncHandler, validationError, conflictError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const { isValidEmail, normalizeEmail } = require('../utils/emailNormalization');

const router = express.Router();

/**
 * Authentication API Endpoints
 *
 * Handles user signup and login with JWT token generation.
 */

const BCRYPT_ROUNDS = 12;

/**
 * Validate username format
 */
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return 'Username is required';
  }

  if (username.length < 3 || username.length > 50) {
    return 'Username must be between 3 and 50 characters';
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return 'Username can only contain letters, numbers, and underscores';
  }

  return null;
}

/**
 * Validate password strength
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }

  if (password.length < 12) {
    return 'Password must be at least 12 characters';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }

  return null;
}

/**
 * POST /api/signup
 * Register new user account
 *
 * Requires a valid invite code that matches the provided email address.
 * This is a closed beta - no account creation without an invite.
 */
router.post('/signup', asyncHandler(async (req, res) => {
  const { username, password, email, inviteCode, public_key } = req.body;

  // Validate username
  const usernameError = validateUsername(username);
  if (usernameError) {
    throw validationError(usernameError);
  }

  // Validate password
  const passwordError = validatePassword(password);
  if (passwordError) {
    throw validationError(passwordError);
  }

  // Validate email
  if (!email) {
    throw validationError('Email is required');
  }
  if (!isValidEmail(email)) {
    throw validationError('Invalid email format');
  }

  // Validate invite code
  if (!inviteCode) {
    throw validationError('Invite code is required');
  }
  if (inviteCode.length !== 8) {
    throw validationError('Invalid invite code format');
  }

  // Validate public key
  if (!public_key || typeof public_key !== 'object') {
    throw validationError('Public key is required and must be a JSON object (JWK format)');
  }

  // Normalize the provided email for comparison
  const normalizedEmail = normalizeEmail(email);
  const emailLower = email.toLowerCase().trim();

  // Check if username already exists
  const existingUser = await db.query(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );

  if (existingUser.rowCount > 0) {
    throw conflictError('Username already taken');
  }

  // Check if email already exists
  const existingEmail = await db.query(
    'SELECT id FROM users WHERE normalized_email = $1',
    [normalizedEmail]
  );

  if (existingEmail.rowCount > 0) {
    throw conflictError('An account with this email already exists');
  }

  // Look up the invite code
  const codeResult = await db.query(
    `SELECT id, group_id, expires_at, used_by, normalized_target_email
     FROM invite_codes
     WHERE code = $1`,
    [inviteCode.toUpperCase()]
  );

  if (codeResult.rowCount === 0) {
    throw validationError('Invalid invite code');
  }

  const code = codeResult.rows[0];

  // Check if code is already used
  if (code.used_by) {
    throw validationError('This invite code has already been used');
  }

  // Check if code is expired
  if (new Date(code.expires_at) < new Date()) {
    throw validationError('This invite code has expired');
  }

  // Check if email matches the invite code's target email
  if (code.normalized_target_email !== normalizedEmail) {
    logger.warn('Signup attempt with mismatched email', {
      providedEmail: emailLower,
      providedNormalized: normalizedEmail,
      targetNormalized: code.normalized_target_email,
      inviteCode: inviteCode.toUpperCase()
    });
    throw validationError('This invite code was sent to a different email address');
  }

  // All validations passed - create the user and mark code as used
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user with email
    const result = await client.query(
      `INSERT INTO users (username, password_hash, public_key, email, normalized_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, public_key, created_at`,
      [username, passwordHash, JSON.stringify(public_key), emailLower, normalizedEmail]
    );

    const user = result.rows[0];

    // Mark invite code as used
    await client.query(
      `UPDATE invite_codes
       SET used_by = $1, used_at = NOW()
       WHERE id = $2`,
      [user.id, code.id]
    );

    // Add user to the group associated with the invite code
    // For now, we don't auto-join - they'll need to provide encrypted_group_key
    // This could be enhanced later with a key exchange flow

    await client.query('COMMIT');

    // Generate JWT token
    const token = generateToken(user);

    logger.info('User registered via invite code', {
      userId: user.id,
      username: user.username,
      email: emailLower,
      inviteCode: inviteCode.toUpperCase(),
      groupId: code.group_id
    });

    res.status(201).json({
      user_id: user.id,
      username: user.username,
      email: user.email,
      token,
      groupId: code.group_id // Client can use this to initiate key exchange
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/login
 * Authenticate existing user
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw validationError('Username and password are required');
  }

  // Fetch user
  const result = await db.query(
    'SELECT id, username, password_hash, public_key FROM users WHERE username = $1',
    [username]
  );

  if (result.rowCount === 0) {
    // Don't reveal whether username exists
    logger.warn('Login attempt with non-existent username', { username });
    throw validationError('Invalid credentials');
  }

  const user = result.rows[0];

  // Verify password
  const passwordValid = await bcrypt.compare(password, user.password_hash);

  if (!passwordValid) {
    logger.warn('Login attempt with invalid password', {
      userId: user.id,
      username: user.username
    });
    throw validationError('Invalid credentials');
  }

  // Generate JWT token
  const token = generateToken(user);

  logger.info('User logged in', {
    userId: user.id,
    username: user.username
  });

  res.status(200).json({
    user_id: user.id,
    username: user.username,
    public_key: user.public_key,
    token
  });
}));

/**
 * POST /api/verify-token
 * Verify if JWT token is valid (for client-side token refresh)
 */
router.post('/verify-token', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw validationError('Token is required');
  }

  try {
    const { verifyToken } = require('../middleware/auth');
    const decoded = verifyToken(token);

    // Fetch user to ensure still exists
    const result = await db.query(
      'SELECT id, username FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      throw validationError('User not found');
    }

    const user = result.rows[0];

    res.status(200).json({
      valid: true,
      user_id: user.id,
      username: user.username
    });
  } catch (error) {
    logger.debug('Token verification failed', {
      error: error.message
    });

    res.status(200).json({
      valid: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/users/:username/public-key
 * Get public key for a user (for encryption key exchange)
 */
router.get('/users/:username/public-key', asyncHandler(async (req, res) => {
  const { username } = req.params;

  const result = await db.query(
    'SELECT id, username, public_key FROM users WHERE username = $1',
    [username]
  );

  if (result.rowCount === 0) {
    throw validationError('User not found');
  }

  const user = result.rows[0];

  res.status(200).json({
    user_id: user.id,
    username: user.username,
    public_key: user.public_key
  });
}));

module.exports = router;
