'use strict';
const mongoose = require('mongoose');

/**
 * Coupon model — full discount rules
 *
 * Types:
 *   percentage  — e.g. 20% off, optional maxDiscount cap
 *   flat        — e.g. ₹200 off
 *   trial_ext   — adds N free days to trial instead of charging
 */
const CouponSchema = new mongoose.Schema({
  // Identity
  couponId:     { type: String, unique: true, sparse: true, index: true },
  code:         { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  description:  { type: String, default: '' },
  createdBy:    { type: String, default: null },  // admin userId

  // Discount type
  discountType: {
    type: String,
    enum: ['percentage', 'flat', 'trial_ext'],
    required: true,
  },
  discountValue: { type: Number, required: true },  // % | ₹ | days
  maxDiscount:   { type: Number, default: null },   // cap for percentage (e.g. max ₹500)

  // Restrictions
  applicablePlans:  { type: [String], default: [] },  // [] = all plans
  applicableCycles: {
    type: [String],
    enum: ['monthly', 'yearly', 'both'],
    default: ['both'],
  },
  minAmount:  { type: Number, default: 0 },    // minimum order amount to apply

  // Usage limits
  maxUses:        { type: Number, default: null },   // null = unlimited total uses
  maxUsesPerUser: { type: Number, default: 1 },      // per-user limit (1 = one-time)
  usedCount:      { type: Number, default: 0 },      // total times used

  // Validity window
  validFrom: { type: Date, default: Date.now },
  validTo:   { type: Date, default: null },    // null = no expiry

  // Status
  isActive: { type: Boolean, default: true, index: true },

}, { timestamps: true });

CouponSchema.index({ code: 1, isActive: 1 });

// Per-user usage tracking (separate collection for efficiency)
const CouponUsageSchema = new mongoose.Schema({
  couponId: { type: String, required: true, index: true },
  code:     { type: String, required: true },
  userId:   { type: String, required: true },
  usedAt:   { type: Date,   default: Date.now },
  subscriptionId: { type: String, default: null },
  discount: { type: Number, default: 0 },
});
CouponUsageSchema.index({ couponId: 1, userId: 1 });

const Coupon      = mongoose.model('Coupon',      CouponSchema);
const CouponUsage = mongoose.model('CouponUsage', CouponUsageSchema);

module.exports = { Coupon, CouponUsage };
