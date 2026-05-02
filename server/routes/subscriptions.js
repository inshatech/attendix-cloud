'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { SubscriptionPlan, UserSubscription } = require('../models/Subscription');
const Organization = require('../models/Organization');
const {
  getActiveSubscription,
  enforceSubscription,
  applyTrial,
  suspendOrg,
  resumeOrg,
  endOfDayIST,
  addDaysEndIST,
  addMonthEndIST,
  addYearEndIST,
} = require('../services/subscriptionService');

const { requireAuth, requireRole } = require('../auth/middleware');
const { generalApiLimiter, adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');
const { sendSubscriptionEmail } = require('../notify/authNotify');

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — Plan Management
//  All routes: requireAuth + requireRole('admin')
// ══════════════════════════════════════════════════════════════════════════════

// GET  /admin/plans              — list all plans
router.get('/admin/plans', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1, priceMonthly: 1 }).lean();
    res.json({ status: 'success', data: plans });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /admin/plans              — create plan
router.post('/admin/plans', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const {
      name, description, isActive = true, isTrial = false,
      priceMonthly = 0, priceYearly = 0, currency = 'INR',
      maxBridges = 1, maxDevices = 3, maxEmployees = 50, retentionDays = 90,
      trialDays = 14, features = {}, sortOrder = 0,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const plan = await SubscriptionPlan.create({
      planId: `plan-${uuidv4().split('-')[0]}`,
      name, description, isActive, isTrial,
      priceMonthly, priceYearly, currency,
      maxBridges, maxDevices, maxEmployees, retentionDays,
      trialDays, features, sortOrder,
      createdBy: req.authUser.userId,
    });
    res.status(201).json({ status: 'success', data: plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /admin/plans/:planId     — update plan
router.patch('/admin/plans/:planId', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const allowed = ['name','description','isActive','isTrial','priceMonthly','priceYearly',
      'currency','maxBridges','maxDevices','maxEmployees','retentionDays','trialDays','features','sortOrder'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
    const plan = await SubscriptionPlan.findOneAndUpdate({ planId: req.params.planId }, { $set: update }, { new: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ status: 'success', data: plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /admin/plans/:planId
router.delete('/admin/plans/:planId', requireAuth, requireRole('admin'), strictAdminLimiter, async (req, res) => {
  try {
    const inUse = await UserSubscription.exists({ planId: req.params.planId, status: { $in: ['trial','active'] } });
    if (inUse) return res.status(409).json({ error: 'Plan is in use by active subscriptions — deactivate instead' });
    await SubscriptionPlan.deleteOne({ planId: req.params.planId });
    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN — User Subscription Management ─────────────────────────────────────

// GET  /admin/subscriptions             — list all subscriptions
router.get('/admin/subscriptions', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const { status, userId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    const [subs, total] = await Promise.all([
      UserSubscription.find(filter).sort({ createdAt: -1 }).skip((+page-1)*+limit).limit(+limit).lean(),
      UserSubscription.countDocuments(filter),
    ]);
    // Enrich with plan names
    const planIds = [...new Set(subs.map(s => s.planId))];
    const plans   = await SubscriptionPlan.find({ planId: { $in: planIds } }).lean();
    const planMap = Object.fromEntries(plans.map(p => [p.planId, p.name]));
    res.json({ status: 'success', total, page: +page, data: subs.map(s => ({ ...s, planName: planMap[s.planId] || s.planId })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /admin/subscriptions             — manually assign subscription to user
router.post('/admin/subscriptions', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const { userId, planId, billingCycle = 'monthly', notes, paymentRef, paidAmount = 0 } = req.body;
    if (!userId || !planId) return res.status(400).json({ error: 'userId and planId required' });

    const plan = await SubscriptionPlan.findOne({ planId }).lean();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const now = new Date();
    let endDate;
    if (billingCycle === 'trial')        endDate = addDaysEndIST(plan.trialDays || 14);
    else if (billingCycle === 'yearly')  endDate = addYearEndIST();
    else                                 endDate = addMonthEndIST();

    // Expire existing active subscription
    await UserSubscription.updateMany(
      { userId, status: { $in: ['trial', 'active'] } },
      { $set: { status: 'cancelled', cancelledAt: now } }
    );

    const sub = await UserSubscription.create({
      subscriptionId: `sub-${uuidv4().split('-')[0]}`,
      userId, planId,
      billingCycle:  billingCycle === 'trial' ? 'trial' : billingCycle,
      startDate:     now,
      endDate,
      trialEndsAt:   billingCycle === 'trial' ? endDate : null,
      status:        billingCycle === 'trial' ? 'trial' : 'active',
      autoRenew:     false,
      paymentRef:    paymentRef || null,
      paidAmount,
      notes:         notes || null,
      createdBy:     req.authUser.userId,
    });

    // If user had suspended orgs, resume them
    const orgs = await Organization.find({ ownerId: userId, isActive: false }).lean();
    for (const org of orgs) { await resumeOrg(org.orgId); }

    sendSubscriptionEmail(userId, { planName: plan.name, status: sub.status, endDate: sub.endDate, billingCycle: sub.billingCycle, notes });
    res.status(201).json({ status: 'success', data: sub });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /admin/subscriptions/:subId     — extend / change status
router.patch('/admin/subscriptions/:subId', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const { status, endDate, notes, autoRenew } = req.body;
    const update = {};
    if (status)   update.status  = status;
    if (endDate)  update.endDate = endOfDayIST(new Date(endDate));
    if (notes !== undefined) update.notes = notes;
    if (autoRenew !== undefined) update.autoRenew = autoRenew;

    const sub = await UserSubscription.findOneAndUpdate(
      { subscriptionId: req.params.subId },
      { $set: update },
      { new: true }
    );
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    // If reactivating, resume orgs
    if (status === 'active' || status === 'trial') {
      const orgs = await Organization.find({ ownerId: sub.userId, isActive: false }).lean();
      for (const org of orgs) await resumeOrg(org.orgId);
    }
    // If suspending or cancelling, suspend orgs
    if (status === 'suspended' || status === 'cancelled' || status === 'expired') {
      const orgs = await Organization.find({ ownerId: sub.userId, isActive: true }).lean();
      for (const org of orgs) await suspendOrg(org.orgId, `Subscription ${status}`);
    }

    // Notify user when status meaningfully changes
    if (status) {
      const plan = await SubscriptionPlan.findOne({ planId: sub.planId }).lean();
      sendSubscriptionEmail(sub.userId, { planName: plan?.name || sub.planId, status: sub.status, endDate: sub.endDate, billingCycle: sub.billingCycle, notes });
    }
    res.json({ status: 'success', data: sub });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /admin/subscriptions/apply-trial/:userId
router.post('/admin/subscriptions/apply-trial/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sub = await applyTrial(req.params.userId, req.authUser.userId);
    if (!sub) return res.status(409).json({ error: 'User already has a subscription (or no trial plan defined)' });
    res.status(201).json({ status: 'success', data: sub });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  USER — Self-service subscription
// ══════════════════════════════════════════════════════════════════════════════

// GET /subscriptions/plans       — public: list available plans
router.get('/subscriptions/plans', generalApiLimiter, async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1, priceMonthly: 1 })
      .select('-createdBy -updatedAt').lean();
    res.json({ status: 'success', data: plans });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /subscriptions/my          — my current subscription
router.get('/subscriptions/my', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const result = await getActiveSubscription(req.authUser.userId);
    if (!result) {
      return res.json({ status: 'success', data: null, message: 'No active subscription' });
    }
    const orgs = await Organization.find({ ownerId: req.authUser.userId }).lean();
    res.json({ status: 'success', data: { subscription: result.sub, plan: result.plan, organizations: orgs } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /subscriptions/start-trial  — user requests trial (if no existing sub)
router.post('/subscriptions/start-trial', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const existing = await UserSubscription.findOne({ userId: req.authUser.userId });
    if (existing) return res.status(409).json({ error: 'You already have a subscription history. Contact admin.' });

    const sub = await applyTrial(req.authUser.userId, req.authUser.userId);
    if (!sub) return res.status(400).json({ error: 'No trial plan available. Contact admin.' });

    res.status(201).json({ status: 'success', data: sub, message: 'Trial started!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /subscriptions/subscribe  — user subscribes to a paid plan
// In production: integrate payment gateway here before creating subscription
router.post('/subscriptions/subscribe', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const { planId, billingCycle = 'monthly', paymentRef } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });

    const plan = await SubscriptionPlan.findOne({ planId, isActive: true }).lean();
    if (!plan) return res.status(404).json({ error: 'Plan not found or inactive' });
    if (plan.isTrial) return res.status(400).json({ error: 'Use /subscriptions/start-trial for trial plans' });

    const now     = new Date();
    const endDate = billingCycle === 'yearly' ? addYearEndIST() : addMonthEndIST();

    // Cancel any existing active subscription
    await UserSubscription.updateMany(
      { userId: req.authUser.userId, status: { $in: ['trial', 'active'] } },
      { $set: { status: 'cancelled', cancelledAt: now } }
    );

    const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    const sub   = await UserSubscription.create({
      subscriptionId: `sub-${uuidv4().split('-')[0]}`,
      userId:       req.authUser.userId,
      planId,
      billingCycle,
      startDate:    now,
      endDate,
      status:       'active',
      autoRenew:    false,
      paymentRef:   paymentRef || null,
      paidAmount:   price,
      createdBy:    req.authUser.userId,
    });

    // Resume any suspended orgs
    const orgs = await Organization.find({ ownerId: req.authUser.userId, isActive: false }).lean();
    for (const org of orgs) await resumeOrg(org.orgId);

    res.status(201).json({
      status: 'success',
      data: sub,
      message: `Subscribed to ${plan.name} (${billingCycle}). Valid until ${endDate.toDateString()}.`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUBSCRIPTION EVENTS (payment/activity log) ────────────────────────────────
router.get('/admin/subscriptions/events', requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const events = await UserSubscription.find({})
      .sort({ updatedAt: -1 }).limit(+limit).skip(+skip)
      .populate ? UserSubscription.find({}).sort({ updatedAt: -1 }).limit(+limit).skip(+skip).lean()
      : UserSubscription.find({}).sort({ updatedAt: -1 }).limit(+limit).skip(+skip).lean();
    const data = await UserSubscription.find({}).sort({ updatedAt: -1 }).limit(+limit).skip(+skip).lean();
    res.json({ status: 'success', data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// SSE stream for real-time subscription events
router.get('/admin/subscriptions/events/stream', requireAuth, requireRole('admin','support'), (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  if (res.flushHeaders) res.flushHeaders();
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 20000);
  req.on('close', () => clearInterval(hb));
});


// ── SUBSCRIPTION CANCEL / EXTEND / REFUND ─────────────────────────────────────
router.post('/admin/subscriptions/:subId/cancel', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sub = await UserSubscription.findOneAndUpdate(
      { subscriptionId: req.params.subId },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: req.body.reason || 'Admin cancelled' } },
      { new: true }
    );
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ status: 'success', data: sub });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/subscriptions/:subId/extend', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const sub = await UserSubscription.findOne({ subscriptionId: req.params.subId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    const base = sub.endDate && new Date(sub.endDate) > new Date() ? new Date(sub.endDate) : new Date();
    sub.endDate = addDaysEndIST(Number(days), base);
    if (sub.trialEndsAt) sub.trialEndsAt = current;
    sub.status = 'active';
    await sub.save();
    res.json({ status: 'success', data: sub });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/subscriptions/:subId/refund', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sub = await UserSubscription.findOneAndUpdate(
      { subscriptionId: req.params.subId },
      { $set: { status: 'refunded', refundedAt: new Date(), refundNote: req.body.note || '' } },
      { new: true }
    );
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ status: 'success', data: sub });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/subscriptions/:subId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sub = await UserSubscription.findOneAndDelete({ subscriptionId: req.params.subId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ status: 'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADDITIONAL SUBSCRIPTION ENDPOINTS ────────────────────────────────────────
router.get('/subscriptions/history', requireAuth, async (req, res) => {
  try {
    const subs = await UserSubscription.find({ userId: req.authUser.userId })
      .sort({ createdAt: -1 }).lean();
    res.json({ status: 'success', data: subs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/subscriptions/payment-gateways', requireAuth, async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const gateways = await Plugin.find({
      name: { $in: ['phonepe', 'razorpay', 'paytm', 'stripe', 'cashfree'] },
      enabled: true
    }).select('name label config').lean();
    const data = gateways.map(g => ({
      id: g.name,
      label: g.label || g.name,
      color: g.config?.color || '#58a6ff',
    }));
    res.json({ status: 'success', data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/subscriptions/initiate-payment', requireAuth, async (req, res) => {
  try {
    const { planId, billingCycle = 'monthly', gateway: chosenGateway, couponCode } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });

    const { Plugin } = require('../models/Plugin');
    const mongoose   = require('mongoose');
    const crypto     = require('crypto');
    const axios      = require('axios');

    // ── Load plan ─────────────────────────────────────────────────────────────
    const plan = await SubscriptionPlan.findOne({ planId, isActive: true }).lean();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.isTrial) return res.status(400).json({ error: 'Use /subscriptions/start-trial for trial plans' });

    let amount = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;

    // ── Apply coupon ───────────────────────────────────────────────────────────
    let couponInfo = null;
    if (couponCode) {
      let Coupon;
      try { Coupon = mongoose.model('Coupon'); } catch {}
      if (Coupon) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).lean();
        const now = new Date();
        if (coupon && (!coupon.validTo || new Date(coupon.validTo) > now) &&
            (coupon.maxUses == null || coupon.usedCount < coupon.maxUses)) {
          if (coupon.discountType === 'trial_ext') {
            const trialDays = coupon.discountValue || 7;
            const endDate = addDaysEndIST(trialDays);
            await UserSubscription.updateMany({ userId: req.authUser.userId, status: { $in: ['trial','active'] } }, { $set: { status: 'cancelled', cancelledAt: now } });
            await UserSubscription.create({ subscriptionId: `sub-${uuidv4().split('-')[0]}`, userId: req.authUser.userId, planId, billingCycle, startDate: now, endDate, status: 'trial', autoRenew: false, paidAmount: 0, paymentRef: `coupon:${couponCode}`, createdBy: req.authUser.userId });
            return res.json({ status: 'success', data: { gateway: 'trial_ext', trialDays, message: `Trial extended by ${trialDays} days!` } });
          }
          let discount = coupon.discountType === 'percentage'
            ? (amount * coupon.discountValue) / 100
            : Math.min(coupon.discountValue, amount);
          if (coupon.discountType === 'percentage' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
          discount = Math.round(discount * 100) / 100;
          amount = amount - discount;
          couponInfo = { code: couponCode.toUpperCase(), message: `₹${discount} off`, discountAmount: discount };
        }
      }
    }

    // If coupon makes it free, subscribe directly
    if (amount <= 0) {
      const now = new Date();
      const endDate = billingCycle === 'yearly' ? addYearEndIST() : addMonthEndIST();
      await UserSubscription.updateMany({ userId: req.authUser.userId, status: { $in: ['trial','active'] } }, { $set: { status: 'cancelled', cancelledAt: now } });
      await UserSubscription.create({ subscriptionId: `sub-${uuidv4().split('-')[0]}`, userId: req.authUser.userId, planId, billingCycle, startDate: now, endDate, status: 'active', autoRenew: false, paidAmount: 0, paymentRef: `coupon:${couponCode}`, createdBy: req.authUser.userId });
      return res.json({ status: 'success', data: { gateway: 'trial_ext', trialDays: 0, message: `Subscribed to ${plan.name} for free!`, coupon: couponInfo } });
    }

    // ── Resolve gateway plugin ─────────────────────────────────────────────────
    const GW_NAMES = ['razorpay', 'phonepe', 'paytm', 'ccavenue', 'cashfree'];
    let gwPlugin;
    if (chosenGateway && GW_NAMES.includes(chosenGateway)) {
      gwPlugin = await Plugin.findOne({ name: chosenGateway, enabled: true }).lean();
      if (!gwPlugin) return res.status(400).json({ error: `${chosenGateway} is not enabled. Contact admin.` });
    } else {
      gwPlugin = await Plugin.findOne({ name: { $in: GW_NAMES }, enabled: true }).lean();
    }
    if (!gwPlugin) return res.status(400).json({ error: 'No payment gateway configured. Contact admin.' });

    const cfg     = gwPlugin.config || {};
    const amtPaise = Math.round(amount * 100);
    const txnId   = `txn-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const userId  = req.authUser.userId;
    // Use APP_URL env var; fall back to request Origin header (works behind Vite proxy);
    // last resort: req.host (only correct in production where backend serves frontend)
    const appUrl  = process.env.APP_URL
      || (req.headers.origin && !req.headers.origin.includes('localhost:' + (process.env.PORT || 8000)) ? req.headers.origin : null)
      || `${req.protocol}://${req.get('host')}`;
    const retUrl  = `${appUrl}/subscription?txn=${txnId}`;

    // helper: extract meaningful error from a failed axios gateway call
    function gwError(e, name) {
      const status = e.response?.status;
      const d = e.response?.data;
      // Extract body message — skip HTML responses
      let bodyMsg;
      if (d && typeof d === 'object') {
        bodyMsg = d.message || d.error || d.errorDescription || d.description || d.msg || d.errorMessage || d.Error;
      } else if (typeof d === 'string' && !d.trimStart().startsWith('<') && d.length < 400) {
        bodyMsg = d;
      }
      let msg = bodyMsg;
      if (!msg) {
        if (status === 404) msg = `${name} merchant not found — verify Merchant ID and Environment (UAT vs Production) in Admin → Plugins → ${name}`;
        else if (status === 401) msg = `${name} authentication failed — check your API keys in Admin → Plugins → ${name}`;
        else if (status === 403) msg = `${name} access denied — check your API credentials in Admin → Plugins → ${name}`;
        else if (status === 400) msg = `${name} rejected the request — check your credentials in Admin → Plugins → ${name}`;
        else msg = e.message || `${name} request failed`;
      }
      console.error(`[payment] ${name} error HTTP ${status}:`, msg, typeof d === 'object' ? JSON.stringify(d) : d);
      return String(msg);
    }

    // ── Razorpay ───────────────────────────────────────────────────────────────
    if (gwPlugin.name === 'razorpay') {
      const keyId = String(cfg.keyId || '').trim();
      const keySecret = String(cfg.keySecret || '').trim();
      if (!keyId || !keySecret) return res.status(503).json({ error: 'Razorpay keys not configured. Go to Admin → Plugins → Razorpay.' });
      try {
        const auth  = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const order = await axios.post('https://api.razorpay.com/v1/orders',
          { amount: amtPaise, currency: 'INR', receipt: txnId },
          { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            timeout: 15000 }
        ).then(r => r.data);
        return res.json({ status: 'success', data: {
          gateway: 'razorpay', keyId, orderId: order.id, amount: amtPaise, userId, coupon: couponInfo,
        }});
      } catch(e) { return res.status(502).json({ error: `Razorpay: ${gwError(e, 'Razorpay')}` }); }
    }

    // ── PhonePe ────────────────────────────────────────────────────────────────
    if (gwPlugin.name === 'phonepe') {
      const merchantId = String(cfg.merchantId || '').trim();
      const saltKey    = String(cfg.saltKey    || '').trim();
      if (!merchantId || !saltKey) return res.status(503).json({ error: 'PhonePe credentials not configured. Go to Admin → Plugins → PhonePe.' });
      try {
        const envLower = String(cfg.environment || cfg.env || 'prod').toLowerCase();
        const isUat   = ['uat', 'sandbox', 'test', 'staging', 'preprod'].includes(envLower);
        const baseUrl = isUat
          ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
          : 'https://api.phonepe.com/apis/hermes';
        const payload = Buffer.from(JSON.stringify({
          merchantId, merchantTransactionId: txnId,
          merchantUserId: `usr${userId.replace(/[^a-z0-9]/gi, '').slice(0, 32)}`,
          amount: amtPaise, redirectUrl: retUrl, redirectMode: 'GET', callbackUrl: retUrl,
          paymentInstrument: { type: 'PAY_PAGE' },
        })).toString('base64');
        const saltIndex = String(cfg.saltIndex || '1').trim();
        const checksum  = crypto.createHash('sha256').update(payload + '/pg/v1/pay' + saltKey).digest('hex') + '###' + saltIndex;
        const resp = await axios.post(`${baseUrl}/pg/v1/pay`,
          { request: payload },
          { headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'X-MERCHANT-ID': merchantId },
            timeout: 15000 }
        ).then(r => r.data);
        const paymentUrl = resp?.data?.instrumentResponse?.redirectInfo?.url;
        if (!paymentUrl) {
          const hint = isUat ? '' : ' If using sandbox credentials, set Environment to UAT in Admin → Plugins → PhonePe.';
          return res.status(502).json({ error: `PhonePe: ${resp?.message || 'No redirect URL returned.'}${hint}` });
        }
        return res.json({ status: 'success', data: { gateway: 'phonepe', paymentUrl, coupon: couponInfo } });
      } catch(e) { return res.status(502).json({ error: `PhonePe: ${gwError(e, 'PhonePe')}` }); }
    }

    // ── Paytm ──────────────────────────────────────────────────────────────────
    if (gwPlugin.name === 'paytm') {
      const merchantId  = String(cfg.merchantId  || '').trim();
      const merchantKey = String(cfg.merchantKey || '').trim();
      if (!merchantId || !merchantKey) return res.status(503).json({ error: 'Paytm credentials not configured. Go to Admin → Plugins → Paytm.' });
      const params = {
        MID: merchantId, ORDER_ID: txnId, TXN_AMOUNT: amount.toFixed(2),
        CUST_ID: userId, CHANNEL_ID: 'WEB',
        INDUSTRY_TYPE_ID: String(cfg.industryType || 'Retail').trim(),
        WEBSITE: String(cfg.website || cfg.websiteName || 'DEFAULT').trim(),
      };
      const sortedVals   = Object.keys(params).sort().map(k => params[k]).join('|');
      const checksumHash = crypto.createHmac('sha256', merchantKey).update(sortedVals).digest('hex');
      const paytmEnv = String(cfg.environment || cfg.env || 'staging').toLowerCase();
      const host = ['prod', 'production'].includes(paytmEnv) ? 'securegw.paytm.in' : 'securegw-staging.paytm.in';
      const paymentUrl   = `https://${host}/theia/processTransaction?` + new URLSearchParams({ ...params, CHECKSUMHASH: checksumHash });
      return res.json({ status: 'success', data: { gateway: 'paytm', paymentUrl, coupon: couponInfo } });
    }

    // ── CCAvenue ───────────────────────────────────────────────────────────────
    if (gwPlugin.name === 'ccavenue') {
      const merchantId = String(cfg.merchantId  || '').trim();
      const accessCode = String(cfg.accessCode  || '').trim();
      const workingKey = String(cfg.workingKey  || '').trim();
      if (!merchantId || !accessCode || !workingKey) return res.status(503).json({ error: 'CCAvenue credentials not configured. Go to Admin → Plugins → CCAvenue.' });
      const reqStr = new URLSearchParams({
        merchant_id: merchantId, order_id: txnId,
        amount: amount.toFixed(2), currency: 'INR',
        redirect_url: retUrl, cancel_url: retUrl, language: 'EN',
      }).toString();
      const aesKey     = crypto.createHash('md5').update(workingKey).digest();
      const iv         = Buffer.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
      const cipher     = crypto.createCipheriv('aes-128-cbc', aesKey, iv);
      const encRequest = cipher.update(reqStr, 'utf8', 'hex') + cipher.final('hex');
      const ccEnv  = String(cfg.environment || cfg.env || 'production').toLowerCase();
      const host   = ['test', 'sandbox', 'staging', 'uat'].includes(ccEnv) ? 'test.ccavenue.com' : 'secure.ccavenue.com';
      return res.json({ status: 'success', data: {
        gateway: 'ccavenue',
        actionUrl: `https://${host}/transaction/transaction.do?command=initiateTransaction`,
        encRequest, accessCode, coupon: couponInfo,
      }});
    }

    // ── Cashfree ───────────────────────────────────────────────────────────────
    if (gwPlugin.name === 'cashfree') {
      const appId     = String(cfg.appId     || '').trim();
      const secretKey = String(cfg.secretKey || '').trim();
      if (!appId || !secretKey) return res.status(503).json({ error: 'Cashfree credentials not configured. Go to Admin → Plugins → Cashfree.' });
      try {
        const envLower2 = String(cfg.environment || cfg.env || 'sandbox').toLowerCase();
        const baseUrl   = ['prod', 'production'].includes(envLower2) ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
        const orderData = await axios.post(`${baseUrl}/pg/orders`, {
          order_id: txnId, order_amount: amount, order_currency: 'INR',
          customer_details: { customer_id: `usr_${userId.slice(0,20)}`, customer_email: req.authUser.email || 'user@example.com', customer_phone: '9999999999' },
          order_meta: { return_url: retUrl },
        }, {
          headers: { 'x-api-version': '2023-08-01', 'x-client-id': appId, 'x-client-secret': secretKey },
          timeout: 15000,
        }).then(r => r.data);
        const paymentUrl = orderData.payment_link;
        if (!paymentUrl) return res.status(502).json({ error: 'Cashfree did not return a payment URL' });
        return res.json({ status: 'success', data: { gateway: 'cashfree', paymentUrl, coupon: couponInfo } });
      } catch(e) { return res.status(502).json({ error: `Cashfree: ${gwError(e, 'Cashfree')}` }); }
    }

    return res.status(400).json({ error: 'No payment gateway configured. Contact admin.' });
  } catch(e) {
    console.error('[initiate-payment] Unexpected error:', e);
    res.status(500).json({ error: e.message || 'Unexpected server error' });
  }
});

router.post('/webhooks/phonepe-redirect', async (req, res) => {
  res.json({ status: 'success' });
});

module.exports = router;
