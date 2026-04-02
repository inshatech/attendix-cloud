'use strict';
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Coupon, CouponUsage } = require('../models/Coupon');
const { requireAuth, requireRole } = require('../auth/middleware');
const { adminApiLimiter, generalApiLimiter } = require('../auth/rateLimits');

// ── ADMIN ─────────────────────────────────────────────────────────────────────

router.get('/admin/coupons', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
    res.json({ status: 'success', data: coupons });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/coupons', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue, maxDiscount,
      minAmount, maxUses, maxUsesPerUser, validFrom, validTo,
      applicablePlans, applicableCycles, isActive,
    } = req.body;
    if (!code?.trim())                        return res.status(400).json({ error: 'Code required' });
    if (!discountType)                        return res.status(400).json({ error: 'Discount type required' });
    if (!discountValue || Number(discountValue) <= 0) return res.status(400).json({ error: 'Discount value must be > 0' });

    const coupon = await Coupon.create({
      couponId:        `cpn-${uuidv4().split('-')[0]}`,
      code:            code.trim().toUpperCase(),
      description:     description || '',
      discountType,
      discountValue:   Number(discountValue),
      maxDiscount:     maxDiscount ? Number(maxDiscount) : null,
      minAmount:       minAmount   ? Number(minAmount)   : 0,
      maxUses:         (maxUses != null && maxUses !== '') ? Number(maxUses) : null,
      maxUsesPerUser:  maxUsesPerUser ? Number(maxUsesPerUser) : 1,
      validFrom:       validFrom  || new Date(),
      validTo:         validTo    || null,
      applicablePlans: applicablePlans  || [],
      applicableCycles:applicableCycles || ['both'],
      isActive:        isActive !== false,
      createdBy:       req.authUser.userId,
    });
    res.status(201).json({ status: 'success', data: coupon });
  } catch(e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Coupon code already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/coupons/:couponId', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const allowed = [
      'code','description','discountType','discountValue','maxDiscount',
      'minAmount','maxUses','maxUsesPerUser','validFrom','validTo',
      'applicablePlans','applicableCycles','isActive',
    ];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (update.code)          update.code          = update.code.toUpperCase().trim();
    if (update.discountValue) update.discountValue  = Number(update.discountValue);
    if ('maxDiscount'   in update) update.maxDiscount   = update.maxDiscount   ? Number(update.maxDiscount)   : null;
    if ('minAmount'     in update) update.minAmount      = Number(update.minAmount) || 0;
    if ('maxUses'       in update) update.maxUses        = (update.maxUses != null && update.maxUses !== '') ? Number(update.maxUses) : null;
    if ('maxUsesPerUser'in update) update.maxUsesPerUser = Number(update.maxUsesPerUser) || 1;

    const coupon = await Coupon.findOneAndUpdate(
      { couponId: req.params.couponId },
      { $set: update },
      { new: true }
    );
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ status: 'success', data: coupon });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/coupons/:couponId', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    await Coupon.deleteOne({ couponId: req.params.couponId });
    res.json({ status: 'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/coupons/:couponId/usage', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ couponId: req.params.couponId }).lean();
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    const usages = await CouponUsage.find({ couponId: req.params.couponId }).sort({ usedAt: -1 }).lean();
    res.json({ status: 'success', data: { usages, usedCount: coupon.usedCount } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── USER: validate coupon ─────────────────────────────────────────────────────

router.post('/subscriptions/validate-coupon', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const { code, planId, billingCycle, amount } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true }).lean();
    if (!coupon) return res.status(404).json({ error: 'Invalid coupon code' });

    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) return res.status(400).json({ error: 'Coupon not yet valid' });
    if (coupon.validTo   && now > new Date(coupon.validTo))   return res.status(400).json({ error: 'Coupon has expired' });
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Coupon usage limit reached' });

    // Per-user limit
    if (coupon.maxUsesPerUser > 0) {
      const userUses = await CouponUsage.countDocuments({ couponId: coupon.couponId, userId: req.authUser.userId });
      if (userUses >= coupon.maxUsesPerUser) return res.status(400).json({ error: 'You have already used this coupon' });
    }

    if (coupon.applicablePlans?.length && planId && !coupon.applicablePlans.includes(planId))
      return res.status(400).json({ error: 'Coupon not valid for this plan' });
    if (coupon.applicableCycles?.[0] !== 'both' && billingCycle && !coupon.applicableCycles.includes(billingCycle))
      return res.status(400).json({ error: `Coupon only valid for ${coupon.applicableCycles[0]} billing` });
    if (coupon.minAmount > 0 && amount && amount < coupon.minAmount)
      return res.status(400).json({ error: `Minimum order amount is ₹${coupon.minAmount}` });

    // trial_ext — no monetary discount
    if (coupon.discountType === 'trial_ext') {
      return res.json({ status: 'success', data: {
        couponId: coupon.couponId, code: coupon.code,
        discountType: 'trial_ext', trialDays: coupon.discountValue,
        discount: 0, finalAmount: amount || 0,
        message: `+${coupon.discountValue} free days`,
        description: coupon.description,
      }});
    }

    // Calculate discount
    let discount = coupon.discountType === 'percentage'
      ? (amount || 0) * coupon.discountValue / 100
      : Math.min(coupon.discountValue, amount || 0);
    if (coupon.discountType === 'percentage' && coupon.maxDiscount)
      discount = Math.min(discount, coupon.maxDiscount);
    discount = Math.round(discount * 100) / 100;

    res.json({ status: 'success', data: {
      couponId:    coupon.couponId,
      code:        coupon.code,
      discountType:  coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
      finalAmount: Math.max(0, (amount || 0) - discount),
      message:     `₹${discount.toLocaleString('en-IN')} off`,
      description: coupon.description,
    }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
