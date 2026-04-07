'use strict';
const mongoose = require('mongoose');

// Per-type leave configuration
const LeaveTypeConfigSchema = new mongoose.Schema({
  enabled:         { type: Boolean, default: true },
  annualQuota:     { type: Number,  default: 0 },   // days credited per leave year
  monthlyLeaveCap: { type: Number,  default: 0 },   // max days per calendar month (0 = no cap)
  carryForward:    { type: Boolean, default: false },
  carryForwardCap: { type: Number,  default: 0 },   // max days to carry (0 = unlimited)
}, { _id: false });

// Professional Tax slab (₹ per month, prorated for partial months)
const PtSlabSchema = new mongoose.Schema({
  min: { type: Number, default: 0    },   // monthly gross >= min
  max: { type: Number, default: null },   // monthly gross <= max  (null = no upper limit)
  pt:  { type: Number, default: 0    },   // PT amount in ₹
}, { _id: false });

/**
 * LeavePolicy — one document per organization.
 * Stores leave-type configuration, PT slabs, and leave-year start month.
 */
const LeavePolicySchema = new mongoose.Schema({
  orgId: { type: String, required: true, unique: true, index: true },

  // Which calendar month the leave year starts (1=Jan … 12=Dec)
  leaveYearStartMonth: { type: Number, default: 4, min: 1, max: 12 },  // 4 = April (Indian fiscal)

  types: {
    casual:    { type: LeaveTypeConfigSchema, default: () => ({ enabled: true,  annualQuota: 12,  monthlyLeaveCap: 2, carryForward: false, carryForwardCap: 0 }) },
    sick:      { type: LeaveTypeConfigSchema, default: () => ({ enabled: true,  annualQuota: 6,   monthlyLeaveCap: 0, carryForward: false, carryForwardCap: 0 }) },
    earned:    { type: LeaveTypeConfigSchema, default: () => ({ enabled: true,  annualQuota: 18,  monthlyLeaveCap: 0, carryForward: true,  carryForwardCap: 30 }) },
    maternity: { type: LeaveTypeConfigSchema, default: () => ({ enabled: true,  annualQuota: 182, monthlyLeaveCap: 0, carryForward: false, carryForwardCap: 0 }) },
    paternity: { type: LeaveTypeConfigSchema, default: () => ({ enabled: false, annualQuota: 15,  monthlyLeaveCap: 0, carryForward: false, carryForwardCap: 0 }) },
    other:     { type: LeaveTypeConfigSchema, default: () => ({ enabled: true,  annualQuota: 0,   monthlyLeaveCap: 0, carryForward: false, carryForwardCap: 0 }) },
  },

  // Professional Tax slabs — processed in order, first match wins
  ptSlabs: {
    type: [PtSlabSchema],
    default: () => [
      { min: 0,     max: 10000, pt: 0   },
      { min: 10001, max: 15000, pt: 150 },
      { min: 15001, max: null,  pt: 200 },
    ],
  },
}, { timestamps: true });

module.exports = mongoose.model('LeavePolicy', LeavePolicySchema);
