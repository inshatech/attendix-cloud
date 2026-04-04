'use strict';
const express    = require('express');
const router     = express.Router();
const { v4: uuidv4 } = require('uuid');

const Department = require('../models/Department');
const Employee   = require('../models/Employee');
const { requireAuth } = require('../auth/middleware');
const { generalApiLimiter } = require('../auth/rateLimits');

let _Organization;
function init({ Organization }) { _Organization = Organization; }

async function getOwnedOrg(orgId, userId, role) {
  if (!_Organization) return null;
  const org = await _Organization.findOne({ orgId });
  if (!org) return null;
  if (role !== 'admin' && role !== 'support' && org.ownerId !== userId) return null;
  return org;
}

// GET /organizations/:orgId/departments
router.get('/organizations/:orgId/departments', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const depts = await Department.find({ orgId: req.params.orgId, isActive: true }).sort({ name: 1 }).lean();
    res.json({ status: 'success', count: depts.length, data: depts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /organizations/:orgId/departments
router.post('/organizations/:orgId/departments', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Department name is required' });

    const dept = await Department.create({
      departmentId: `dept-${uuidv4().split('-')[0]}`,
      orgId:        req.params.orgId,
      name:         req.body.name.trim(),
      code:         req.body.code?.trim() || null,
      description:  req.body.description?.trim() || null,
      createdBy:    req.authUser.userId,
    });
    res.status(201).json({ status: 'success', data: dept });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Department name already exists in this organization' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /organizations/:orgId/departments/:deptId
router.patch('/organizations/:orgId/departments/:deptId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { departmentId: _a, orgId: _b, createdAt: _c, createdBy: _d, ...fields } = req.body;
    if (fields.name) fields.name = fields.name.trim();
    fields.updatedBy = req.authUser.userId;

    const dept = await Department.findOneAndUpdate(
      { departmentId: req.params.deptId, orgId: req.params.orgId },
      { $set: fields }, { new: true }
    );
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    res.json({ status: 'success', data: dept });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Department name already exists in this organization' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /organizations/:orgId/departments/:deptId
router.delete('/organizations/:orgId/departments/:deptId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const dept = await Department.findOne({ departmentId: req.params.deptId, orgId: req.params.orgId }).lean();
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const inUse = await Employee.countDocuments({ orgId: req.params.orgId, department: dept.name, status: 'active' });
    if (inUse > 0) return res.status(409).json({ error: `Cannot delete — ${inUse} active employee(s) are assigned to this department.` });

    await Department.deleteOne({ departmentId: req.params.deptId, orgId: req.params.orgId });
    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.init = init;
