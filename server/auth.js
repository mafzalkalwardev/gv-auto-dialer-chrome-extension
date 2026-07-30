/* ------------------------------------------------------------------
 * auth.js — password hashing and session tokens.
 * Uses Node's built-in crypto only (scrypt) — no native dependency to
 * compile, so it deploys cleanly on Render's free tier every time.
 * ------------------------------------------------------------------ */

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  // Constant-time compare to avoid leaking timing info.
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const PLAN_DURATIONS_MS = {
  trial_1h: 60 * 60 * 1000,
  day_1: 24 * 60 * 60 * 1000,
  week_1: 7 * 24 * 60 * 60 * 1000,
  days_15: 15 * 24 * 60 * 60 * 1000,
  month_1: 30 * 24 * 60 * 60 * 1000,
  year_1: 365 * 24 * 60 * 60 * 1000,
};

const PLAN_LABELS = {
  trial_1h: '1-hour trial',
  day_1: '1 day',
  week_1: '1 week',
  days_15: '15 days',
  month_1: '1 month',
  year_1: '1 year',
};

module.exports = { hashPassword, verifyPassword, generateToken, PLAN_DURATIONS_MS, PLAN_LABELS };
