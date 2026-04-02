'use strict';
/**
 * auth/rateLimits.js
 * ──────────────────
 * Works with express-rate-limit v6, v7, and v8.
 * Does NOT use ipKeyGenerator — uses req.ip directly with a safe normalizer.
 */

const rateLimit = require('express-rate-limit');

// Safely extract IP from request — handles IPv4, IPv4-mapped IPv6 (::ffff:x.x.x.x),
// and pure IPv6. Falls back to 'unknown' so the limiter never throws.
function getIp(req) {
  const raw = req.ip
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || 'unknown';
  // Normalise IPv4-mapped IPv6 addresses: ::ffff:1.2.3.4 → 1.2.3.4
  return raw.replace(/^::ffff:/i, '');
}

const handler = (window) => (req, res) =>
  res.status(429).json({
    error: `Too many requests. Please try again after ${window}.`,
  });

// ── OTP send: 5 / 15 min per IP + identity ───────────────────────────────────
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('15 minutes'),
  keyGenerator: (req) =>
    `otp:${getIp(req)}:${req.body?.mobile || req.body?.email || ''}`,
});

// ── OTP verify: 10 / 15 min per IP ───────────────────────────────────────────
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('15 minutes'),
  keyGenerator: (req) => getIp(req),
});

// ── Login: 10 / 15 min per IP + identity ─────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('15 minutes'),
  keyGenerator: (req) =>
    `login:${getIp(req)}:${req.body?.mobile || req.body?.email || ''}`,
});

// ── Refresh token: 30 / 15 min per IP ────────────────────────────────────────
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('15 minutes'),
  keyGenerator: (req) => getIp(req),
});

// ── Admin API: 120 / 1 min per IP ─────────────────────────────────────────────
const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('1 minute'),
  keyGenerator: (req) => getIp(req),
});

// ── General API: 300 / 1 min per IP ──────────────────────────────────────────
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('1 minute'),
  keyGenerator: (req) => getIp(req),
});

// ── Strict admin (destructive ops): 30 / hour per IP ─────────────────────────
const strictAdminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('1 hour'),
  keyGenerator: (req) => getIp(req),
});

module.exports = {
  otpSendLimiter,
  otpVerifyLimiter,
  loginLimiter,
  refreshLimiter,
  adminApiLimiter,
  generalApiLimiter,
  strictAdminLimiter,
};
