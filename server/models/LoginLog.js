'use strict';
const mongoose = require('mongoose');

const LoginLogSchema = new mongoose.Schema({
  // Who
  email:      { type: String, default: null },   // attempted email (may be wrong/unknown)
  userId:     { type: String, default: null },   // resolved userId (null on failure)

  // Outcome
  result:     { type: String, enum: ['success', 'failed', 'blocked'], required: true },
  reason:     { type: String, default: null },   // e.g. 'wrong_password', 'honeypot', 'turnstile', '2fa_required'

  // Network
  ip:         { type: String, default: null },
  isp:        { type: String, default: null },
  city:       { type: String, default: null },
  region:     { type: String, default: null },
  country:    { type: String, default: null },

  // Client
  userAgent:  { type: String, default: null },
}, { timestamps: true });

// TTL — auto-delete logs older than 90 days
LoginLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
LoginLogSchema.index({ email: 1, createdAt: -1 });
LoginLogSchema.index({ ip: 1,    createdAt: -1 });
LoginLogSchema.index({ result: 1, createdAt: -1 });

module.exports = mongoose.model('LoginLog', LoginLogSchema);
