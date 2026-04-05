'use strict';
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const Organization   = require('../models/Organization');
const { Plugin }     = require('../models/Plugin');
const { SubscriptionPlan, UserSubscription } = require('../models/Subscription');
const { requireAuth, requireRole } = require('../auth/middleware');
const { adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');

const STAFF = requireRole('admin', 'support');
const ADMIN = requireRole('admin');

let _Bridge, _Device, _MachineUser, _AttendanceLog, _SyncState, _bridgeMap, _pushDeviceConfig, _queueTunnel, _socketSend;

function init(refs) {
  _Bridge            = refs.Bridge;
  _Device            = refs.Device;
  _MachineUser       = refs.MachineUser;
  _AttendanceLog     = refs.AttendanceLog;
  _SyncState         = refs.SyncState;
  _bridgeMap         = refs.bridgeMap;
  _pushDeviceConfig  = refs.pushDeviceConfig;
  _queueTunnel       = refs.queueTunnel;
  _socketSend        = refs.socketSend;
}

// ── LIST ORGS ─────────────────────────────────────────────────────────────────
router.get('/orgs', requireAuth, STAFF, async (req, res) => {
  try {
    const { q, isActive, limit = 200, skip = 0 } = req.query;
    const filter = {};
    if (q)        filter.$or = [{ name: { $regex: q, $options: 'i' } }, { orgId: { $regex: q, $options: 'i' } }, { city: { $regex: q, $options: 'i' } }];
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const orgs = await Organization.find(filter).sort({ createdAt: -1 }).limit(+limit).skip(+skip).lean();
    const total = await Organization.countDocuments(filter);

    const enriched = await Promise.all(orgs.map(async org => {
      const live        = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
      const deviceCount = org.bridgeId && _Device ? await _Device.countDocuments({ bridgeId: org.bridgeId }) : 0;
      return { ...org, bridgeOnline: !!(live?.socket?.readyState === 1), deviceCount };
    }));

    res.json({ status: 'success', total, data: enriched });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET SINGLE ORG ────────────────────────────────────────────────────────────
router.get('/orgs/:orgId', requireAuth, STAFF, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org) return res.status(404).json({ error: 'Not found' });
    const live        = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    const deviceCount = org.bridgeId && _Device ? await _Device.countDocuments({ bridgeId: org.bridgeId }) : 0;
    const devices     = org.bridgeId && _Device  ? await _Device.find({ bridgeId: org.bridgeId }).lean() : [];
    res.json({ status:'success', data: { ...org, bridgeOnline: !!(live?.socket?.readyState === 1), deviceCount, devices } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── EDIT ORG ──────────────────────────────────────────────────────────────────
router.patch('/orgs/:orgId', requireAuth, ADMIN, async (req, res) => {
  try {
    const allowed = ['name','industry','city','state','address','phone','email','country'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const org = await Organization.findOneAndUpdate({ orgId: req.params.orgId }, { $set: update }, { new: true });
    if (!org) return res.status(404).json({ error: 'Not found' });
    res.json({ status: 'success', data: org });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SUSPEND / ACTIVATE ────────────────────────────────────────────────────────
router.patch('/orgs/:orgId/status', requireAuth, ADMIN, async (req, res) => {
  try {
    const { isActive, reason } = req.body;
    const org = await Organization.findOneAndUpdate(
      { orgId: req.params.orgId },
      { $set: { isActive: !!isActive, suspendReason: reason || null } },
      { new: true }
    );
    if (!org) return res.status(404).json({ error: 'Not found' });
    res.json({ status:'success', data: org });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE ORG ────────────────────────────────────────────────────────────────
router.delete('/orgs/:orgId', requireAuth, ADMIN, strictAdminLimiter, async (req, res) => {
  try {
    const org = await Organization.findOneAndDelete({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: 'Not found' });
    if (org.bridgeId && _Bridge)  await _Bridge.deleteOne({ bridgeId: org.bridgeId });
    if (org.bridgeId && _Device)  await _Device.deleteMany({ bridgeId: org.bridgeId });
    if (org.bridgeId && _MachineUser) await _MachineUser.deleteMany({ bridgeId: org.bridgeId });
    res.json({ status:'success', message: 'Organization deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BRIDGE: CREATE ────────────────────────────────────────────────────────────
router.post('/orgs/:orgId/bridge/create', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId });
    if (!org)         return res.status(404).json({ error: 'Organization not found' });
    if (org.bridgeId) return res.status(409).json({ error: 'Organization already has a bridge' });
    const newBridgeId = `br-${uuidv4().split('-')[0]}`;
    await _Bridge.create({ bridgeId: newBridgeId, name: req.body.name || `${org.name} Bridge`, status: 'offline' });
    org.bridgeId = newBridgeId;
    await org.save();
    res.json({ status:'success', message: 'Bridge created', data: { bridgeId: newBridgeId } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BRIDGE: CONNECT (existing bridge ID) ─────────────────────────────────────
router.post('/orgs/:orgId/bridge/connect', requireAuth, ADMIN, async (req, res) => {
  try {
    const { bridgeId } = req.body;
    if (!bridgeId) return res.status(400).json({ error: 'bridgeId required' });
    const org = await Organization.findOne({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.bridgeId) return res.status(409).json({ error: 'Organization already has a bridge. Disconnect first.' });
    const bridge = await _Bridge.findOne({ bridgeId });
    if (!bridge) return res.status(404).json({ error: 'Bridge ID not found' });
    org.bridgeId = bridgeId;
    await org.save();
    res.json({ status:'success', message: 'Bridge connected' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BRIDGE: DISCONNECT ────────────────────────────────────────────────────────
router.post('/orgs/:orgId/bridge/disconnect', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: 'Not found' });
    const live = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    if (live?.socket) live.socket.close(1000, 'Disconnected by admin');
    org.bridgeId = null;
    await org.save();
    res.json({ status:'success', message: 'Bridge disconnected' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BRIDGE: RESTART (send restart command) ────────────────────────────────────
router.post('/orgs/:orgId/bridge/restart', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.status(404).json({ error: 'No bridge on this org' });
    const live = _bridgeMap?.get(org.bridgeId);
    if (!live?.socket || live.socket.readyState !== 1)
      return res.status(503).json({ error: 'Bridge is offline' });
    live.socket.send(JSON.stringify({ action: 'RESTART' }));
    res.json({ status:'success', message: 'Restart signal sent' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BRIDGE CONFIG (credentials for Bridge app) ────────────────────────────────
router.get('/orgs/:orgId/bridge-config', requireAuth, STAFF, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org) return res.status(404).json({ error: 'Not found' });
    const appPlugin = await Plugin.findOne({ name: 'bridge_app' }).lean();
    const cfg       = appPlugin?.config || {};
    const protocol  = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
    const host      = req.headers['x-forwarded-host']  || req.headers.host || 'localhost:8000';
    const wsProto   = protocol === 'https' ? 'wss' : 'ws';
    res.json({ data: {
      bridgeId     : org.bridgeId   || null,
      wsUrl        : cfg.wsUrl      || `${wsProto}://${host}/bridge`,
      apiUrl       : cfg.apiUrl     || `${protocol}://${host}/api`,
      wsSecret     : cfg.wsSecret   || process.env.WS_SECRET || 'change-this-ws-secret-2026',
      downloadUrl  : cfg.downloadUrl || null,
      version      : cfg.version    || null,
      fileSizeMb   : cfg.fileSizeMb || null,
      downloadCount: cfg.downloadCount || 0,
    }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ORG STATS ─────────────────────────────────────────────────────────────────
router.get('/orgs/:orgId/stats', requireAuth, STAFF, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org) return res.status(404).json({ error: 'Not found' });

    const mongoose = require('mongoose');
    const Employee    = mongoose.model('Employee');
    const AttendanceLog = _AttendanceLog || (mongoose.models.AttendanceLog ? mongoose.model('AttendanceLog') : null);

    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
    const [empTotal, empActive, muTotal, muLinked, devTotal, devEnabled,
           todayPunches, weekPunches, totalLogs, sub] = await Promise.all([
      Employee.countDocuments({ orgId: req.params.orgId }),
      // Employee uses status:'active', NOT isActive (that field doesn't exist on Employee model)
      Employee.countDocuments({ orgId: req.params.orgId, status: 'active' }),
      // MachineUser uses bridgeId, NOT orgId
      _MachineUser && org.bridgeId ? _MachineUser.countDocuments({ bridgeId: org.bridgeId }) : Promise.resolve(0),
      _MachineUser && org.bridgeId ? _MachineUser.countDocuments({ bridgeId: org.bridgeId, userId: { $regex: /^emp-/ } }) : Promise.resolve(0),
      _Device ? _Device.countDocuments({ bridgeId: org.bridgeId }) : Promise.resolve(0),
      _Device ? _Device.countDocuments({ bridgeId: org.bridgeId, enabled: true }) : Promise.resolve(0),
      // AttendanceLog uses bridgeId, NOT orgId
      AttendanceLog && org.bridgeId ? AttendanceLog.countDocuments({ bridgeId: org.bridgeId, timestamp: { $gte: todayMidnight } }) : Promise.resolve(0),
      AttendanceLog && org.bridgeId ? AttendanceLog.countDocuments({ bridgeId: org.bridgeId, timestamp: { $gte: weekAgo } }) : Promise.resolve(0),
      AttendanceLog && org.bridgeId ? AttendanceLog.countDocuments({ bridgeId: org.bridgeId }) : Promise.resolve(0),
      UserSubscription.findOne({ userId: org.ownerId, status: { $in: ['trial','active'] } }).lean(),
    ]);

    const live = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    const bridgeDoc = org.bridgeId && _Bridge ? await _Bridge.findOne({ bridgeId: org.bridgeId }).lean() : null;
    let permitted = null;
    if (sub) {
      const p = await SubscriptionPlan.findOne({ planId: sub.planId }).lean();
      if (p) permitted = p.maxEmployees;
    }

    res.json({ data: {
      employees    : { total: empTotal, active: empActive, permitted },
      machineUsers : { total: muTotal, linked: muLinked, unlinked: muTotal - muLinked },
      devices      : { total: devTotal, enabled: devEnabled },
      attendance   : { today: todayPunches, week: weekPunches, total: totalLogs },
      bridge       : org.bridgeId ? {
        id: org.bridgeId, name: bridgeDoc?.name,
        online: !!(live?.socket?.readyState === 1),
        lastSeen: bridgeDoc?.lastSeenAt || bridgeDoc?.updatedAt,
      } : null,
      subscription : sub ? { status: sub.status, endDate: sub.endDate } : null,
    }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MACHINE USERS ─────────────────────────────────────────────────────────────
router.get('/orgs/:orgId/machine-users', requireAuth, STAFF, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.json({ data: [] });
    const mus = await _MachineUser.find({ bridgeId: org.bridgeId }).lean();
    const mongoose = require('mongoose');
    const Employee = mongoose.model('Employee');
    // MachineUser.userId stores emp-xxx (employeeId), look up by employeeId NOT userId
    const empIds = [...new Set(mus.map(m => m.userId).filter(id => id && String(id).startsWith('emp-')))];
    const empDocs = empIds.length
      ? await Employee.find({ employeeId: { $in: empIds } }).select('employeeId firstName lastName displayName employeeCode photoUrl').lean()
      : [];
    const empMap = Object.fromEntries(empDocs.map(e => [e.employeeId, e]));
    const populated = mus.map(mu => ({ ...mu, employee: mu.userId ? empMap[mu.userId] || null : null }));
    res.json({ data: populated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/orgs/:orgId/machine-users/:id/unlink', requireAuth, ADMIN, async (req, res) => {
  try {
    await _MachineUser.updateOne({ _id: req.params.id }, { $unset: { userId: 1 } });
    res.json({ status:'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/orgs/:orgId/machine-users/unlinked', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.json({ deleted: 0 });
    const r = await _MachineUser.deleteMany({ bridgeId: org.bridgeId, userId: null });
    res.json({ deleted: r.deletedCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICES ───────────────────────────────────────────────────────────────────
router.get('/orgs/:orgId/devices', requireAuth, STAFF, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.json({ data: [] });
    const devs = await _Device.find({ bridgeId: org.bridgeId }).lean();
    const live = _bridgeMap?.get(org.bridgeId);
    const bridgeOnline = !!(live?.socket?.readyState === 1);
    res.json({ data: devs.map(d => ({ ...d, bridgeOnline })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/orgs/:orgId/devices/:deviceId/enabled', requireAuth, ADMIN, async (req, res) => {
  try {
    await _Device.updateOne({ deviceId: req.params.deviceId }, { $set: { enabled: !!req.body.enabled } });
    res.json({ status:'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/orgs/:orgId/devices/:deviceId', requireAuth, ADMIN, strictAdminLimiter, async (req, res) => {
  try {
    await _Device.deleteOne({ deviceId: req.params.deviceId });
    await _MachineUser?.deleteMany({ deviceId: req.params.deviceId });
    res.json({ status:'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/orgs/:orgId/devices/:deviceId/sync', requireAuth, STAFF, async (req, res) => {
  try {
    const org  = await Organization.findOne({ orgId: req.params.orgId }).lean();
    const live = org?.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    if (!live?.socket || live.socket.readyState !== 1) return res.status(503).json({ error: 'Bridge offline' });
    const { v4: uuidv4 } = require('uuid');
    _socketSend(live.socket, { type: 'TRIGGER_SYNC', deviceId: req.params.deviceId, reqId: uuidv4() });
    res.json({ status:'success', message: 'Sync triggered' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/orgs/:orgId/devices/:deviceId/push-config', requireAuth, ADMIN, async (req, res) => {
  try {
    const org  = await Organization.findOne({ orgId: req.params.orgId }).lean();
    const live = org?.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    if (!live?.socket || live.socket.readyState !== 1) return res.status(503).json({ error: 'Bridge offline' });
    if (_pushDeviceConfig) await _pushDeviceConfig(org.bridgeId, live.socket);
    res.json({ status:'success', message: 'Config pushed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE INFO (DB status + tunnel hardware info) ────────────────────────────
router.get('/orgs/:orgId/devices/:deviceId/info', requireAuth, STAFF, async (req, res) => {
  try {
    const { orgId, deviceId } = req.params;
    const org  = await Organization.findOne({ orgId }).lean();
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const dev  = await _Device.findOne({ deviceId }).lean();
    if (!dev)  return res.status(404).json({ error: 'Device not found' });
    const live         = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    const bridgeOnline = !!(live?.socket?.readyState === 1);
    const deviceStatus = live?.deviceStatuses?.get(deviceId) || 'unknown';
    const syncState    = _SyncState ? await _SyncState.findOne({ bridgeId: org.bridgeId, deviceId }).lean() : null;
    // If bridge is online, also fetch live hardware info via tunnel
    let hwInfo = null;
    if (bridgeOnline && _queueTunnel) {
      try {
        const [info, name, version, osInfo, platform, mac] = await Promise.all([
          _queueTunnel(org.bridgeId, deviceId, 'getInfo'),
          _queueTunnel(org.bridgeId, deviceId, 'getDeviceName'),
          _queueTunnel(org.bridgeId, deviceId, 'getDeviceVersion'),
          _queueTunnel(org.bridgeId, deviceId, 'getOS').catch(() => null),
          _queueTunnel(org.bridgeId, deviceId, 'getPlatform').catch(() => null),
          _queueTunnel(org.bridgeId, deviceId, 'getMacAddress').catch(() => null),
        ]);
        hwInfo = { name, version, os: osInfo, platform, mac, stats: info };
      } catch { /* bridge online but device may not be connected */ }
    }
    res.json({ status:'success', data: {
      ...dev, bridgeOnline, deviceStatus,
      lastAttendanceSync   : syncState?.lastAttendanceSync    || null,
      lastUserSync         : syncState?.lastUserSync          || null,
      totalAttendanceSynced: syncState?.totalAttendanceSynced || 0,
      totalUsersSynced     : syncState?.totalUsersSynced      || 0,
      hw: hwInfo,
    }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE TIME GET ───────────────────────────────────────────────────────────
router.get('/orgs/:orgId/devices/:deviceId/time', requireAuth, STAFF, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.status(404).json({ error: 'No bridge on this org' });
    if (!_queueTunnel)  return res.status(503).json({ error: 'Tunnel not available' });
    const deviceTime = await _queueTunnel(org.bridgeId, req.params.deviceId, 'getTime');
    res.json({ status:'success', data: { deviceTime, serverTime: new Date().toISOString() } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE TIME SET ───────────────────────────────────────────────────────────
router.put('/orgs/:orgId/devices/:deviceId/time', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.status(404).json({ error: 'No bridge on this org' });
    if (!_queueTunnel)  return res.status(503).json({ error: 'Tunnel not available' });
    const time = req.body.time ? new Date(req.body.time) : new Date();
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'setTime', [time]);
    res.json({ status:'success', message: `Device time set to ${time.toISOString()}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── VOICE TEST ────────────────────────────────────────────────────────────────
router.post('/orgs/:orgId/devices/:deviceId/voice-test', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.status(404).json({ error: 'No bridge on this org' });
    if (!_queueTunnel)  return res.status(503).json({ error: 'Tunnel not available' });
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'voiceTest');
    res.json({ status:'success', message: 'Voice test triggered' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CONNECT DEVICE ────────────────────────────────────────────────────────────
router.post('/orgs/:orgId/devices/:deviceId/connect', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.status(404).json({ error: 'No bridge on this org' });
    if (!_queueTunnel)  return res.status(503).json({ error: 'Tunnel not available' });
    const result = await _queueTunnel(org.bridgeId, req.params.deviceId, 'connect');
    res.json({ status:'success', data: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DISCONNECT DEVICE ─────────────────────────────────────────────────────────
router.post('/orgs/:orgId/devices/:deviceId/disconnect', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org?.bridgeId) return res.status(404).json({ error: 'No bridge on this org' });
    if (!_queueTunnel)  return res.status(503).json({ error: 'Tunnel not available' });
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'disconnect');
    res.json({ status:'success', message: 'Device disconnected' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADD DEVICE ────────────────────────────────────────────────────────────────
router.post('/orgs/:orgId/devices', requireAuth, ADMIN, async (req, res) => {
  try {
    const org = await Organization.findOne({ orgId: req.params.orgId }).lean();
    if (!org)          return res.status(404).json({ error: 'Organization not found' });
    if (!org.bridgeId) return res.status(400).json({ error: 'Organization has no bridge — create a bridge first' });
    const { name, ip, port, model, location } = req.body;
    if (!ip?.trim()) return res.status(400).json({ error: 'ip is required' });
    const { v4: uuidv4 } = require('uuid');
    const deviceId = `dev-${uuidv4().split('-')[0]}`;
    const dev = await _Device.create({
      bridgeId: org.bridgeId, deviceId,
      name:     name?.trim()     || 'Machine',
      ip:       ip.trim(),
      port:     port             || 4370,
      model:    model?.trim()    || null,
      location: location?.trim() || null,
      enabled:  true,
    });
    // Push updated device list to bridge if it's online
    if (_pushDeviceConfig) {
      const live = _bridgeMap?.get(org.bridgeId);
      if (live?.socket?.readyState === 1) await _pushDeviceConfig(org.bridgeId, live.socket).catch(() => {});
    }
    res.status(201).json({ status:'success', data: dev });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── EDIT DEVICE ───────────────────────────────────────────────────────────────
router.patch('/orgs/:orgId/devices/:deviceId', requireAuth, ADMIN, async (req, res) => {
  try {
    const allowed = ['name', 'ip', 'port', 'model', 'location'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid fields to update' });
    const dev = await _Device.findOneAndUpdate({ deviceId: req.params.deviceId }, { $set: update }, { new: true });
    if (!dev) return res.status(404).json({ error: 'Device not found' });
    // Push updated config to bridge if online (IP/port may have changed)
    if (_pushDeviceConfig && (update.ip || update.port)) {
      const org  = await Organization.findOne({ orgId: req.params.orgId }).lean();
      const live = org?.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
      if (live?.socket?.readyState === 1) await _pushDeviceConfig(org.bridgeId, live.socket).catch(() => {});
    }
    res.json({ status:'success', data: dev });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/orgs/:orgId/bridges/:bridgeId/restart', requireAuth, ADMIN, async (req, res) => {
  try {
    const live = _bridgeMap?.get(req.params.bridgeId);
    if (!live?.socket || live.socket.readyState !== 1) return res.status(503).json({ error: 'Bridge offline' });
    live.socket.send(JSON.stringify({ action: 'RESTART' }));
    res.json({ status:'success', message: 'Restart signal sent' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/orgs/:orgId/bridges/:bridgeId/sync-all', requireAuth, ADMIN, async (req, res) => {
  try {
    const live = _bridgeMap?.get(req.params.bridgeId);
    if (!live?.socket || live.socket.readyState !== 1) return res.status(503).json({ error: 'Bridge offline' });
    live.socket.send(JSON.stringify({ action: 'SYNC_ALL' }));
    res.json({ status:'success', message: 'Sync All triggered' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.init = init;
module.exports.router = router;
