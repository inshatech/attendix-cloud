'use strict';
/**
 * webhooks.js  — POST /webhooks/:gateway
 * Receives payment confirmations from Razorpay, PhonePe, Paytm, CCAvenue.
 * Verifies signature → activates subscription → resumes suspended orgs.
 *
 * Mount in app.js BEFORE express.json() middleware (raw body needed for Razorpay).
 *   app.use('/webhooks', require('./routes/webhooks'));
 */

const express   = require('express');
const router    = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  razorpayVerifyWebhook, phonePeVerifyWebhook,
  paytmVerifyWebhook,    ccavenueDecrypt,
} = require('../services/paymentService');
const { addMonthEndIST, addYearEndIST } = require('../services/subscriptionService');

// Keep raw body for Razorpay signature verification
router.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = JSON.parse(data); } catch { req.body = Object.fromEntries(new URLSearchParams(data)); }
    next();
  });
});

// ── Activate subscription helper ─────────────────────────────────────────────
const mongoose = require('mongoose');
const PendingPayment = mongoose.models.PendingPayment || mongoose.model('PendingPayment', new mongoose.Schema({
  orderId:     { type: String, unique: true, index: true },
  processing:  { type: Boolean, default: false },
  processingAt:{ type: Date, default: null },
  userId: String, planId: String, billingCycle: String,
  amount: Number, gateway: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 },
}));

