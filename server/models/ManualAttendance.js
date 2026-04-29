'use strict';
const mongoose = require('mongoose');

/**
 * ManualAttendance
 * ─────────────────
 * Overrides or supplements AttendanceLog for a specific employee on a date.
 * Used when:
 *   - Employee forgot to punch — HR enters manually
 *   - Machine was offline — HR reconstructs attendance
 *   - Leave adjustments — mark as leave/holiday
 *   - Correction after payroll dispute
 *
 * Resolution priority (highest wins):
 *   ManualAttendance > processed AttendanceLog
 */
const ManualAttendanceSchema = new mongoose.Schema({
  // ── Identity ─────────────────────────────────────────────────────────────
  manualId:    { type: String, required: true, unique: true, index: true },
  orgId:       { type: String, required: true, index: true },
  employeeId:  { type: String, required: true, index: true },

  // ── Date (stored as YYYY-MM-DD string for easy filtering) ────────────────
  date:        { type: String, required: true },   // "2026-03-20"

  // ── Status override ───────────────────────────────────────────────────────
  status: {
    type: String, required: true,
    enum: ['present','on-duty','absent','half-day','late','on-leave','holiday','week-off','paid-leave','sick-leave','comp-off'],
  },

  // ── Optional time override ────────────────────────────────────────────────
  inTime:      { type: String, default: null },   // "09:15"
  outTime:     { type: String, default: null },   // "18:30"
  workedMinutes: { type: Number, default: null },

  // ── Leave details ─────────────────────────────────────────────────────────
  leaveType:   { type: String, default: null },   // 'casual','sick','earned', etc.
  leaveHalf:   { type: String, default: null, enum: [null, 'first', 'second'] },

  // ── Audit ─────────────────────────────────────────────────────────────────
  reason:      { type: String, default: null },   // HR note
  createdBy:   { type: String, required: true },  // userId of HR/admin who made entry
  updatedBy:   { type: String, default: null },

}, { timestamps: true });

ManualAttendanceSchema.index({ orgId: 1, date: 1 });
ManualAttendanceSchema.index({ orgId: 1, employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ManualAttendance', ManualAttendanceSchema);
