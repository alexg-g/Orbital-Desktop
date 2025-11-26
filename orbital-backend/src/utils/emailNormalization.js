/**
 * Email Normalization Utility
 *
 * Normalizes email addresses for consistent comparison.
 * Handles Gmail-specific rules (dots, plus aliases).
 */

/**
 * Validates email format using a basic regex.
 * @param {string} email - The email to validate
 * @returns {boolean} - True if valid format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // Basic email validation - allows most valid emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Normalizes an email address for consistent comparison.
 *
 * Rules:
 * - Converts to lowercase
 * - For Gmail/Googlemail:
 *   - Removes dots from local part (j.o.h.n@gmail.com -> john@gmail.com)
 *   - Strips +alias suffixes (john+test@gmail.com -> john@gmail.com)
 *   - Normalizes googlemail.com to gmail.com
 *
 * @param {string} email - The email to normalize
 * @returns {string} - The normalized email
 * @throws {Error} - If email format is invalid
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required');
  }

  const trimmed = email.trim().toLowerCase();

  if (!isValidEmail(trimmed)) {
    throw new Error('Invalid email format');
  }

  const atIndex = trimmed.lastIndexOf('@');
  let localPart = trimmed.substring(0, atIndex);
  let domain = trimmed.substring(atIndex + 1);

  // Gmail normalization
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Remove dots from local part
    localPart = localPart.replace(/\./g, '');

    // Strip +alias suffix
    const plusIndex = localPart.indexOf('+');
    if (plusIndex !== -1) {
      localPart = localPart.substring(0, plusIndex);
    }

    // Normalize googlemail.com to gmail.com
    domain = 'gmail.com';
  }

  return `${localPart}@${domain}`;
}

/**
 * Compares two email addresses for equality after normalization.
 *
 * @param {string} email1 - First email
 * @param {string} email2 - Second email
 * @returns {boolean} - True if emails match after normalization
 */
function emailsMatch(email1, email2) {
  try {
    return normalizeEmail(email1) === normalizeEmail(email2);
  } catch {
    return false;
  }
}

module.exports = {
  isValidEmail,
  normalizeEmail,
  emailsMatch,
};