async function activateSubscription({ orderId, paidAmount, gatewayRef, gateway, userId: hintUserId, planId: hintPlanId, billingCycle: hintCycle }) {
  const { UserSubscription, SubscriptionPlan } = require('../models/Subscription');
  const Organization = require('../models/Organization');
  const { resumeOrg } = require('../services/subscriptionService');

  // ── IDEMPOTENCY: Prevent duplicate activations ────────────────────────────
  // Check if this exact payment (by transactionId/gatewayRef OR orderId) was already activated
  const txnRef = gatewayRef || orderId;
  // ── ATOMIC IDEMPOTENCY LOCK ─────────────────────────────────────────────────
  // Claim exclusive processing rights for this orderId using atomic findOneAndUpdate.
  // If two concurrent calls arrive (PhonePe webhook + redirect), only ONE will get
  // processing=true. The other finds processing already set and returns immediately.
  const lockKey  = `lock:${orderId}`;
  const lockClaim = await PendingPayment.findOneAndUpdate(
    { orderId, processing: { $ne: true } },
    { $set: { processing: true, processingAt: new Date() } },
    { new: false }   // return old doc — if null, someone else already claimed it
  ).catch(() => null);

  if (!lockClaim) {
    // Either already processing OR already deleted (completed). Check for existing sub.
    const existing = txnRef ? await UserSubscription.findOne({
      $or: [{ transactionId: txnRef }, { paymentRef: txnRef }],
    }).lean() : null;
    console.log(`[webhook] orderId=${orderId} already claimed — existing=${existing?.subscriptionId||'none'}`);
    return existing
      ? { userId: existing.userId, planId: existing.planId, endDate: existing.endDate, duplicate: true }
      : { duplicate: true };
  }

  // Also check by transactionId across all statuses (handles edge cases)
  const alreadyProcessed = txnRef ? await UserSubscription.findOne({
    $or: [{ transactionId: txnRef }, { paymentRef: txnRef }],
  }).lean() : null;
  if (alreadyProcessed) {
    await PendingPayment.updateOne({ orderId }, { $unset: { processing: 1 } }).catch(() => {});
    console.log(`[webhook] txnRef=${txnRef} already has sub=${alreadyProcessed.subscriptionId} — blocking`);
    return { userId: alreadyProcessed.userId, planId: alreadyProcessed.planId, endDate: alreadyProcessed.endDate, duplicate: true };
  }

  // Look up planId/userId from pending payment record
  const pending = await PendingPayment.findOne({ orderId }).lean();
  const resolvedUserId   = pending?.userId      || hintUserId;
  const planId           = pending?.planId       || hintPlanId;
  const billingCycle     = pending?.billingCycle || hintCycle || 'monthly';

  if (!resolvedUserId) throw new Error(`Cannot find userId for orderId=${orderId}`);
  if (!planId)         throw new Error(`Cannot find planId for orderId=${orderId}`);

  const plan = await SubscriptionPlan.findOne({ planId }).lean();
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const resolvedUserId2 = resolvedUserId;

  const now     = new Date();
  const endDate = billingCycle === 'yearly' ? addYearEndIST() : addMonthEndIST();

  // Create new subscription FIRST — only cancel old one after success
  // This prevents the loophole where cancel fires but new sub creation fails
  const newSub = await UserSubscription.create({
    subscriptionId: `sub-${uuidv4().split('-')[0]}`,
    userId:         resolvedUserId,
    planId,
    billingCycle,
    startDate:      now,
    endDate,
    status:         'active',
    autoRenew:      false,
    paymentRef:     gatewayRef || orderId,
    paidAmount:     paidAmount || 0,
    gateway,
    transactionId:  gatewayRef || orderId,
    assignedBy:     'payment_gateway',
    notes:          `Auto-activated via ${gateway}`,
    createdBy:      resolvedUserId,
  });

  // NOW cancel old subscriptions — only after new one is safely created
  await UserSubscription.updateMany(
    { userId: resolvedUserId2, status: { $in: ['trial', 'active'] }, subscriptionId: { $ne: newSub.subscriptionId } },
    { $set: { status: 'cancelled', cancelledAt: now } }
  );

  // Emit real-time payment event for admin sidebar
  try { const { emitPaymentEvent } = require('./subscriptions'); emitPaymentEvent({ type:'payment_received', userId:resolvedUserId, planId, gateway, amount:paidAmount, transactionId:gatewayRef||orderId }); } catch {}

  // Resume suspended orgs
  const orgs = await Organization.find({ ownerId: resolvedUserId2, isActive: false }).lean();
  for (const org of orgs) {
    try { await resumeOrg(org.orgId); } catch {}
  }

  // Record coupon usage if a coupon was applied
  if (pending?.couponCode) {
    try {
      const { Coupon, CouponUsage } = require('../models/Coupon');
      const couponDoc = await Coupon.findOne({ code: pending.couponCode }).lean();
      if (couponDoc) {
        await CouponUsage.create({ couponId: String(couponDoc._id), code: pending.couponCode, userId: resolvedUserId2, discount: pending.discountAmount || 0, subscriptionId: `sub-recorded` });
        await Coupon.findByIdAndUpdate(couponDoc._id, { $inc: { usedCount: 1 } });
      }
    } catch {}
  }
  // Clean up pending payment record
  await PendingPayment.deleteOne({ orderId }).catch(() => {});
  console.log(`[webhook] Subscription activated: userId=${resolvedUserId2} plan=${planId} via ${gateway}`);
  return { userId: resolvedUserId2, planId, endDate };
}

