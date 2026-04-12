'use strict';
const mongoose = require('mongoose');

const BackupLogSchema = new mongoose.Schema({
  logId:       { type: String, required: true, unique: true, index: true },
  type:        { type: String, enum: ['manual', 'scheduled'], default: 'manual' },
  action:      { type: String, enum: ['create', 'restore', 'email'], default: 'create' },
  status:      { type: String, enum: ['success', 'failed'], required: true },
  filename:    { type: String, default: null },
  sizeBytes:   { type: Number, default: 0 },
  collections: { type: Number, default: 0 },
  documents:   { type: Number, default: 0 },
  emailedTo:   { type: [String], default: [] },
  error:       { type: String, default: null },
  createdBy:   { type: String, default: 'system' },
}, { timestamps: true });

BackupLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BackupLog', BackupLogSchema);
