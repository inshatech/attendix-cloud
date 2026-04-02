'use strict';
const mongoose = require('mongoose');

/**
 * Employee
 * ─────────
 * Central HR record. Links to:
 *   - MachineUser via  employeeId (= userId field on MachineUser)
 *   - Shift        via  shiftId
 *   - AttendanceLog via employeeId
 *   - AuthUser     via  authUserId (optional — only if they also log into the app)
 *
 * employeeId is the canonical cross-collection key (stored as userId in legacy collections).
 */

// ── Address sub-schema ────────────────────────────────────────────────────────
const AddressSchema = new mongoose.Schema({
  line1:    { type: String, default: null },
  line2:    { type: String, default: null },
  city:     { type: String, default: null },
  state:    { type: String, default: null },
  pincode:  { type: String, default: null },
  country:  { type: String, default: 'India' },
}, { _id: false });

// ── Emergency contact sub-schema ──────────────────────────────────────────────
const EmergencyContactSchema = new mongoose.Schema({
  name:         { type: String, default: null },
  relationship: { type: String, default: null },
  phone:        { type: String, default: null },
  phone2:       { type: String, default: null },
}, { _id: false });

// ── Bank details sub-schema ───────────────────────────────────────────────────
const BankSchema = new mongoose.Schema({
  accountNumber:  { type: String, default: null },
  accountName:    { type: String, default: null },
  bankName:       { type: String, default: null },
  ifscCode:       { type: String, default: null },
  branchName:     { type: String, default: null },
  accountType:    { type: String, default: 'savings', enum: ['savings', 'current'] },
}, { _id: false });

// ── Leave balance sub-schema ───────────────────────────────────────────────────
const LeaveBalanceSchema = new mongoose.Schema({
  casual:   { type: Number, default: 0 },
  sick:     { type: Number, default: 0 },
  earned:   { type: Number, default: 0 },
  maternity:{ type: Number, default: 0 },
  paternity:{ type: Number, default: 0 },
  other:    { type: Number, default: 0 },
}, { _id: false });

// ── Main Employee schema ───────────────────────────────────────────────────────
const EmployeeSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────────────────────────
  employeeId:     { type: String, required: true, unique: true, index: true },   // canonical key
  employeeCode:   { type: String, default: null, index: true, sparse: true },     // e.g. EMP001
  authUserId:     { type: String, default: null, index: true, sparse: true },     // link to AuthUser (optional)
  orgId:          { type: String, required: true, index: true },

  // ── Personal ──────────────────────────────────────────────────────────────
  firstName:      { type: String, required: true },
  lastName:       { type: String, default: null },
  displayName:    { type: String, default: null },          // auto-set if blank
  gender:         { type: String, default: null, enum: [null, 'male', 'female', 'other'] },
  dateOfBirth:    { type: Date,   default: null },
  nationality:    { type: String, default: 'Indian' },
  maritalStatus:  { type: String, default: null, enum: [null, 'single', 'married', 'divorced', 'widowed'] },
  bloodGroup:     { type: String, default: null },
  photoUrl:       { type: String, default: null },          // Cloudinary URL

  // ── Contact ───────────────────────────────────────────────────────────────
  email:          { type: String, default: null, index: true, sparse: true },
  mobile:         { type: String, default: null },
  mobile2:        { type: String, default: null },
  address:        { type: AddressSchema, default: () => ({}) },
  emergencyContact: { type: EmergencyContactSchema, default: () => ({}) },

  // ── Employment ────────────────────────────────────────────────────────────
  department:     { type: String, default: null, index: true },
  designation:    { type: String, default: null },
  employeeType:   { type: String, default: 'full-time', enum: ['full-time', 'part-time', 'contract', 'intern', 'consultant'] },
  joiningDate:    { type: Date,   default: null },
  confirmationDate: { type: Date, default: null },
  leavingDate:    { type: Date,   default: null },
  leavingReason:  { type: String, default: null },
  status:         { type: String, default: 'active', enum: ['active', 'inactive', 'terminated', 'resigned', 'absconded'], index: true },
  reportingTo:    { type: String, default: null },          // employeeId of manager
  branchLocation: { type: String, default: null },

  // ── Shift & Attendance ────────────────────────────────────────────────────
  shiftId:        { type: String, default: null, index: true },
  weeklyOffDays:  { type: [Number], default: [0] },         // 0=Sun,1=Mon,...,6=Sat
  overtimeAllowed:{ type: Boolean, default: false },
  overtimeRate:   { type: Number, default: 1.5 },           // multiplier
  graceMinutes:   { type: Number, default: 0 },             // late-in grace period
  halfDayMinutes: { type: Number, default: 240 },           // min mins for half-day (4hrs)
  fullDayMinutes: { type: Number, default: 480 },           // min mins for full-day (8hrs)

  // ── Payroll ───────────────────────────────────────────────────────────────
  salary:         { type: Number, default: null },
  salaryType:     { type: String, default: 'monthly', enum: ['monthly', 'daily', 'hourly'] },
  bankDetails:    { type: BankSchema, default: () => ({}) },
  panNumber:      { type: String, default: null },
  pfNumber:       { type: String, default: null },           // Provident Fund
  esiNumber:      { type: String, default: null },           // ESI
  uanNumber:      { type: String, default: null },           // Universal Account Number (EPF)

  // ── Leave entitlement ─────────────────────────────────────────────────────
  leaveBalance:   { type: LeaveBalanceSchema, default: () => ({}) },

  // ── Biometric machine link ────────────────────────────────────────────────
  // MachineUser documents reference this employeeId as their userId field
  // Extra metadata from machine enrollment stored here for convenience
  machineEnrollments: [{
    bridgeId:  { type: String },
    deviceId:  { type: String },
    uid:       { type: Number },         // biometric UID on the machine
    cardno:    { type: String },
    enrolledAt:{ type: Date, default: Date.now },
    _id: false,
  }],

  // ── Documents ─────────────────────────────────────────────────────────────
  documents: [{
    type:       { type: String },        // 'aadhaar','pan','passport','offer_letter', etc.
    number:     { type: String },
    fileUrl:    { type: String },
    expiresAt:  { type: Date },
    _id: false,
  }],

  // ── Custom fields ─────────────────────────────────────────────────────────
  customFields: { type: Object, default: {} },
  notes:        { type: String, default: null },

}, { timestamps: true });

// Computed display name before save
EmployeeSchema.pre('save', function (next) {
  if (!this.displayName) {
    this.displayName = [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  next();
});

EmployeeSchema.index({ orgId: 1, status: 1 });
EmployeeSchema.index({ orgId: 1, department: 1 });
EmployeeSchema.index({ orgId: 1, shiftId: 1 });

module.exports = mongoose.model('Employee', EmployeeSchema);