// ── Razorpay webhook ─────────────────────────────────────────────────────────
router.post('/razorpay', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name: 'razorpay', enabled: true }).lean();
    if (!p) return res.status(400).json({ error: 'Razorpay not configured' });

    const sig = req.headers['x-razorpay-signature'];
    if (!razorpayVerifyWebhook({ cfg: p.config, rawBody: req.rawBody, signature: sig })) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    if (event.event !== 'payment.captured') return res.json({ status: 'ignored' });

    const payment  = event.payload?.payment?.entity;
    const notes    = payment?.notes || {};
    const orderId  = payment?.order_id;

    await activateSubscription({
      orderId,
      userId: notes.userId, planId: notes.planId, billingCycle: notes.billingCycle || 'monthly',
      paidAmount: (payment.amount || 0) / 100,
      gatewayRef: payment.id, gateway: 'razorpay',
    });

    res.json({ status: 'success' });
  } catch (e) {
    console.error('[webhook/razorpay]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PhonePe webhook ──────────────────────────────────────────────────────────
router.post('/phonepe', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name: 'phonepe', enabled: true }).lean();
    if (!p) return res.status(400).json({ error: 'PhonePe not configured' });

    const { response, checksum } = req.body;
    const verified = phonePeVerifyWebhook({ cfg: p.config, response, checksum });
    if (!verified.valid || !verified.success) return res.json({ status: 'ignored' });

    const data       = verified.data?.data || {};
    const orderId = data.merchantTransactionId;
    const amount  = (data.amount || 0) / 100;

    await activateSubscription({
      orderId, paidAmount: amount, gatewayRef: data.transactionId, gateway: 'phonepe',
    });

    res.json({ code: 'PAYMENT_SUCCESS', success: true });
  } catch (e) {
    console.error('[webhook/phonepe]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Paytm webhook ────────────────────────────────────────────────────────────
router.post('/paytm', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name: 'paytm', enabled: true }).lean();
    if (!p) return res.status(400).json({ error: 'Paytm not configured' });

    const verified = paytmVerifyWebhook({ cfg: p.config, body: req.body });
    if (!verified.valid || !verified.success) return res.json({ status: 'ignored' });

    const data    = verified.data;
    const orderId = data.ORDERID;
    const amount  = parseFloat(data.TXNAMOUNT || 0);

    await activateSubscription({
      orderId, paidAmount: amount, gatewayRef: data.TXNID, gateway: 'paytm',
    });

    res.json({ status: 'success' });
  } catch (e) {
    console.error('[webhook/paytm]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CCAvenue response handler ─────────────────────────────────────────────────
router.post('/ccavenue', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name: 'ccavenue', enabled: true }).lean();
    if (!p) return res.status(400).json({ error: 'CCAvenue not configured' });

    const { encResp } = req.body;
    const result = ccavenueDecrypt({ cfg: p.config, encResp });
    if (!result.valid || !result.success) return res.json({ status: 'ignored', orderStatus: result.data?.order_status });

    const data    = result.data;
    const orderId = data.order_id;
    const amount  = parseFloat(data.amount || 0);

    await activateSubscription({
      orderId, paidAmount: amount, gatewayRef: data.tracking_id, gateway: 'ccavenue',
    });

    // CCAvenue expects redirect, not JSON
    res.redirect(`/subscription?payment=success`);
  } catch (e) {
    console.error('[webhook/ccavenue]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PhonePe status check (redirect handler) ──────────────────────────────────
// PhonePe redirects user to redirectUrl after payment.
// We must call /pg/v1/status to confirm and then activate subscription.
// Frontend calls: POST /webhooks/phonepe-redirect { merchantTransactionId }
router.post('/phonepe-redirect', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const { phonePeCheckStatus } = require('../services/paymentService');

    const p = await Plugin.findOne({ name: 'phonepe', enabled: true }).lean();
    if (!p) return res.status(400).json({ error: 'PhonePe not configured' });

    const { merchantTransactionId } = req.body;
    if (!merchantTransactionId) return res.status(400).json({ error: 'merchantTransactionId required' });

    // Check payment status from PhonePe API
    const status = await phonePeCheckStatus({ cfg: p.config, merchantTransactionId });

    if (!status.success) {
      return res.status(402).json({ error: `Payment not successful. Status: ${status.code}` });
    }

    const amount = (status.data?.amount || 0) / 100;
    const result = await activateSubscription({
      orderId:    merchantTransactionId,
      paidAmount: amount,
      gatewayRef: status.data?.transactionId || merchantTransactionId,
      gateway:    'phonepe',
    });

    if (result.duplicate) {
      return res.json({ status: 'success', message: 'Subscription already active', duplicate: true });
    }
    res.json({ status: 'success', message: 'Subscription activated' });
  } catch (e) {
    console.error('[webhook/phonepe-redirect]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
