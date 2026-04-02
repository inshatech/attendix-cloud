#!/usr/bin/env node
'use strict';
/**
 * scripts/seed-plans.js
 * ──────────────────────
 * Creates the default subscription plans in MongoDB.
 * Run once after first deployment:
 *
 *   node scripts/seed-plans.js
 *
 * Safe to run multiple times — uses upsert on planId.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { SubscriptionPlan } = require('../models/Subscription');

const PLANS = [
  {
    planId:       'plan-trial',
    name:         'Free Trial',
    description:  '14-day free trial. Full access to Starter features.',
    isActive:     true,
    isTrial:      true,
    priceMonthly: 0,
    priceYearly:  0,
    currency:     'INR',
    maxBridges:   1,
    maxDevices:   2,
    maxEmployees: 25,
    retentionDays:30,
    trialDays:    14,
    features: {
      realtimePunch:   true,
      bulkSms:         false,
      whatsappOtp:     false,
      advancedReports: false,
      apiAccess:       false,
    },
    sortOrder: 0,
  },
  {
    planId:       'plan-starter',
    name:         'Starter',
    description:  'Perfect for small businesses. 1 location, up to 3 machines.',
    isActive:     true,
    isTrial:      false,
    priceMonthly: 999,
    priceYearly:  9999,
    currency:     'INR',
    maxBridges:   1,
    maxDevices:   3,
    maxEmployees: 100,
    retentionDays:90,
    trialDays:    14,
    features: {
      realtimePunch:   true,
      bulkSms:         false,
      whatsappOtp:     true,
      advancedReports: false,
      apiAccess:       false,
    },
    sortOrder: 1,
  },
  {
    planId:       'plan-professional',
    name:         'Professional',
    description:  'For growing companies. 3 locations, up to 10 machines.',
    isActive:     true,
    isTrial:      false,
    priceMonthly: 2499,
    priceYearly:  24999,
    currency:     'INR',
    maxBridges:   3,
    maxDevices:   10,
    maxEmployees: 500,
    retentionDays:365,
    trialDays:    14,
    features: {
      realtimePunch:   true,
      bulkSms:         true,
      whatsappOtp:     true,
      advancedReports: true,
      apiAccess:       false,
    },
    sortOrder: 2,
  },
  {
    planId:       'plan-enterprise',
    name:         'Enterprise',
    description:  'Unlimited locations and machines. Full feature access.',
    isActive:     true,
    isTrial:      false,
    priceMonthly: 4999,
    priceYearly:  49999,
    currency:     'INR',
    maxBridges:   99,
    maxDevices:   999,
    maxEmployees: 99999,
    retentionDays:0,      // unlimited
    trialDays:    14,
    features: {
      realtimePunch:   true,
      bulkSms:         true,
      whatsappOtp:     true,
      advancedReports: true,
      apiAccess:       true,
    },
    sortOrder: 3,
  },
];

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/attendance';
  console.log('[seed-plans] Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('[seed-plans] Connected\n');

  let created = 0, updated = 0;
  for (const plan of PLANS) {
    const existing = await SubscriptionPlan.findOne({ planId: plan.planId });
    if (existing) {
      await SubscriptionPlan.updateOne({ planId: plan.planId }, { $set: plan });
      console.log(`  ↻  Updated: ${plan.name} (${plan.planId})`);
      updated++;
    } else {
      await SubscriptionPlan.create(plan);
      console.log(`  ✅  Created: ${plan.name} (${plan.planId})`);
      created++;
    }
  }

  console.log(`\n[seed-plans] Done — ${created} created, ${updated} updated`);
  console.log('\nPlans available:');
  const all = await SubscriptionPlan.find().sort({ sortOrder: 1 }).lean();
  for (const p of all) {
    console.log(`  ${p.isTrial ? '🆓' : '💳'}  ${p.name.padEnd(16)} | ₹${p.priceMonthly}/mo | ${p.maxBridges} org | ${p.maxDevices} devices | ${p.maxEmployees} employees`);
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error('[seed-plans] Error:', e.message); process.exit(1); });
