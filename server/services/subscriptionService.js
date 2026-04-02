'use strict';
/**
 * services/subscriptionService.js
 * ─────────────────────────────────
 * Business logic for subscriptions. Called by routes and the expiry cron.
 *
 * Key responsibilities:
 *   - getActiveSubscription(userId)        → current sub + plan, null if none
 *   - checkLimit(userId, limitKey)         → throws if user is over their plan limit
 *   - enforceSubscription(userId)          → throws if subscription is expired/none
 *   - expireOverdueSubscriptions()         → called by cron job — disconnects bridges
 *   - suspendOrg(orgId, reason)            → disables org + sends DEVICE_DISABLE to bridge
 *   - resumeOrg(orgId)                     → re-enables org + sends DEVICE_ENABLE
 */

const mongoose   = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const { SubscriptionPlan, UserSubscription } = require('../models/Subscription');
const Organization = require('../models/Organization');

// These are populated lazily to avoid circular require with app.js
let _Bridge, _Device, _bridgeMap, _socketSend;

function init({ Bridge, Device, bridgeMap, socketSend }) {
  _Bridge    = Bridge;
  _Device    = Device;
  _bridgeMap = bridgeMap;
  _socketSend = socketSend;
}

// ── GET ACTIVE SUBSCRIPTION ───────────────────────────────────────────────────
async function getActiveSubscription(userId) {
  const sub = await UserSubscription.findOne({
    userId,
    status: { $in: ['trial', 'active'] },
    endDate: { $gt: new Date() },
  }).lean();
  if (!sub) return null;

  const plan = await SubscriptionPlan.findOne({ planId: sub.planId }).lean();
  return { sub, plan };
}

// ── ENFORCE SUBSCRIPTION ──────────────────────────────────────────────────────
async function enforceSubscription(userId) {
  const result = await getActiveSubscription(userId);
  if (!result) {
    throw Object.assign(new Error('No active subscription. Please subscribe to continue.'), { code: 'NO_SUBSCRIPTION', status: 402 });
  }
  return result;
}

// ── CHECK LIMITS ──────────────────────────────────────────────────────────────
/**
 * limitKey: 'bridges' | 'devices' | 'employees'
 * Throws a 403 with clear message if the user has reached their plan limit.
 */
async function checkLimit(userId, limitKey) {
  const result = await getActiveSubscription(userId);
  if (!result) throw Object.assign(new Error('No active subscription'), { code: 'NO_SUBSCRIPTION', status: 402 });

  const { plan } = result;

  switch (limitKey) {
    case 'bridges': {
      const count = await Organization.countDocuments({ ownerId: userId, isActive: true });
      if (count >= (plan.maxBridges || 1)) {
        throw Object.assign(
          new Error(`Your ${plan.name} plan allows ${plan.maxBridges} organization(s). Upgrade to add more.`),
          { code: 'LIMIT_BRIDGES', status: 403 }
        );
      }
      break;
    }
    case 'devices': {
      // Count all devices across all bridges owned by this user
      const orgs = await Organization.find({ ownerId: userId, isActive: true, bridgeId: { $ne: null } }).lean();
      const bridgeIds = orgs.map(o => o.bridgeId);
      const count = _Device ? await _Device.countDocuments({ bridgeId: { $in: bridgeIds } }) : 0;
      if (count >= (plan.maxDevices || 3)) {
        throw Object.assign(
          new Error(`Your ${plan.name} plan allows ${plan.maxDevices} device(s). Upgrade to add more.`),
          { code: 'LIMIT_DEVICES', status: 403 }
        );
      }
      break;
    }
    case 'employees': {
      const orgs = await Organization.find({ ownerId: userId, isActive: true, bridgeId: { $ne: null } }).lean();
      const bridgeIds = orgs.map(o => o.bridgeId);
      const MachineUser = mongoose.model('MachineUser');
      const count = await MachineUser.countDocuments({ bridgeId: { $in: bridgeIds } });
      if (count >= (plan.maxEmployees || 50)) {
        throw Object.assign(
          new Error(`Your ${plan.name} plan allows ${plan.maxEmployees} employees. Upgrade to add more.`),
          { code: 'LIMIT_EMPLOYEES', status: 403 }
        );
      }
      break;
    }
  }
}

