'use strict';
const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
  code:       { type: String, default: null },
  expiresAt:  { type: Date,   default: null },
  attempts:   { type: Number, default: 0    },
  lastSentAt: { type: Date,   default: null },
}, { _id: false });

const ModuleSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  enabled:     { type: Boolean, default: false },
  apiKey:      { type: String, default: null },
  apiEndpoint: { type: String, default: null },
  config:      { type: Object, default: {}   },
  enabledAt:   { type: Date,   default: null },
  enabledBy:   { type: String, default: null },
}, { _id: false });

const AuthUserSchema = new mongoose.Schema({
  userId:           { type: String, unique: true, required: true, index: true },
  name:             { type: String, required: true },
  email:            { type: String, default: null, index: true, sparse: true },
  mobile:           { type: String, default: null, index: true, sparse: true },
  passwordHash:     { type: String, default: null },
  role:             { type: String, enum: ['admin','support','user'], default: 'user', index: true },
  mobileVerified:   { type: Boolean, default: false },
  emailVerified:    { type: Boolean, default: false },
  isActive:         { type: Boolean, default: true, index: true },
  mobileOtp:        { type: OtpSchema, default: () => ({}) },
  emailOtp:         { type: OtpSchema, default: () => ({}) },
  totpSecret:       { type: String, default: null },
  totpEnabled:      { type: Boolean, default: false },
  totpBackupCodes:  { type: [String], default: [] },
  loginAttempts:    { type: Number, default: 0 },
  lockedUntil:      { type: Date,   default: null },
  refreshTokens: [{
    tokenHash: String,
    device:    String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
  }],
  allowedBridges:     { type: [String], default: [] },
  modules:            { type: [ModuleSchema], default: [] },
  lastLoginAt:        { type: Date,   default: null },
  lastLoginIp:        { type: String, default: null },
  passwordChangedAt:  { type: Date,   default: null },
  createdBy:          { type: String, default: null },
  googleId:           { type: String, default: null },
  // Profile enrichment
  avatarUrl:          { type: String, default: null },
  bio:                { type: String, default: null },
  designation:        { type: String, default: null },
  department:         { type: String, default: null },
}, { strict: false, timestamps: true });

AuthUserSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('AuthUser', AuthUserSchema);
