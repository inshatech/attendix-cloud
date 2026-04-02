'use strict';
const mongoose = require('mongoose');

/**
 * SubscriptionPlan — admin-defined tiers.
 * e.g. Free Trial, Starter, Professional, Enterprise
 *
 * Limits enforced at runtime:
 *   maxBridges      — how many bridges (organizations) the user can have
 *   maxDevices      — total devices across all bridges
 *   maxEmployees    — total employee (MachineUser) records
 *   retentionDays   — attendance log retention (0 = unlimited)
 */
const SubscriptionPlanSchema = new mongoose.Schema({
  planId:         { type: String, unique: true, required: true, index: true },
  name:           { type: String, required: true },           // 'Free Trial', 'Starter' …
  description:    { type: String, default: '' },
  isActive:       { type: Boolean, default: true, index: true },
  isTrial:        { type: Boolean, default: false },

  // Pricing
  priceMonthly:   { type: Number, default: 0 },               // INR / currency
  priceYearly:    { type: Number, default: 0 },
  currency:       { type: String, default: 'INR' },

  // Limits
  maxBridges:     { type: Number, default: 1 },               // orgs / bridges
  maxDevices:     { type: Number, default: 3 },               // biometric machines
  maxEmployees:   { type: Number, default: 50 },              // machine users
  retentionDays:  { type: Number, default: 90 },              // 0 = forever

  // Trial config
  trialDays:      { type: Number, default: 14 },

  // Features flags (extend freely)
  features: {
    realtimePunch:  { type: Boolean, default: true },
    bulkSms:        { type: Boolean, default: false },
    whatsappOtp:    { type: Boolean, default: false },
    advancedReports:{ type: Boolean, default: false },
    apiAccess:      { type: Boolean, default: false },
  },

  icon:           { type: String, default: null },   // emoji e.g. '🚀' or icon name
  color:          { type: String, default: null },   // hex accent color e.g. '#58a6ff'
  sortOrder:      { type: Number, default: 0 },
  createdBy:      { type: String, default: null },
}, { timestamps: true });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);

// ── UserSubscription — one per organisation owner ────────────────────────────
const UserSubscriptionSchema = new mongoose.Schema({
  subscriptionId: { type: String, unique: true, required: true, index: true },
  userId:         { type: String, required: true, index: true },  // AuthUser.userId

  planId:         { type: String, required: true, index: true },
  billingCycle:   { type: String, enum: ['monthly', 'yearly', 'trial'], default: 'trial' },

  // Dates
  startDate:      { type: Date, required: true },
  endDate:        { type: Date, required: true, index: true },    // auto-disconnect after this
  trialEndsAt:    { type: Date, default: null },

  // Status
  status: {
    type: String,
    enum: ['trial', 'active', 'expired', 'cancelled', 'suspended'],
    default: 'trial',
    index: true,
  },

  // Auto-renew
  autoRenew:      { type: Boolean, default: false },

  // Payment reference (free-form, no payment gateway wired here)
  paymentRef:     { type: String, default: null },
  paidAmount:     { type: Number, default: 0 },

  // Suspension / expiry tracking
  expiredAt:      { type: Date, default: null },
  cancelledAt:    { type: Date, default: null },
  suspendedAt:    { type: Date, default: null },
  suspendReason:  { type: String, default: null },

  notes:          { type: String, default: null },
  assignedBy:     { type: String, default: null },   // admin userId who applied it (if manual)
  createdBy:      { type: String, default: null },

  // Payment gateway details
  gateway:        { type: String, default: null },   // 'razorpay'|'phonepe'|'paytm'|'ccavenue'|'manual'
  transactionId:  { type: String, default: null },   // gateway transaction ID
  refundedAt:     { type: Date,   default: null },
  refundRef:      { type: String, default: null },
  refundAmount:   { type: Number, default: 0 },
  refundNotes:    { type: String, default: null },
}, { timestamps: true });

UserSubscriptionSchema.index({ userId: 1, status: 1 });
UserSubscriptionSchema.index({ endDate: 1, status: 1 });  // for expiry cron

const UserSubscription = mongoose.model('UserSubscription', UserSubscriptionSchema);

module.exports = { SubscriptionPlan, UserSubscription };
