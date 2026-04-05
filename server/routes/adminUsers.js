'use strict';
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const AuthUser = require('../models/AuthUser');
const { requireAuth, requireRole } = require('../auth/middleware');
const { hashPassword } = require('../auth/helpers');
const { adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');

router.use(requireAuth, requireRole('admin'), adminApiLimiter);

// Runtime bridgeMap injected from app.js (needed for live online count)
let _bridgeMap = null;
function init({ bridgeMap }) { _bridgeMap = bridgeMap; }

const SAFE = '-passwordHash -totpSecret -totpBackupCodes -mobileOtp -emailOtp';

function safeUser(u) {
  if (!u) return null;
  const o = typeof u.toObject === 'function' ? u.toObject() : { ...u };
  delete o.passwordHash; delete o.totpSecret; delete o.totpBackupCodes;
  delete o.mobileOtp; delete o.emailOtp;
  return o;
}

// ── ACCOUNTS ──────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { role, isActive, q, page = 1, limit = 50 } = req.query;
    const f = {};
    if (role)       f.role     = role;
    if (isActive !== undefined) f.isActive = isActive === 'true';
    if (q) { const re = new RegExp(q, 'i'); f.$or = [{ name: re }, { userId: re }, { mobile: re }, { email: re }]; }
    const [users, total] = await Promise.all([
      AuthUser.find(f).select(SAFE + ' -refreshTokens').sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
      AuthUser.countDocuments(f),
    ]);
    res.json({ status: 'success', total, page: +page, data: users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', strictAdminLimiter, async (req, res) => {
  try {
    const { name, email, mobile, password, role = 'user', allowedBridges = [], modules = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!email && !mobile) return res.status(400).json({ error: 'email or mobile required' });
    if (!['admin','support','user'].includes(role)) return res.status(400).json({ error: 'role must be admin|support|user' });

    if (email)  { const ex = await AuthUser.findOne({ email: email.toLowerCase() }); if (ex) return res.status(409).json({ error: 'Email already registered' }); }
    if (mobile) { const ex = await AuthUser.findOne({ mobile: mobile.trim() });       if (ex) return res.status(409).json({ error: 'Mobile already registered' }); }

    const u = await AuthUser.create({
      userId:        `usr-${uuidv4().split('-')[0]}`,
      name,
      email:         email  ? email.toLowerCase() : null,
      mobile:        mobile ? mobile.trim()        : null,
      passwordHash:  password ? await hashPassword(password) : null,
      role, allowedBridges, isActive: true,
      modules: modules.map(m => ({ name: m.name, enabled: m.enabled ?? false })),
      createdBy: req.authUser.userId,
    });
    res.status(201).json({ status: 'success', data: safeUser(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users/:userId', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.params.userId }).select(SAFE).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    const sessions = (u.refreshTokens || []).map(t => ({ device: t.device, createdAt: t.createdAt, expiresAt: t.expiresAt }));
    delete u.refreshTokens;
    res.json({ status: 'success', data: { ...u, sessions } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:userId', async (req, res) => {
  try {
    const allowed = ['name','email','mobile','role','isActive','allowedBridges'];
    const update  = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.email) update.email = update.email.toLowerCase();
    if (update.role && !['admin','support','user'].includes(update.role)) return res.status(400).json({ error: 'Invalid role' });
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
    const u = await AuthUser.findOneAndUpdate({ userId: req.params.userId }, { $set: update }, { new: true }).select(SAFE + ' -refreshTokens');
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', data: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:userId', strictAdminLimiter, async (req, res) => {
  try {
    if (req.params.userId === req.authUser.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    const u = await AuthUser.findOneAndDelete({ userId: req.params.userId });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:userId/reset-password', strictAdminLimiter, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'newPassword min 8 chars' });
    const u = await AuthUser.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), refreshTokens: [], loginAttempts: 0, lockedUntil: null } },
      { new: true }
    );
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', message: 'Password reset and all sessions revoked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:userId/lock', async (req, res) => {
  try {
    const { locked } = req.body;
    if (typeof locked !== 'boolean') return res.status(400).json({ error: '"locked" must be boolean' });
    const update = locked
      ? { isActive: false, lockedUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000) }
      : { isActive: true,  lockedUntil: null, loginAttempts: 0 };
    const u = await AuthUser.findOneAndUpdate({ userId: req.params.userId }, { $set: update }, { new: true });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', message: locked ? 'Account locked' : 'Account unlocked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:userId/sessions', async (req, res) => {
  try {
    await AuthUser.updateOne({ userId: req.params.userId }, { $set: { refreshTokens: [] } });
    res.json({ status: 'success', message: 'All sessions revoked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MODULE MANAGEMENT PER USER ────────────────────────────────────────────────
router.get('/users/:userId/modules', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.params.userId }).select('modules').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', data: (u.modules || []).map(m => ({ ...m, apiKey: m.apiKey ? '••••••••' : null })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:userId/modules/:modName', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.params.userId });
    if (!u) return res.status(404).json({ error: 'User not found' });
    const modules = u.modules || [];
    const idx     = modules.findIndex(m => m.name === req.params.modName);
    const mod     = idx >= 0 ? modules[idx] : { name: req.params.modName };
    const { enabled, apiKey, apiEndpoint, config } = req.body;
    if (enabled    !== undefined) mod.enabled    = enabled;
    if (apiKey     !== undefined && apiKey     !== '••••••••') mod.apiKey     = apiKey;
    if (apiEndpoint !== undefined) mod.apiEndpoint = apiEndpoint;
    if (config     !== undefined) mod.config    = { ...(mod.config || {}), ...config };
    if (enabled) { mod.enabledAt = new Date(); mod.enabledBy = req.authUser.userId; }
    if (idx >= 0) modules[idx] = mod; else modules.push(mod);
    await AuthUser.updateOne({ userId: req.params.userId }, { $set: { modules } });
    res.json({ status: 'success', data: { ...mod, apiKey: mod.apiKey ? '••••••••' : null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:userId/modules/:modName', async (req, res) => {
  try {
    await AuthUser.updateOne({ userId: req.params.userId }, { $pull: { modules: { name: req.params.modName } } });
    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── ADMIN DASHBOARD STATS ─────────────────────────────────────────────────────
router.get('/stats', requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    const mongoose  = require('mongoose');
    const os        = require('os');
    const Organization   = require('../models/Organization');
    const { Plugin }     = require('../models/Plugin');
    const { UserSubscription, SubscriptionPlan } = require('../models/Subscription');

    // Basic counts
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const [totalUsers, activeUsers, lockedUsers, newTodayUsers, totalOrgs, activeOrgs] = await Promise.all([
      AuthUser.countDocuments({}),
      AuthUser.countDocuments({ isActive: true }),
      AuthUser.countDocuments({ lockedUntil: { $gt: new Date() } }),
      AuthUser.countDocuments({ createdAt: { $gte: todayMidnight } }),
      Organization.countDocuments({}),
      Organization.countDocuments({ isActive: true }),
    ]);

    // Subscriptions
    const [trialSubs, activeSubs, expiredSubs, totalSubs, planBreakdown] = await Promise.all([
      UserSubscription.countDocuments({ status: 'trial' }),
      UserSubscription.countDocuments({ status: 'active' }),
      UserSubscription.countDocuments({ status: 'expired' }),
      UserSubscription.countDocuments({}),
      UserSubscription.aggregate([
        { $group: { _id: { planId: '$planId', status: '$status' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Employees
    let totalEmps = 0, activeEmps = 0;
    try {
      const Employee = mongoose.model('Employee');
      [totalEmps, activeEmps] = await Promise.all([
        Employee.countDocuments({}),
        Employee.countDocuments({ status: 'active' }),
      ]);
    } catch {}

    // Machine Users
    let muTotal = 0, muLinked = 0;
    try {
      const MachineUser = mongoose.model('MachineUser');
      [muTotal, muLinked] = await Promise.all([
        MachineUser.estimatedDocumentCount(),
        MachineUser.countDocuments({ userId: { $ne: null } }),
      ]);
    } catch {}

    // Attendance
    let todayLogs = 0, totalLogs = 0;
    try {
      const AttendanceLog = mongoose.model('AttendanceLog');
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      [todayLogs, totalLogs] = await Promise.all([
        AttendanceLog.countDocuments({ timestamp: { $gte: todayStart } }),
        AttendanceLog.estimatedDocumentCount(),
      ]);
    } catch {}

    // Tickets
    let openTickets = 0, unassigned = 0;
    try {
      const Ticket = mongoose.model('Ticket');
      [openTickets, unassigned] = await Promise.all([
        Ticket.countDocuments({ status: { $in: ['open','pending'] } }),
        Ticket.countDocuments({ status: 'open', assignedTo: null }),
      ]);
    } catch {}

    // Plugins
    const plugins = await Plugin.find({}).select('name label enabled lastTestResult lastTestedAt').lean();

    // Recent signups
    const recentSignups = await AuthUser.find({})
      .sort({ createdAt: -1 }).limit(5)
      .select('name email mobile role createdAt photoUrl').lean();

    // Infrastructure — count from Bridge model
    let totalBridges = 0, onlineBridges = 0, totalDevices = 0, enabledDevices = 0;
    try {
      const Bridge = mongoose.model('Bridge');
      const Device = mongoose.model('Device');
      [totalBridges, totalDevices, enabledDevices] = await Promise.all([
        Bridge.countDocuments({}),
        Device.countDocuments({}),
        Device.countDocuments({ enabled: true }),
      ]);
      // Count online bridges from the live bridgeMap (WebSocket connections)
      if (_bridgeMap) {
        for (const [, entry] of _bridgeMap) {
          if (entry?.socket?.readyState === 1) onlineBridges++;
        }
      }
    } catch {}

    // Top orgs by device count
    let topOrgs = [];
    try {
      const Device = mongoose.model('Device');
      const devCounts = await Device.aggregate([
        { $group: { _id: '$bridgeId', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 5 },
      ]);
      const orgs = await Organization.find({}).lean();
      topOrgs = devCounts.map(d => {
        const org = orgs.find(o => o.bridgeId === d._id);
        return org ? { ...org, deviceCount: d.count } : null;
      }).filter(Boolean);
    } catch {}

    // MongoDB stats
    let mongoStats = { state: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' };
    try {
      const dbStats = await mongoose.connection.db.stats();
      mongoStats = { ...mongoStats, dataSize: `${(dbStats.dataSize/1024/1024).toFixed(1)} MB`, collections: dbStats.collections, indexes: dbStats.indexes, objects: dbStats.objects };
    } catch {}

    // System
    const uptime = process.uptime();
    const h = Math.floor(uptime/3600), m = Math.floor((uptime%3600)/60), s = Math.floor(uptime%60);
    const mem = process.memoryUsage();
    const loadAvg = os.loadavg();

    res.json({
      users:          { total: totalUsers, active: activeUsers, locked: lockedUsers, newToday: newTodayUsers, recent: recentSignups },
      organizations:  { total: totalOrgs, active: activeOrgs, top: topOrgs },
      subscriptions:  { trial: trialSubs, active: activeSubs, expired: expiredSubs, total: totalSubs, planBreakdown },
      employees:      { total: totalEmps, active: activeEmps },
      attendance:     { todayLogs, totalLogs },
      tickets:        { open: openTickets, unassigned },
      plugins,
      infrastructure: {
        bridges: {
          total:   totalBridges,
          online:  onlineBridges,
          offline: totalBridges - onlineBridges,
        },
        devices: {
          total:    totalDevices,
          enabled:  enabledDevices,
          disabled: totalDevices - enabledDevices,
        },
        machineUsers: {
          total:    muTotal,
          linked:   muLinked,
          unlinked: muTotal - muLinked,
        },
      },
      system: {
        mongo:       mongoStats,
        nodeVersion: process.version,
        uptime:      Math.floor(uptime),
        uptimeHuman: `${h}h ${m}m ${s}s`,
        memory: {
          heapUsedMB:  Math.round(mem.heapUsed/1024/1024),
          heapTotalMB: Math.round(mem.heapTotal/1024/1024),
          rssMB:       Math.round(mem.rss/1024/1024),
        },
        os: {
          platform:   process.platform,
          arch:       process.arch,
          cpus:       os.cpus().length,
          totalMemMB: Math.round(os.totalmem()/1024/1024),
          freeMemMB:  Math.round(os.freemem()/1024/1024),
          loadAvg:    loadAvg.map(l => l.toFixed(2)),
        },
      },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


module.exports = router;
module.exports.init = init;

// ── ADMIN NOTIFICATIONS ───────────────────────────────────────────────────────
router.get('/notifications', requireAuth, requireRole('admin', 'support'), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { UserSubscription } = require('../models/Subscription');
    const AuthUser = require('../models/AuthUser');

    const now = new Date();
    const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [expiringTrials, expiredSubs, newUsers] = await Promise.all([
      UserSubscription.find({ status: 'trial', trialEndsAt: { $gte: now, $lte: in3days } }).lean(),
      UserSubscription.find({ status: 'active', endDate: { $gte: now, $lte: in7days } }).lean(),
      AuthUser.find({ createdAt: { $gte: since24h }, role: 'user' }).select('name email createdAt').lean(),
    ]);

    const notifications = [];

    expiringTrials.forEach(s => notifications.push({
      id: `trial-${s._id}`, type: 'trial_expiring', severity: 'warning',
      message: `Trial expires soon for user ${s.userId}`,
      data: s, createdAt: s.trialEndsAt,
    }));

    expiredSubs.forEach(s => notifications.push({
      id: `sub-${s._id}`, type: 'subscription_expiring', severity: 'warning',
      message: `Subscription expiring for user ${s.userId}`,
      data: s, createdAt: s.endDate,
    }));

    newUsers.forEach(u => notifications.push({
      id: `user-${u._id}`, type: 'new_user', severity: 'info',
      message: `New user registered: ${u.name || u.email}`,
      data: u, createdAt: u.createdAt,
    }));

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ status: 'success', count: notifications.length, data: notifications });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
