'use strict';
const express        = require('express');
const router         = express.Router();
const Organization   = require('../models/Organization');
const Employee       = require('../models/Employee');
const LeavePolicy    = require('../models/LeavePolicy');
const LeaveTransaction = require('../models/LeaveTransaction');
const { requireAuth } = require('../auth/middleware');
const { generalApiLimiter } = require('../auth/rateLimits');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrg(orgId, userId, role) {
  if (['admin', 'support'].includes(role)) return Organization.findOne({ orgId }).lean();
  return Organization.findOne({ orgId, ownerId: userId }).lean();
}

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'other'];

/**
 * Calculate which leave year a date falls in, given a leaveYearStartMonth (1-12).
 * Returns the YYYY-MM string of the leave year start.
 */
function getLeaveYearStart(dateStr, startMonth) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  if (m >= startMonth) {
    return `${y}-${String(startMonth).padStart(2, '0')}`;
  }
  return `${y - 1}-${String(startMonth).padStart(2, '0')}`;
}

/**
 * Compute current leave balance for an employee from the LeaveTransaction ledger.
 * Returns { casual, sick, earned, maternity, paternity, other }
 */
async function computeBalance(orgId, employeeId) {
  const txns = await LeaveTransaction.find({ orgId, employeeId }).lean();
  const bal = { casual: 0, sick: 0, earned: 0, maternity: 0, paternity: 0, other: 0 };
  for (const t of txns) {
    if (bal[t.leaveType] !== undefined) bal[t.leaveType] += t.days;
  }
  // Round to 1 decimal
  for (const k of LEAVE_TYPES) bal[k] = Math.round(bal[k] * 10) / 10;
  return bal;
}

/**
 * Sync the computed balance back to employee.leaveBalance for fast reads.
 */
