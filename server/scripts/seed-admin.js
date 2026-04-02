#!/usr/bin/env node
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('../auth/helpers');
const AuthUser = require('../models/AuthUser');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/attendance';
  console.log('[seed] Connecting to:', uri.replace(/:\/\/[^@]+@/, '://***@'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('[seed] Connected');

  const name     = process.env.ADMIN_NAME     || 'System Admin';
  const email    = (process.env.ADMIN_EMAIL    || 'inshatech@gmail.com').toLowerCase();
  const mobile   = process.env.ADMIN_MOBILE   || 91888191926;
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const q = mobile ? { $or: [{ email }, { mobile }] } : { email };
  const existing = await AuthUser.findOne(q);
  if (existing) {
    console.log(`[seed] Admin already exists: ${existing.email || existing.mobile} (userId: ${existing.userId})`);
    await mongoose.disconnect(); return;
  }

  const u = await AuthUser.create({
    userId:       `admin-${uuidv4().split('-')[0]}`,
    name, email, mobile,
    passwordHash: await hashPassword(password),
    role:         'admin',
    isActive:     true,
    emailVerified: true,
    mobileVerified: !!mobile,
    allowedBridges: [],
    modules:      [],
    createdBy:    'seed',
  });

  console.log('\n✅  Admin account created');
  console.log('    userId  :', u.userId);
  console.log('    email   :', u.email);
  console.log('    mobile  :', u.mobile || '(none)');
  console.log('    password:', password, ' ← CHANGE THIS IMMEDIATELY\n');
  await mongoose.disconnect();
}
main().catch(e => { console.error('[seed] Error:', e.message); process.exit(1); });
