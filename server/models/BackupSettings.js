'use strict';
const mongoose = require('mongoose');

// Single-document settings store — always upserted with { _id: 'singleton' }
const BackupSettingsSchema = new mongoose.Schema({
  _id:              { type: String, default: 'singleton' },
  scheduleEnabled:  { type: Boolean, default: false },
  frequency:        { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
  sendTime:         { type: String, default: '02:00' },   // "HH:MM" 24h
  timezone:         { type: String, default: 'Asia/Kolkata' },
  recipients:       { type: [String], default: [] },
  keepLast:         { type: Number, default: 7 },          // keep N backup files on disk
  weekday:          { type: Number, default: 0 },          // 0=Sun … 6=Sat (for weekly)
  monthDay:         { type: Number, default: 1 },          // 1–31 (for monthly)
  lastBackupAt:     { type: Date, default: null },
  lastEmailAt:      { type: Date, default: null },
  lastBackupFile:   { type: String, default: null },
  lastScheduledDate:{ type: String, default: null },       // "YYYY-MM-DD" dedup guard
}, { timestamps: true });

module.exports = mongoose.model('BackupSettings', BackupSettingsSchema);