async function syncBalance(orgId, employeeId) {
  const bal = await computeBalance(orgId, employeeId);
  await Employee.updateOne({ employeeId }, { $set: { leaveBalance: bal } });
  return bal;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE POLICY
// ═══════════════════════════════════════════════════════════════════════════════

// GET /organizations/:orgId/leave-policy
router.get('/organizations/:orgId/leave-policy', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    let policy = await LeavePolicy.findOne({ orgId: req.params.orgId }).lean();
    if (!policy) {
      // Return defaults without saving
      policy = new LeavePolicy({ orgId: req.params.orgId }).toObject();
      policy._isDefault = true;
    }
    res.json({ status: 'success', data: policy });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /organizations/:orgId/leave-policy
router.put('/organizations/:orgId/leave-policy', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { leaveYearStartMonth, types, ptSlabs } = req.body;

    const update = {};
    if (leaveYearStartMonth != null) {
      const m = Number(leaveYearStartMonth);
      if (m < 1 || m > 12) return res.status(400).json({ error: 'leaveYearStartMonth must be 1-12' });
      update.leaveYearStartMonth = m;
    }
    if (types && typeof types === 'object') {
      for (const lt of LEAVE_TYPES) {
        if (!types[lt]) continue;
        const t = types[lt];
        if (t.enabled         != null) update[`types.${lt}.enabled`]         = Boolean(t.enabled);
        if (t.annualQuota     != null) update[`types.${lt}.annualQuota`]     = Math.max(0, Number(t.annualQuota));
        if (t.monthlyLeaveCap != null) update[`types.${lt}.monthlyLeaveCap`] = Math.max(0, Number(t.monthlyLeaveCap));
        if (t.carryForward    != null) update[`types.${lt}.carryForward`]    = Boolean(t.carryForward);
        if (t.carryForwardCap != null) update[`types.${lt}.carryForwardCap`] = Math.max(0, Number(t.carryForwardCap));
      }
    }
    if (Array.isArray(ptSlabs)) {
      update.ptSlabs = ptSlabs.map(s => ({
        min: Number(s.min) || 0,
        max: s.max == null ? null : Number(s.max),
        pt:  Math.max(0, Number(s.pt) || 0),
      }));
    }

    const policy = await LeavePolicy.findOneAndUpdate(
      { orgId: req.params.orgId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ status: 'success', data: policy });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE BALANCE (per employee)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /organizations/:orgId/employees/:employeeId/leave-balance
router.get('/organizations/:orgId/employees/:employeeId/leave-balance', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const emp = await Employee.findOne({ employeeId: req.params.employeeId, orgId: req.params.orgId }).lean();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const balance  = await computeBalance(req.params.orgId, req.params.employeeId);
    const txns     = await LeaveTransaction.find({ orgId: req.params.orgId, employeeId: req.params.employeeId }).sort({ date: -1 }).lean();

    res.json({ status: 'success', data: { balance, transactions: txns } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE TRANSACTIONS — Credit / Debit / Opening
// ═══════════════════════════════════════════════════════════════════════════════

// POST /organizations/:orgId/employees/:employeeId/leave-transactions
// Body: { leaveType, txnType, days, date, notes }
router.post('/organizations/:orgId/employees/:employeeId/leave-transactions', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const emp = await Employee.findOne({ employeeId: req.params.employeeId, orgId: req.params.orgId }).lean();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const { leaveType, txnType, days, date, notes } = req.body;
    if (!LEAVE_TYPES.includes(leaveType)) return res.status(400).json({ error: 'Invalid leaveType' });
    if (!['opening','credit','debit','carryforward','adjustment'].includes(txnType)) return res.status(400).json({ error: 'Invalid txnType' });
    if (days == null || isNaN(Number(days))) return res.status(400).json({ error: 'days is required' });
    if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

    const policy = await LeavePolicy.findOne({ orgId: req.params.orgId }).lean();
    const startMonth = policy?.leaveYearStartMonth || 4;
    const leaveYear  = getLeaveYearStart(date, startMonth);

    const txn = await LeaveTransaction.create({
      orgId:      req.params.orgId,
      employeeId: req.params.employeeId,
      leaveType,
      txnType,
      days:       Number(days),
      date,
      leaveYear,
      notes:      notes || '',
      createdBy:  req.authUser.userId,
    });

    const balance = await syncBalance(req.params.orgId, req.params.employeeId);
    res.json({ status: 'success', data: { transaction: txn, balance } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /organizations/:orgId/leave-transactions/:txnId
router.delete('/organizations/:orgId/leave-transactions/:txnId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const txn = await LeaveTransaction.findOneAndDelete({ txnId: req.params.txnId, orgId: req.params.orgId });
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    const balance = await syncBalance(req.params.orgId, txn.employeeId);
    res.json({ status: 'success', data: { balance } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE SUMMARY — all employees in org (for dashboard & employee list)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /organizations/:orgId/leave-summary
router.get('/organizations/:orgId/leave-summary', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const emps = await Employee.find({ orgId: req.params.orgId, status: 'active' })
      .select('employeeId displayName firstName lastName employeeCode department leaveBalance')
      .lean();

    // Return balances straight from employee.leaveBalance (synced on each transaction)
    const data = emps.map(e => ({
      employeeId: e.employeeId,
      name:       e.displayName || `${e.firstName} ${e.lastName || ''}`.trim(),
      code:       e.employeeCode,
      department: e.department,
      balance:    e.leaveBalance || { casual:0, sick:0, earned:0, maternity:0, paternity:0, other:0 },
    }));

    res.json({ status: 'success', data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ANNUAL LEAVE CREDIT — credit annual quota to all employees
// ═══════════════════════════════════════════════════════════════════════════════

// POST /organizations/:orgId/leave-credit-annual
// Body: { date } — the date of the new leave year start (e.g. "2026-04-01")
router.post('/organizations/:orgId/leave-credit-annual', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

    const policy = await LeavePolicy.findOne({ orgId: req.params.orgId }).lean();
    if (!policy) return res.status(400).json({ error: 'No leave policy configured' });

    const startMonth = policy.leaveYearStartMonth || 4;
    const leaveYear  = getLeaveYearStart(date, startMonth);

    // Check if already credited for this year
    const existing = await LeaveTransaction.findOne({ orgId: req.params.orgId, txnType: 'credit', leaveYear });
    if (existing) return res.status(409).json({ error: `Annual credit already applied for year starting ${leaveYear}` });

    const emps = await Employee.find({ orgId: req.params.orgId, status: 'active' }).select('employeeId').lean();
    const ops  = [];

    for (const emp of emps) {
      for (const lt of LEAVE_TYPES) {
        const cfg = policy.types?.[lt];
        if (!cfg?.enabled || !cfg.annualQuota) continue;

        // Carry forward from previous year
        if (cfg.carryForward) {
          const prevBal = await computeBalance(req.params.orgId, emp.employeeId);
          let cfDays = prevBal[lt] || 0;
          if (cfDays > 0) {
            if (cfg.carryForwardCap > 0) cfDays = Math.min(cfDays, cfg.carryForwardCap);
            // Zero out old balance then credit carry-forward
            ops.push({
              orgId: req.params.orgId, employeeId: emp.employeeId,
              leaveType: lt, txnType: 'adjustment',
              days: -prevBal[lt], date, leaveYear,
              notes: 'Year-end balance zeroed', createdBy: req.authUser.userId,
            });
            ops.push({
              orgId: req.params.orgId, employeeId: emp.employeeId,
              leaveType: lt, txnType: 'carryforward',
              days: cfDays, date, leaveYear,
              notes: `Carry forward from previous year`, createdBy: req.authUser.userId,
            });
          }
        }

        ops.push({
          orgId: req.params.orgId, employeeId: emp.employeeId,
          leaveType: lt, txnType: 'credit',
          days: cfg.annualQuota, date, leaveYear,
          notes: 'Annual quota credit', createdBy: req.authUser.userId,
        });
      }
    }

    if (ops.length) await LeaveTransaction.insertMany(ops);

    // Sync all employee balances
    for (const emp of emps) await syncBalance(req.params.orgId, emp.employeeId);

    res.json({ status: 'success', credited: emps.length, transactions: ops.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router };
