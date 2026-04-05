'use strict';
const mongoose = require('mongoose');

/**
 * NotificationQueue
 * ─────────────────
 * Stores outgoing punch notifications waiting to be sent.
 * A worker in app.js polls this every 5 seconds and drains
 * up to 20 items per batch, respecting channel rate limits.
 *
 * status: pending → sending → sent | failed
 * retries: incremented on each failed attempt (max 3)
 */
const NotificationQueueSchema = new mongoose.Schema({
  // What to send
  type:       { type: String, default: 'punch', enum: ['punch'] },
  orgId:      { type: String, required: true, index: true },
  employeeId: { type: String, required: true },

  // Punch details
  empName:    { type: String, default: null },
  direction:  { type: String, enum: ['IN', 'OUT', 'UNKNOWN'], default: 'UNKNOWN' },
  punchTime:  { type: Date,   required: true },
  deviceName: { type: String, default: null },
  deviceId:   { type: String, default: null },

  // Recipients
  guardianName:   { type: String, default: null },
  guardianEmail:  { type: String, default: null },
  guardianMobile: { type: String, default: null },

  // Channels to try (in order)
  channels:   { type: [String], default: ['whatsapp', 'sms', 'email'] },

  // Lifecycle
  status:     { type: String, default: 'pending', enum: ['pending', 'sent', 'failed'], index: true },
  retries:    { type: Number, default: 0 },
  lastError:  { type: String, default: null },
  sentAt:     { type: Date,   default: null },

}, { timestamps: true });

NotificationQueueSchema.index({ status: 1, createdAt: 1 });
NotificationQueueSchema.index({ orgId: 1, employeeId: 1, direction: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationQueue', NotificationQueueSchema);
