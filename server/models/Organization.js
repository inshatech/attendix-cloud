'use strict';
const mongoose = require('mongoose');

/**
 * Organization — created by a subscribed user (owner).
 *
 * Relationship:
 *   AuthUser (owner) → has Subscription → can create Organizations
 *   Organization → has exactly ONE Bridge
 *   Bridge → has multiple Devices (biometric machines)
 *
 * bridgeId links to the existing Bridge collection in app.js.
 * It is populated either by connecting an existing bridge or by the
 * POST /api/admin/bridges route which auto-generates a bridgeId.
 */
const OrganizationSchema = new mongoose.Schema({
  orgId:          { type: String, unique: true, required: true, index: true },
  ownerId:        { type: String, required: true, index: true },  // AuthUser.userId
  name:           { type: String, required: true },
  industry:       { type: String, default: null },
  address:        { type: String, default: null },
  city:           { type: String, default: null },
  state:          { type: String, default: null },
  country:        { type: String, default: 'India' },
  phone:          { type: String, default: null },
  email:          { type: String, default: null },
  logoUrl:        { type: String, default: null },

  // The one bridge this org uses
  bridgeId:       { type: String, default: null, index: true },   // Bridge.bridgeId
  bridgeConnectedAt: { type: Date, default: null },

  // Status — suspended when subscription expires
  isActive:       { type: Boolean, default: true, index: true },
  suspendedAt:    { type: Date, default: null },
  suspendReason:  { type: String, default: null },

  // Subscription snapshot (denormalised for quick access)
  subscriptionId: { type: String, default: null },

  meta:           { type: Object, default: {} },

  // Daily attendance report schedule
  reportSchedule: {
    enabled:      { type: Boolean, default: false },
    sendTime:     { type: String,  default: '20:00' },    // HH:MM 24h in org timezone
    timezone:     { type: String,  default: 'Asia/Kolkata' },
    recipients:   { type: Array,   default: [] },         // [{ name, email, mobile }]
    lastSentAt:   { type: Date,    default: null },
    lastSentDate: { type: String,  default: null },       // YYYY-MM-DD, prevents double-send
  },
}, { timestamps: true });

OrganizationSchema.index({ ownerId: 1, isActive: 1 });
OrganizationSchema.index({ bridgeId: 1 });

module.exports = mongoose.model('Organization', OrganizationSchema);