// ── SUSPEND ORG ───────────────────────────────────────────────────────────────
async function suspendOrg(orgId, reason = 'Subscription expired') {
  const org = await Organization.findOne({ orgId });
  if (!org || !org.isActive) return;

  // Mark org suspended
  await Organization.updateOne({ orgId }, {
    $set: { isActive: false, suspendedAt: new Date(), suspendReason: reason }
  });

  // Disable all devices on the bridge via WebSocket
  if (org.bridgeId && _bridgeMap && _socketSend) {
    const bridge = _bridgeMap.get(org.bridgeId);
    if (bridge?.socket) {
      const devices = _Device ? await _Device.find({ bridgeId: org.bridgeId }).lean() : [];
      for (const d of devices) {
        _socketSend(bridge.socket, { type: 'DEVICE_DISABLE', deviceId: d.deviceId, reason });
        // Update in-memory enabled cache
        if (bridge.deviceEnabled instanceof Map) bridge.deviceEnabled.set(d.deviceId, false);
      }
      // Also update DB
      if (_Device) {
        await _Device.updateMany({ bridgeId: org.bridgeId }, {
          $set: { enabled: false, disabledAt: new Date(), disabledReason: reason }
        });
      }
      console.log(`[sub] Suspended org ${orgId} — bridge ${org.bridgeId} — ${devices.length} device(s) disabled`);
    }
  }
}

// ── RESUME ORG ────────────────────────────────────────────────────────────────
async function resumeOrg(orgId) {
  const org = await Organization.findOne({ orgId });
  if (!org) return;

  await Organization.updateOne({ orgId }, {
    $set: { isActive: true, suspendedAt: null, suspendReason: null }
  });

  if (org.bridgeId && _bridgeMap && _socketSend && _Device) {
    // Re-enable all devices
    await _Device.updateMany({ bridgeId: org.bridgeId }, {
      $set: { enabled: true, disabledAt: null, disabledReason: null }
    });
    const bridge  = _bridgeMap.get(org.bridgeId);
    const devices = await _Device.find({ bridgeId: org.bridgeId }).lean();
    if (bridge?.socket) {
      for (const d of devices) {
        _socketSend(bridge.socket, {
          type: 'DEVICE_ENABLE', deviceId: d.deviceId,
          device: { deviceId: d.deviceId, ip: d.ip, port: d.port, name: d.name, enabled: true },
        });
        if (bridge.deviceEnabled instanceof Map) bridge.deviceEnabled.set(d.deviceId, true);
      }
      console.log(`[sub] Resumed org ${orgId} — ${devices.length} device(s) re-enabled`);
    }
  }
}

// ── EXPIRE OVERDUE SUBSCRIPTIONS (runs as cron) ───────────────────────────────
async function expireOverdueSubscriptions() {
  const now     = new Date();
  const expired = await UserSubscription.find({
    status: { $in: ['trial', 'active'] },
    endDate: { $lte: now },
  }).lean();

  if (!expired.length) return 0;

  for (const sub of expired) {
    try {
      // Mark subscription expired
      await UserSubscription.updateOne({ subscriptionId: sub.subscriptionId }, {
        $set: { status: 'expired', expiredAt: now }
      });

      // Suspend all organisations of this user
      const orgs = await Organization.find({ ownerId: sub.userId, isActive: true }).lean();
      for (const org of orgs) {
        await suspendOrg(org.orgId, 'Subscription expired');
      }
      console.log(`[sub] Expired subscription ${sub.subscriptionId} for user ${sub.userId}`);
    } catch (e) {
      console.error(`[sub] Error expiring ${sub.subscriptionId}:`, e.message);
    }
  }
  return expired.length;
}

// ── APPLY TRIAL ───────────────────────────────────────────────────────────────
async function applyTrial(userId, createdBy = 'system') {
  // Check if user already has any subscription
  const existing = await UserSubscription.findOne({ userId });
  if (existing) return null;  // already has one

  const trialPlan = await SubscriptionPlan.findOne({ isTrial: true, isActive: true }).lean();
  if (!trialPlan) return null;

  const now      = new Date();
  const endDate  = new Date(now);
  endDate.setDate(endDate.getDate() + (trialPlan.trialDays || 14));

  const sub = await UserSubscription.create({
    subscriptionId: `sub-${uuidv4().split('-')[0]}`,
    userId,
    planId:         trialPlan.planId,
    billingCycle:   'trial',
    startDate:      now,
    endDate,
    trialEndsAt:    endDate,
    status:         'trial',
    autoRenew:      false,
    createdBy,
  });
  console.log(`[sub] Applied trial plan '${trialPlan.name}' to user ${userId} — expires ${endDate.toDateString()}`);
  return sub;
}

module.exports = {
  init,
  getActiveSubscription,
  enforceSubscription,
  checkLimit,
  suspendOrg,
  resumeOrg,
  expireOverdueSubscriptions,
  applyTrial,
};
