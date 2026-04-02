'use strict';
const mongoose = require('mongoose');

/**
 * Holiday
 * ────────
 * Stores holidays for an organization.
 * Sources:
 *   - 'google'  — synced from Google Calendar API (Indian public holidays)
 *   - 'manual'  — added by HR/admin manually
 *
 * During attendance processing, any day matching a holiday is marked
 * as 'holiday' instead of 'absent'.
 */
const HolidaySchema = new mongoose.Schema({
  holidayId:   { type: String, required: true, unique: true, index: true },
  orgId:       { type: String, required: true, index: true },

  // Date stored as "YYYY-MM-DD"
  date:        { type: String, required: true },

  name:        { type: String, required: true },      // "Republic Day", "Diwali"
  description: { type: String, default: null },
  type:        { type: String, default: 'public',
    enum: ['public', 'restricted', 'optional', 'org-specific'] },

  // Source tracking
  source:      { type: String, default: 'manual', enum: ['google', 'manual'] },
  googleId:    { type: String, default: null },        // Google Calendar event ID

  isActive:    { type: Boolean, default: true },
  createdBy:   { type: String, default: null },

}, { timestamps: true });

HolidaySchema.index({ orgId: 1, date: 1 });
HolidaySchema.index({ orgId: 1, date: 1, isActive: 1 });

module.exports = mongoose.model('Holiday', HolidaySchema);
