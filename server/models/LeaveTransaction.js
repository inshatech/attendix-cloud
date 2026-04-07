'use strict';
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * LeaveTransaction — audit log of every leave credit / debit / carry-forward.
 *
 * txnType:
 *   'opening'     — opening balance set by admin (before app use)
 *   'credit'      — annual credit, manual credit by admin
 *   'debit'       — leave taken (linked to ManualAttendance record)
 *   'carryforward'— balance carried from previous leave year
 *   'adjustment'  — admin correction
 *
 * days: positive = credit, negative = debit
 */
const LeaveTransactionSchema = new mongoose.Schema({
  txnId:       { type: String, unique: true, default: () => `ltx-${uuidv4().split('-')[0]}${uuidv4().split('-')[0]}` },
  orgId:       { type: String, required: true, index: true },
  employeeId:  { type: String, required: true, index: true },
  leaveType:   { type: String, required: true, enum: ['casual','sick','earned','maternity','paternity','other'] },
  txnType:     { type: String, required: true, enum: ['opening','credit','debit','carryforward','adjustment'] },
  days:        { type: Number, required: true },    // positive = credit, negative = debit
  date:        { type: String, required: true },    // YYYY-MM-DD (effective date)
  leaveYear:   { type: String, required: true },    // YYYY-MM (leave year start, e.g. '2025-04')
  manualAttId: { type: String, default: null },     // link to ManualAttendance for debits
  notes:       { type: String, default: '' },
  createdBy:   { type: String, default: null },     // AuthUser.userId
}, { timestamps: true });

LeaveTransactionSchema.index({ orgId: 1, employeeId: 1 });
LeaveTransactionSchema.index({ orgId: 1, employeeId: 1, leaveYear: 1 });
LeaveTransactionSchema.index({ orgId: 1, leaveType: 1, date: -1 });

module.exports = mongoose.model('LeaveTransaction', LeaveTransactionSchema);
