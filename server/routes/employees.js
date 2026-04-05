'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const Employee   = require('../models/Employee');
const Shift      = require('../models/Shift');
const Department = require('../models/Department');
const { requireAuth, requireRole } = require('../auth/middleware');
const { getActiveSubscription } = require('../services/subscriptionService');
const { generalApiLimiter, adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');
const { uploadBase64, deleteImage, publicIdFromUrl } = require('../services/uploadService');

// Runtime refs injected from app.js
let _MachineUser, _AttendanceLog, _Organization;

function init({ MachineUser, AttendanceLog, Organization }) {
  _MachineUser  = MachineUser;
  _AttendanceLog = AttendanceLog;
  _Organization  = Organization;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function genEmployeeId() { return `emp-${uuidv4().split('-')[0]}${uuidv4().split('-')[0]}`; }

// Verify org belongs to caller (admin/support can access any org; user must own it)
async function getOwnedOrg(orgId, userId, role) {
  if (!_Organization) return null;
  const org = await _Organization.findOne({ orgId });
  if (!org) return null;
  if (role !== 'admin' && role !== 'support' && org.ownerId !== userId) return null;
  return org;
}

// ════════════════════════════════════════════════════════════════════════════════
//  SHIFTS
// ════════════════════════════════════════════════════════════════════════════════

// GET  /organizations/:orgId/shifts
router.get('/organizations/:orgId/shifts', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const shifts = await Shift.find({ orgId: req.params.orgId }).sort({ isDefault: -1, name: 1 }).lean();
    res.json({ status: 'success', count: shifts.length, data: shifts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET  /organizations/:orgId/shifts/:shiftId
router.get('/organizations/:orgId/shifts/:shiftId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const shift = await Shift.findOne({ shiftId: req.params.shiftId, orgId: req.params.orgId }).lean();
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    // Count employees on this shift
    const employeeCount = await Employee.countDocuments({ orgId: req.params.orgId, shiftId: req.params.shiftId });
    res.json({ status: 'success', data: { ...shift, employeeCount } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /organizations/:orgId/shifts
router.post('/organizations/:orgId/shifts', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!req.body.name) return res.status(400).json({ error: 'Shift name is required' });

    // If this is set as default, unset others
    if (req.body.isDefault) {
      await Shift.updateMany({ orgId: req.params.orgId }, { $set: { isDefault: false } });
    }

    const shift = await Shift.create({
      shiftId:   `shf-${uuidv4().split('-')[0]}`,
      orgId:     req.params.orgId,
      createdBy: req.authUser.userId,
      ...req.body,
    });
    res.status(201).json({ status: 'success', data: shift });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /organizations/:orgId/shifts/:shiftId
router.patch('/organizations/:orgId/shifts/:shiftId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { shiftId: _a, orgId: _b, createdAt: _c, updatedAt: _d, createdBy: _e, ...fields } = req.body;
    fields.updatedBy = req.authUser.userId;

    // If setting as default, unset others first
    if (fields.isDefault) {
      await Shift.updateMany({ orgId: req.params.orgId, shiftId: { $ne: req.params.shiftId } }, { $set: { isDefault: false } });
    }

    const shift = await Shift.findOneAndUpdate(
      { shiftId: req.params.shiftId, orgId: req.params.orgId },
      { $set: fields }, { new: true }
    );
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    res.json({ status: 'success', data: shift });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /organizations/:orgId/shifts/:shiftId
router.delete('/organizations/:orgId/shifts/:shiftId', requireAuth, adminApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const inUse = await Employee.countDocuments({ shiftId: req.params.shiftId, status: 'active' });
    if (inUse > 0) return res.status(409).json({ error: `Cannot delete — ${inUse} active employee(s) are assigned to this shift. Re-assign them first.` });

    await Shift.deleteOne({ shiftId: req.params.shiftId, orgId: req.params.orgId });
    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════════
//  EMPLOYEES
// ════════════════════════════════════════════════════════════════════════════════

// GET  /organizations/:orgId/employees
router.get('/organizations/:orgId/employees', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { status, department, shiftId, q, page = 1, limit = 50 } = req.query;
    const filter = { orgId: req.params.orgId };
    if (status)     filter.status     = status;
    if (department) filter.department = department;
    if (shiftId)    filter.shiftId    = shiftId;
    if (q) {
      const re = new RegExp(q, 'i');
      filter.$or = [{ firstName: re }, { lastName: re }, { displayName: re }, { employeeCode: re }, { email: re }, { mobile: re }, { designation: re }];
    }

    const [employees, total] = await Promise.all([
      Employee.find(filter).sort({ employeeCode: 1, firstName: 1 })
        .skip((+page - 1) * +limit).limit(+limit).lean(),
      Employee.countDocuments(filter),
    ]);

    // Attach shift name for convenience
    const shiftIds = [...new Set(employees.map(e => e.shiftId).filter(Boolean))];
    const shifts = shiftIds.length
      ? await Shift.find({ shiftId: { $in: shiftIds } }).select('shiftId name color code').lean()
      : [];
    const shiftMap = Object.fromEntries(shifts.map(s => [s.shiftId, s]));

    // Enrich with machine count + last attendance
    let enriched = employees.map(e => ({
      ...e,
      shift: e.shiftId ? shiftMap[e.shiftId] || null : null,
      machineCount: 0, lastSync: null, lastPunch: null,
    }));

    if (_MachineUser && employees.length > 0) {
      const org = await _Organization?.findOne({ orgId: req.params.orgId }).lean();
      if (org?.bridgeId) {
        const empIds = employees.map(e => e.employeeId);
        const mus = await _MachineUser.find({
          bridgeId: org.bridgeId, userId: { $in: empIds },
        }).select('userId deviceId syncedAt').lean();

        // Group by employeeId
        const muMap = {};
        mus.forEach(m => {
          if (!muMap[m.userId]) muMap[m.userId] = { count: 0, lastSync: null };
          muMap[m.userId].count++;
          if (!muMap[m.userId].lastSync || new Date(m.syncedAt) > new Date(muMap[m.userId].lastSync)) {
            muMap[m.userId].lastSync = m.syncedAt;
          }
        });

        // Get last punch for each employee
        let punchMap = {};
        if (_AttendanceLog && empIds.length > 0) {
          const punches = await _AttendanceLog.aggregate([
            { $match: { userId: { $in: empIds }, bridgeId: org.bridgeId } },
            { $sort: { timestamp: -1 } },
            { $group: { _id: '$userId', lastPunch: { $first: '$timestamp' } } },
          ]);
          punches.forEach(p => { punchMap[p._id] = p.lastPunch; });
        }

        enriched = enriched.map(e => ({
          ...e,
          machineCount: muMap[e.employeeId]?.count || 0,
          lastSync:     muMap[e.employeeId]?.lastSync || null,
          lastPunch:    punchMap[e.employeeId] || null,
        }));
      }
    }

    res.json({
      status: 'success', total, page: +page,
      data: enriched,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET  /organizations/:orgId/employees/:employeeId
router.get('/organizations/:orgId/employees/:employeeId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const emp = await Employee.findOne({ employeeId: req.params.employeeId, orgId: req.params.orgId }).lean();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Attach shift details
    const shift = emp.shiftId ? await Shift.findOne({ shiftId: emp.shiftId }).lean() : null;

    // Attach MachineUser enrollments
    const machineUsers = _MachineUser
      ? await _MachineUser.find({ userId: emp.employeeId }).select('bridgeId deviceId uid name cardno role syncedAt').lean()
      : [];

    res.json({ status: 'success', data: { ...emp, shift, machineUsers } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /organizations/:orgId/employees
router.post('/organizations/:orgId/employees', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!req.body.firstName) return res.status(400).json({ error: 'firstName is required' });

    // Enforce subscription employee limit (skip for admin/support)
    if (req.authUser.role !== 'admin' && req.authUser.role !== 'support') {
      const subResult = await getActiveSubscription(req.authUser.userId);
      if (subResult?.plan?.maxEmployees) {
        const currentCount = await Employee.countDocuments({ orgId: req.params.orgId });
        if (currentCount >= subResult.plan.maxEmployees) {
          return res.status(403).json({
            error: `Your ${subResult.plan.name} plan allows ${subResult.plan.maxEmployees} employees. Upgrade to add more.`,
            code: 'LIMIT_EMPLOYEES',
          });
        }
      }
    }

    // Auto-generate employeeCode if not provided
    if (!req.body.employeeCode) {
      const count = await Employee.countDocuments({ orgId: req.params.orgId });
      req.body.employeeCode = `EMP${String(count + 1).padStart(4, '0')}`;
    }

    // Validate shiftId if provided
    if (req.body.shiftId) {
      const shift = await Shift.findOne({ shiftId: req.body.shiftId, orgId: req.params.orgId, isActive: true }).lean();
      if (!shift) return res.status(400).json({ error: `Shift '${req.body.shiftId}' not found in this organization` });
    }

    const emp = await Employee.create({
      employeeId: genEmployeeId(),
      orgId:      req.params.orgId,
      ...req.body,
    });
    res.status(201).json({ status: 'success', data: emp });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Employee code already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /organizations/:orgId/employees/:employeeId
router.patch('/organizations/:orgId/employees/:employeeId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { employeeId: _a, orgId: _b, createdAt: _c, updatedAt: _d, machineEnrollments: _e, ...fields } = req.body;

    // Validate shiftId if changing
    if (fields.shiftId) {
      const shift = await Shift.findOne({ shiftId: fields.shiftId, orgId: req.params.orgId, isActive: true }).lean();
      if (!shift) return res.status(400).json({ error: `Shift '${fields.shiftId}' not found` });
    }

    const emp = await Employee.findOneAndUpdate(
      { employeeId: req.params.employeeId, orgId: req.params.orgId },
      { $set: fields }, { new: true }
    );
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json({ status: 'success', data: emp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /organizations/:orgId/employees/:employeeId
router.delete('/organizations/:orgId/employees/:employeeId', requireAuth, adminApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const emp = await Employee.findOneAndDelete({ employeeId: req.params.employeeId, orgId: req.params.orgId });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Unlink from all MachineUser records so they can be re-linked to a new employee
    if (_MachineUser) {
      await _MachineUser.updateMany(
        { userId: emp.employeeId },
        { $set: { userId: null } }
      );
    }

    // Remove photo from Cloudinary if exists
    if (emp.photoUrl) {
      const pid = publicIdFromUrl(emp.photoUrl);
      if (pid) await deleteImage(pid).catch(() => {});
    }

    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Employee photo upload ──────────────────────────────────────────────────────
router.post('/organizations/:orgId/employees/:employeeId/photo', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64 data URI) required' });
    if (!image.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });

    const emp = await Employee.findOne({ employeeId: req.params.employeeId, orgId: req.params.orgId }).lean();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    if (emp.photoUrl) {
      const pid = publicIdFromUrl(emp.photoUrl);
      if (pid) await deleteImage(pid).catch(() => {});
    }

    const result = await uploadBase64(image, 'avatar', `emp_${emp.employeeId}`);
    await Employee.updateOne({ employeeId: req.params.employeeId }, { $set: { photoUrl: result.url } });

    res.json({ status: 'success', photoUrl: result.url, size: `${Math.round(result.bytes / 1024)}KB` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Assign shift ───────────────────────────────────────────────────────────────
// PATCH /organizations/:orgId/employees/:employeeId/shift
router.patch('/organizations/:orgId/employees/:employeeId/shift', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { shiftId } = req.body;

    if (shiftId) {
      const shift = await Shift.findOne({ shiftId, orgId: req.params.orgId, isActive: true }).lean();
      if (!shift) return res.status(400).json({ error: `Shift '${shiftId}' not found` });
    }

    const emp = await Employee.findOneAndUpdate(
      { employeeId: req.params.employeeId, orgId: req.params.orgId },
      { $set: { shiftId: shiftId || null } }, { new: true }
    );
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json({ status: 'success', message: shiftId ? `Shift assigned` : 'Shift removed', data: emp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bulk assign shift to multiple employees ────────────────────────────────────
// POST /organizations/:orgId/shifts/:shiftId/assign
router.post('/organizations/:orgId/shifts/:shiftId/assign', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const shift = await Shift.findOne({ shiftId: req.params.shiftId, orgId: req.params.orgId, isActive: true }).lean();
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    const { employeeIds } = req.body; // array or 'all'
    let filter = { orgId: req.params.orgId, status: 'active' };
    if (Array.isArray(employeeIds) && employeeIds.length > 0) {
      filter.employeeId = { $in: employeeIds };
    }

    const result = await Employee.updateMany(filter, { $set: { shiftId: req.params.shiftId } });
    res.json({ status: 'success', message: `Shift assigned to ${result.modifiedCount} employee(s)`, count: result.modifiedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Link employee to MachineUser ───────────────────────────────────────────────
// POST /organizations/:orgId/employees/:employeeId/link-machine
// Body: { bridgeId, deviceId, uid }
router.post('/organizations/:orgId/employees/:employeeId/link-machine', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!_MachineUser) return res.status(503).json({ error: 'Machine service unavailable' });

    const { bridgeId, deviceId, uid } = req.body;
    if (!bridgeId || !deviceId || uid == null) return res.status(400).json({ error: 'bridgeId, deviceId, uid are required' });

    const emp = await Employee.findOne({ employeeId: req.params.employeeId, orgId: req.params.orgId });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Update MachineUser to link this employee
    await _MachineUser.findOneAndUpdate(
      { bridgeId, deviceId, uid: Number(uid) },
      { $set: { userId: emp.employeeId, name: emp.displayName || `${emp.firstName} ${emp.lastName || ''}`.trim() } }
    );

    // Add to employee's machineEnrollments if not already there
    const already = emp.machineEnrollments?.find(m => m.bridgeId === bridgeId && m.deviceId === deviceId && m.uid === Number(uid));
    if (!already) {
      await Employee.updateOne(
        { employeeId: emp.employeeId },
        { $push: { machineEnrollments: { bridgeId, deviceId, uid: Number(uid), enrolledAt: new Date() } } }
      );
    }

    res.json({ status: 'success', message: `Employee linked to machine UID ${uid}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Unlink employee from MachineUser ──────────────────────────────────────────
router.delete('/organizations/:orgId/employees/:employeeId/link-machine', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!_MachineUser) return res.status(503).json({ error: 'Machine service unavailable' });

    const { bridgeId, deviceId, uid } = req.body;
    if (!bridgeId || !deviceId || uid == null) return res.status(400).json({ error: 'bridgeId, deviceId, uid are required' });

    await _MachineUser.updateOne({ bridgeId, deviceId, uid: Number(uid) }, { $set: { userId: null } });
    await Employee.updateOne(
      { employeeId: req.params.employeeId },
      { $pull: { machineEnrollments: { bridgeId, deviceId, uid: Number(uid) } } }
    );

    res.json({ status: 'success', message: 'Machine link removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Employee attendance summary ────────────────────────────────────────────────
// GET /organizations/:orgId/employees/:employeeId/attendance
router.get('/organizations/:orgId/employees/:employeeId/attendance', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!_AttendanceLog) return res.status(503).json({ error: 'Attendance service unavailable' });

    const { startDate, endDate, limit = 500 } = req.query;
    const filter = { userId: req.params.employeeId };
    if (startDate) {
      filter.timestamp = {
        $gte: new Date(`${startDate}T00:00:00`),
        $lte: new Date(`${endDate || startDate}T23:59:59.999`),
      };
    }

    const [emp, logs] = await Promise.all([
      Employee.findOne({ employeeId: req.params.employeeId }).select('displayName firstName lastName employeeCode shiftId').lean(),
      _AttendanceLog.find(filter).sort({ timestamp: -1 }).limit(+limit).lean(),
    ]);

    const shift = emp?.shiftId ? await Shift.findOne({ shiftId: emp.shiftId }).lean() : null;

    res.json({ status: 'success', employee: emp, shift, count: logs.length, data: logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dept / designation list (for dropdowns) ────────────────────────────────────
router.get('/organizations/:orgId/employees/meta/departments', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Source departments from Department collection; fall back to distinct if none defined yet
    const [deptDocs, desigs] = await Promise.all([
      Department.find({ orgId: req.params.orgId, isActive: true }).sort({ name: 1 }).select('name').lean(),
      Employee.distinct('designation', { orgId: req.params.orgId, designation: { $ne: null } }),
    ]);
    // If no managed departments exist, fall back to distinct values from employees
    let deptNames = deptDocs.map(d => d.name);
    if (deptNames.length === 0) {
      deptNames = await Employee.distinct('department', { orgId: req.params.orgId, department: { $ne: null } });
      deptNames.sort();
    }
    res.json({ status: 'success', data: { departments: deptNames, designations: desigs.sort() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── Employee stats (counts by status, dept, etc) ──────────────────────────────
router.get('/organizations/:orgId/employees/meta/stats', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const [total, active, inactive, terminated] = await Promise.all([
      Employee.countDocuments({ orgId: req.params.orgId }),
      Employee.countDocuments({ orgId: req.params.orgId, status: 'active' }),
      Employee.countDocuments({ orgId: req.params.orgId, status: 'inactive' }),
      Employee.countDocuments({ orgId: req.params.orgId, status: { $in: ['terminated','resigned','absconded'] } }),
    ]);

    // Machine user stats — org already fetched above, just use org.bridgeId
    let muTotal = 0, muLinked = 0, muUnlinked = 0;
    if (_MachineUser && org.bridgeId) {
      const [mt, ml] = await Promise.all([
        _MachineUser.countDocuments({ bridgeId: org.bridgeId }),
        _MachineUser.countDocuments({
          bridgeId: org.bridgeId,
          userId:   { $regex: /^emp-/ },
        }),
      ]);
      muTotal = mt; muLinked = ml; muUnlinked = mt - ml;
    }

    res.json({ status: 'success', data: { total, active, inactive, terminated, muTotal, muLinked, muUnlinked } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bulk import employees from machine ────────────────────────────────────────
// POST /organizations/:orgId/employees/bulk-from-machine
// Body: { rows: [{ uid, deviceId, name, department }] }
router.post('/organizations/:orgId/employees/bulk-from-machine', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.bridgeId) return res.status(400).json({ error: 'No bridge connected to this organization' });
    if (!_MachineUser) return res.status(503).json({ error: 'Machine service unavailable' });

    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'rows array is required' });

    // Enforce subscription employee limit (skip for admin/support)
    let remainingSlots = Infinity;
    if (req.authUser.role !== 'admin' && req.authUser.role !== 'support') {
      const subResult = await getActiveSubscription(req.authUser.userId);
      if (subResult?.plan?.maxEmployees) {
        const currentCount = await Employee.countDocuments({ orgId: req.params.orgId });
        remainingSlots = subResult.plan.maxEmployees - currentCount;
        if (remainingSlots <= 0) {
          return res.status(403).json({
            error: `Your ${subResult.plan.name} plan allows ${subResult.plan.maxEmployees} employees. Upgrade to add more.`,
            code: 'LIMIT_EMPLOYEES',
          });
        }
      }
    }

    let codeOffset = await Employee.countDocuments({ orgId: req.params.orgId });
    const results  = [];
    let createdCount = 0;

    for (const row of rows) {
      const { uid, deviceId, name, department } = row;
      if (!name?.trim()) {
        results.push({ uid, deviceId, success: false, error: 'Name is required' });
        continue;
      }
      // Stop creating once subscription limit is reached
      if (createdCount >= remainingSlots) {
        results.push({ uid, deviceId, success: false, error: 'Employee limit reached. Upgrade to add more.' });
        continue;
      }
      try {
        // Check already linked (verify employee still exists — guard against orphaned links)
        const mu = await _MachineUser.findOne({ bridgeId: org.bridgeId, deviceId, uid: Number(uid) });
        if (mu?.userId && String(mu.userId).startsWith('emp-')) {
          const stillExists = await Employee.findOne({ employeeId: mu.userId }).lean();
          if (stillExists) {
            results.push({ uid, deviceId, success: false, error: 'Already linked to an employee' });
            continue;
          }
          // Orphaned link — employee was deleted, clear it so we can re-link below
          await _MachineUser.updateOne({ _id: mu._id }, { $set: { userId: null } });
        }

        const parts     = name.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName  = parts.slice(1).join(' ') || null;
        codeOffset++;
        const employeeCode = `EMP${String(codeOffset).padStart(4, '0')}`;

        const emp = await Employee.create({
          employeeId: genEmployeeId(),
          orgId:      req.params.orgId,
          firstName,
          lastName,
          employeeCode,
          department: department || null,
          status:     'active',
        });

        // Link machine user
        if (mu) {
          await _MachineUser.updateOne(
            { bridgeId: org.bridgeId, deviceId, uid: Number(uid) },
            { $set: { userId: emp.employeeId, name: emp.displayName || name.trim() } }
          );
        }
        await Employee.updateOne(
          { employeeId: emp.employeeId },
          { $push: { machineEnrollments: { bridgeId: org.bridgeId, deviceId, uid: Number(uid), enrolledAt: new Date() } } }
        );

        createdCount++;
        results.push({ uid, deviceId, success: true, employeeId: emp.employeeId, employeeCode: emp.employeeCode, name: emp.displayName || name.trim() });
      } catch (e) {
        if (e.code === 11000) results.push({ uid, deviceId, success: false, error: 'Employee code conflict' });
        else results.push({ uid, deviceId, success: false, error: e.message });
      }
    }

    const created = results.filter(r => r.success).length;
    const failed  = results.filter(r => !r.success).length;
    res.json({ status: 'success', created, failed, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.init = init;
module.exports.router = router;
