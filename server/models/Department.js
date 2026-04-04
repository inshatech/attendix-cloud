'use strict';
const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
  departmentId: { type: String, required: true, unique: true, index: true },
  orgId:        { type: String, required: true, index: true },
  name:         { type: String, required: true },
  code:         { type: String, default: null },        // e.g. HR, IT, FIN
  description:  { type: String, default: null },
  isActive:     { type: Boolean, default: true, index: true },
  createdBy:    { type: String, default: null },
  updatedBy:    { type: String, default: null },
}, { timestamps: true });

DepartmentSchema.index({ orgId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Department', DepartmentSchema);
