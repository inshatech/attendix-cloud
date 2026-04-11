'use strict';
const mongoose = require('mongoose');

/**
 * Shift
 * ──────
 * Defines working hours for a group of employees.
 * Used by attendance processing to compute:
 *   - Late arrival, early departure
 *   - Overtime
 *   - Half-day / absent
 *   - Net worked hours after deducting breaks
 */

// ── Day schedule sub-schema ───────────────────────────────────────────────────
// One entry per day of the week (0=Sun … 6=Sat).
// isOff=true  → that day is a weekly off for this shift.
const DayScheduleSchema = new mongoose.Schema({
  day:         { type: Number, required: true, min: 0, max: 6 },  // 0=Sun
  isOff:       { type: Boolean, default: false },
  // Times stored as "HH:MM" 24-hour strings for simplicity & timezone-independence
  inTime:      { type: String, default: null },    // e.g. "09:00"
  outTime:     { type: String, default: null },    // e.g. "18:00"
  // Optional per-day overrides; if null, inherits shift-level defaults
  breakStart:  { type: String, default: null },    // e.g. "13:00"
  breakEnd:    { type: String, default: null },    // e.g. "14:00"
}, { _id: false });

// ── Break period sub-schema ───────────────────────────────────────────────────
const BreakSchema = new mongoose.Schema({
  label:      { type: String, default: 'Lunch Break' },  // Lunch, Tea, etc.
  startTime:  { type: String, required: true },           // "13:00"
  endTime:    { type: String, required: true },           // "14:00"
  isPaid:     { type: Boolean, default: false },
}, { _id: false });

// ── Overtime rules sub-schema ─────────────────────────────────────────────────
const OvertimeRulesSchema = new mongoose.Schema({
  enabled:         { type: Boolean, default: false },
  afterMinutes:    { type: Number,  default: 0 },      // OT starts this many mins after shift end
  maxMinutesPerDay:{ type: Number,  default: 240 },    // cap per day
  roundToMinutes:  { type: Number,  default: 30 },     // round OT to nearest N mins
}, { _id: false });

// ── Late/early rules sub-schema ───────────────────────────────────────────────
const AttendanceRulesSchema = new mongoose.Schema({
  // Grace period — punches within this many minutes of inTime are not marked late
  graceLateMinutes:   { type: Number, default: 5 },
  graceEarlyMinutes:  { type: Number, default: 5 },
  // If employee arrives after this many minutes → half-day
  halfDayAfterMinutes:{ type: Number, default: 120 },
  // Minimum worked minutes to count as present
  minMinutesForPresent:{ type: Number, default: 240 },  // 4 hrs → half day
  minMinutesForFullDay:{ type: Number, default: 420 },  // 7 hrs → full day
  // Deduct break automatically even if employee doesn't punch break
  autoDeductBreak:    { type: Boolean, default: true },
  // Count half days for payroll
  countHalfDays:      { type: Boolean, default: true },
  // Monthly late allowance — number of late arrivals allowed per calendar month
  // 0 = no allowance (every late is marked late)
  // N = first N late days per month are pardoned and counted as Present
  monthlyLateAllowance: { type: Number, default: 0 },
}, { _id: false });

// ── Half-day weekday sub-schema ───────────────────────────────────────────────
// Each entry defines one weekday that is always a half-day, with its own times.
// e.g. { day:5, inTime:"09:30", outTime:"14:00" } → Friday half-day
const HalfDayWeekSchema = new mongoose.Schema({
  day:     { type: Number, required: true, min: 0, max: 6 },
  inTime:  { type: String, default: null },   // "HH:MM" — half-day start
  outTime: { type: String, default: null },   // "HH:MM" — half-day end
}, { _id: false });

// ── Main Shift schema ─────────────────────────────────────────────────────────
const ShiftSchema = new mongoose.Schema({
  shiftId:     { type: String, required: true, unique: true, index: true },
  orgId:       { type: String, required: true, index: true },
  name:        { type: String, required: true },         // "General Shift", "Night Shift"
  code:        { type: String, default: null },          // short code "GEN", "NIGHT"
  color:       { type: String, default: '#58a6ff' },     // UI colour for calendar
  description: { type: String, default: null },
  isActive:    { type: Boolean, default: true, index: true },
  isDefault:   { type: Boolean, default: false },        // auto-assign to new employees

  // ── Shift timing defaults ────────────────────────────────────────────────
  // Applied to all days unless overridden in schedule[]
  defaultInTime:   { type: String, default: '09:00' },   // "HH:MM"
  defaultOutTime:  { type: String, default: '18:00' },
  durationMinutes: { type: Number, default: 540 },       // total scheduled minutes (auto-calc)
  isNightShift:    { type: Boolean, default: false },     // crosses midnight

  // ── Weekly schedule ───────────────────────────────────────────────────────
  // If schedule is empty → use defaultInTime/defaultOutTime for all non-off days
  // weeklyOffDays defines which days are off
  weeklyOffDays:   { type: [Number], default: [0] },     // 0=Sunday off
  halfDayWeekDays: { type: [HalfDayWeekSchema], default: [] }, // weekdays with specific half-day times
  schedule:        { type: [DayScheduleSchema], default: [] },

  // ── Breaks ────────────────────────────────────────────────────────────────
  breaks:          { type: [BreakSchema], default: [] },

  // ── Punch mode ────────────────────────────────────────────────────────────
  // 2-punch   → first punch = in, last punch = out (device-agnostic, recommended)
  // 4-punch   → P1=in, P2=break-out, P3=break-in, P4=out; net = (P2-P1)+(P4-P3)
  //             Falls back to 2-punch when <4 punches on a day
  // type-based → trust device punch-type field (0/4=in, 1/5=out)
  punchMode: { type: String, enum: ['2-punch','4-punch','type-based'], default: '2-punch' },

  // ── Rules ─────────────────────────────────────────────────────────────────
  attendanceRules: { type: AttendanceRulesSchema, default: () => ({}) },
  overtimeRules:   { type: OvertimeRulesSchema,   default: () => ({}) },

  // ── Leave policy override ──────────────────────────────────────────────────
  // Per-shift leave entitlements (overrides org-level default policy).
  // Keys match LEAVE_TYPES: casual, sick, earned, maternity, paternity, other
  // Each value: { enabled, annualQuota, monthlyLeaveCap, carryForward, carryForwardCap }
  leavePolicy: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy:   { type: String, default: null },
  updatedBy:   { type: String, default: null },

}, { timestamps: true });

// Auto-calculate durationMinutes from defaultInTime/defaultOutTime before save
ShiftSchema.pre('save', function (next) {
  if (this.defaultInTime && this.defaultOutTime) {
    const [ih, im] = this.defaultInTime.split(':').map(Number);
    const [oh, om] = this.defaultOutTime.split(':').map(Number);
    let mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins < 0) mins += 1440; // night shift crosses midnight
    // Deduct default paid breaks
    const breakMins = this.breaks.reduce((s, b) => {
      if (!b.isPaid) {
        const [bsh, bsm] = b.startTime.split(':').map(Number);
        const [beh, bem] = b.endTime.split(':').map(Number);
        s += (beh * 60 + bem) - (bsh * 60 + bsm);
      }
      return s;
    }, 0);
    this.durationMinutes = Math.max(0, mins - breakMins);
  }
  next();
});

ShiftSchema.index({ orgId: 1, isActive: 1 });

const ShiftModel = mongoose.model('Shift', ShiftSchema);

// One-time migration: convert old halfDayWeekDays [Number] → [{ day, inTime, outTime }]
// Runs once when the MongoDB connection is ready.
mongoose.connection.once('open', async () => {
  try {
    const result = await mongoose.connection.collection('shifts').updateMany(
      { 'halfDayWeekDays.0': { $type: 'number' } },
      [{
        $set: {
          halfDayWeekDays: {
            $map: {
              input: '$halfDayWeekDays',
              as: 'd',
              in: { day: '$$d', inTime: null, outTime: null },
            },
          },
        },
      }]
    );
    if (result.modifiedCount > 0)
      console.log(`[Shift] Migrated ${result.modifiedCount} shift(s): halfDayWeekDays Number → Object`);
  } catch (e) {
    console.error('[Shift] halfDayWeekDays migration error:', e.message);
  }
});

module.exports = ShiftModel;