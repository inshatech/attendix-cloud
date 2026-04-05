'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const Organization = require('../models/Organization');
const { SubscriptionPlan, UserSubscription } = require('../models/Subscription');
const { enforceSubscription, checkLimit } = require('../services/subscriptionService');
const { requireAuth, requireRole } = require('../auth/middleware');
const { generalApiLimiter, adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');
const { uploadBase64, deleteImage, publicIdFromUrl } = require('../services/uploadService');

const { buildReportData, sendDailyReport } = require('../services/sendAttendanceReport');

// Runtime refs injected from app.js after startup
let _Bridge, _Device, _MachineUser, _AttendanceLog, _bridgeMap, _socketSend, _queueTunnel;

function init(refs) {
  _Bridge        = refs.Bridge;
  _Device        = refs.Device;
  _MachineUser   = refs.MachineUser;
  _AttendanceLog = refs.AttendanceLog;
  _bridgeMap     = refs.bridgeMap;
  _socketSend    = refs.socketSend;
  _queueTunnel   = refs.queueTunnel;
}

// Helper: verify caller owns (or is admin of) the org
async function getOwnedOrg(orgId, userId, role) {
  const org = await Organization.findOne({ orgId });
  if (!org) return null;
  if (role !== 'admin' && org.ownerId !== userId) return null;
  return org;
}

// ── ADMIN: list all orgs ──────────────────────────────────────────────────────
router.get('/admin/organizations', requireAuth, requireRole('admin'), adminApiLimiter, async (req, res) => {
  try {
    const { ownerId, isActive, q, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (ownerId)             filter.ownerId  = ownerId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (q) { const re = new RegExp(q, 'i'); filter.$or = [{ name: re }, { orgId: re }, { city: re }]; }
    const [orgs, total] = await Promise.all([
      Organization.find(filter).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
      Organization.countDocuments(filter),
    ]);
    res.json({ status: 'success', total, page: +page, data: orgs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LIST MY ORGANIZATIONS ─────────────────────────────────────────────────────
router.get('/organizations', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const filter = req.authUser.role === 'admin' ? {} : { ownerId: req.authUser.userId };
    const orgs   = await Organization.find(filter).sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(orgs.map(async org => {
      const live        = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
      const deviceCount = org.bridgeId && _Device
        ? await _Device.countDocuments({ bridgeId: org.bridgeId })
        : 0;
      return { ...org, bridgeOnline: !!(live?.socket?.readyState === 1), deviceCount };
    }));
    res.json({ status: 'success', count: enriched.length, data: enriched });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CREATE ORGANIZATION ───────────────────────────────────────────────────────
router.post('/organizations', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    let subResult;
    if (req.authUser.role !== 'admin') {
      // Auto-start trial on first org creation if user has no subscription yet
      try {
        const { applyTrial } = require('../services/subscriptionService');
        await applyTrial(req.authUser.userId, 'first-org');
      } catch {}
      subResult = await enforceSubscription(req.authUser.userId).catch(e => { throw Object.assign(e, { status: e.status || 402 }); });
      await checkLimit(req.authUser.userId, 'bridges');
    }
    const { name, industry, address, city, state, country, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const org = await Organization.create({
      orgId:          `org-${uuidv4().split('-')[0]}`,
      ownerId:        req.authUser.userId,
      name, industry, address, city, state,
      country:        country || 'India',
      phone, email,
      bridgeId:       null,
      isActive:       true,
      subscriptionId: subResult?.sub?.subscriptionId || null,
    });
    res.status(201).json({ status: 'success', data: org });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── GET SINGLE ORGANIZATION ───────────────────────────────────────────────────
router.get('/organizations/:orgId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const live       = org.bridgeId ? _bridgeMap?.get(org.bridgeId) : null;
    const devices    = org.bridgeId && _Device ? await _Device.find({ bridgeId: org.bridgeId }).lean() : [];
    const bridgeDoc  = org.bridgeId && _Bridge ? await _Bridge.findOne({ bridgeId: org.bridgeId }).lean() : null;
    const devStatuses = live ? Object.fromEntries(live.deviceStatuses) : {};

    res.json({
      status: 'success',
      data: {
        ...org.toObject(),
        bridge:  bridgeDoc ? { ...bridgeDoc, online: !!live, deviceStatuses: devStatuses } : null,
        devices: devices.map(d => ({
          ...d,
          online:  live ? live.deviceStatuses.get(d.deviceId) === 'online' : false,
          enabled: d.enabled !== false,
        })),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UPDATE ORGANIZATION ───────────────────────────────────────────────────────
router.patch('/organizations/:orgId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const allowed = ['name','industry','address','city','state','country','phone','email','logoUrl','punchNotify','reportSchedule'];
    const update  = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    const updated = await Organization.findOneAndUpdate({ orgId: req.params.orgId }, { $set: update }, { new: true });
    res.json({ status: 'success', data: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE ORGANIZATION ───────────────────────────────────────────────────────
router.delete('/organizations/:orgId', requireAuth, strictAdminLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.bridgeId && _bridgeMap) {
      const live = _bridgeMap.get(org.bridgeId);
      if (live?.socket) try { live.socket.terminate(); } catch {}
      _bridgeMap.delete(org.bridgeId);
    }
    await Organization.deleteOne({ orgId: req.params.orgId });
    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ORG LOGO UPLOAD ───────────────────────────────────────────────────────────
// POST /organizations/:orgId/logo
// Body: { image: "data:image/jpeg;base64,..." }
router.post('/organizations/:orgId/logo', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64 data URI) is required' });
    if (!image.startsWith('data:image/'))
      return res.status(400).json({ error: 'Invalid image format. Send a base64 data URI.' });

    // Delete old logo
    if (org.logoUrl) {
      const pid = publicIdFromUrl(org.logoUrl);
      if (pid) await deleteImage(pid).catch(() => {});
    }

    // Upload 400×200 padded WebP
    const result = await uploadBase64(image, 'logo', `org_${req.params.orgId}`);
    await Organization.updateOne({ orgId: req.params.orgId }, { $set: { logoUrl: result.url } });

    res.json({
      status:     'success',
      message:    'Logo updated',
      logoUrl:    result.url,
      size:       `${Math.round(result.bytes / 1024)}KB`,
      dimensions: `${result.width}×${result.height}`,
    });
  } catch (e) { console.error('[logo]', e.message); res.status(500).json({ error: e.message }); }
});

// ── ORG LOGO DELETE ───────────────────────────────────────────────────────────
router.delete('/organizations/:orgId/logo', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.logoUrl) {
      const pid = publicIdFromUrl(org.logoUrl);
      if (pid) await deleteImage(pid).catch(() => {});
    }
    await Organization.updateOne({ orgId: req.params.orgId }, { $set: { logoUrl: null } });
    res.json({ status: 'success', message: 'Logo removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONNECT BRIDGE ────────────────────────────────────────────────────────────
router.post('/organizations/:orgId/bridge/connect', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.isActive) return res.status(403).json({ error: 'Organization is suspended' });
    if (org.bridgeId) return res.status(409).json({ error: 'Organization already has a bridge. Disconnect first.' });
    const { bridgeId } = req.body;
    if (!bridgeId) return res.status(400).json({ error: 'bridgeId is required' });
    if (!_Bridge) return res.status(503).json({ error: 'Bridge service unavailable' });
    const bridgeDoc = await _Bridge.findOne({ bridgeId }).lean();
    if (!bridgeDoc) return res.status(404).json({ error: `Bridge '${bridgeId}' not found` });
    const alreadyUsed = await Organization.findOne({ bridgeId, orgId: { $ne: org.orgId } });
    if (alreadyUsed) return res.status(409).json({ error: `Bridge '${bridgeId}' is already linked to another organization` });
    await Organization.updateOne({ orgId: org.orgId }, { $set: { bridgeId, bridgeConnectedAt: new Date() } });
    const live = _bridgeMap?.get(bridgeId);
    res.json({ status: 'success', message: `Bridge '${bridgeId}' connected`, data: { bridgeId, online: !!live, bridgeName: bridgeDoc.name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CREATE NEW BRIDGE ─────────────────────────────────────────────────────────
router.post('/organizations/:orgId/bridge/create', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.isActive) return res.status(403).json({ error: 'Organization is suspended' });
    if (org.bridgeId) return res.status(409).json({ error: 'Organization already has a bridge. Disconnect first.' });
    if (!_Bridge) return res.status(503).json({ error: 'Bridge service unavailable' });
    const newBridgeId = `br-${uuidv4().split('-')[0]}`;
    const bridgeDoc   = await _Bridge.create({ bridgeId: newBridgeId, name: req.body.name || `${org.name} Bridge`, status: 'offline' });
    await Organization.updateOne({ orgId: org.orgId }, { $set: { bridgeId: newBridgeId, bridgeConnectedAt: new Date() } });
    res.status(201).json({
      status: 'success',
      message: `New bridge created and connected to '${org.name}'`,
      data: { bridgeId: newBridgeId, bridgeName: bridgeDoc.name, note: 'Configure this bridgeId in your bridge.js client' },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DISCONNECT BRIDGE ─────────────────────────────────────────────────────────
router.delete('/organizations/:orgId/bridge/disconnect', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.bridgeId) return res.status(400).json({ error: 'No bridge connected' });
    await Organization.updateOne({ orgId: org.orgId }, { $set: { bridgeId: null, bridgeConnectedAt: null } });
    res.json({ status: 'success', message: 'Bridge disconnected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  DEVICE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// ── LIST DEVICES ──────────────────────────────────────────────────────────────
router.get('/organizations/:orgId/devices', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.bridgeId) return res.json({ status: 'success', data: [], message: 'No bridge connected' });
    const devices = _Device ? await _Device.find({ bridgeId: org.bridgeId }).lean() : [];
    const live    = _bridgeMap?.get(org.bridgeId);
    // Ask bridge to report fresh device statuses (non-blocking — response arrives via SSE)
    if (live?.socket?.readyState === 1) {
      try { live.socket.send(JSON.stringify({ type: 'REQUEST_STATUS' })); } catch {}
    }
    res.json({
      status: 'success',
      data: devices.map(d => ({
        ...d,
        online:  live ? live.deviceStatuses.get(d.deviceId) === 'online' : false,
        enabled: d.enabled !== false,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADD DEVICE ────────────────────────────────────────────────────────────────
router.post('/organizations/:orgId/devices', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.isActive) return res.status(403).json({ error: 'Organization is suspended' });
    if (!org.bridgeId) return res.status(400).json({ error: 'Connect a bridge to this organization first' });

    if (req.authUser.role !== 'admin') await checkLimit(req.authUser.userId, 'devices');

    const { ip, port = 4370, name = 'Biometric Machine', model = '', location = '' } = req.body;
    if (!ip) return res.status(400).json({ error: 'ip is required' });
    if (!_Device) return res.status(503).json({ error: 'Device service unavailable' });

    const deviceId = `dev-${uuidv4().split('-')[0]}`;
    const device   = await _Device.create({ bridgeId: org.bridgeId, deviceId, name, ip, port: Number(port) || 4370, enabled: true, model: model || null, location: location || null });

    // Push config to bridge if online
    const live = _bridgeMap?.get(org.bridgeId);
    if (live?.socket?.readyState === 1 && _socketSend) {
      _socketSend(live.socket, { type: 'DEVICE_CONFIG_PUSH', device: [{ deviceId, ip: device.ip, port: device.port, name: device.name, enabled: true }] });
      if (live.deviceEnabled instanceof Map) live.deviceEnabled.set(deviceId, true);
    }
    res.status(201).json({ status: 'success', data: device });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── EDIT DEVICE ───────────────────────────────────────────────────────────────
router.patch('/organizations/:orgId/devices/:deviceId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!_Device) return res.status(503).json({ error: 'Device service unavailable' });

    const device = await _Device.findOne({ deviceId: req.params.deviceId, bridgeId: org.bridgeId });
    if (!device) return res.status(404).json({ error: 'Device not found under this organization' });

    const allowed = ['name', 'ip', 'port', 'model', 'location'];
    const update  = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.port) update.port = Number(update.port);
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    const updated = await _Device.findOneAndUpdate({ deviceId: req.params.deviceId }, { $set: update }, { new: true });

    // Push updated config to bridge
    const live = _bridgeMap?.get(org.bridgeId);
    if (live?.socket?.readyState === 1 && _socketSend) {
      _socketSend(live.socket, { type: 'DEVICE_CONFIG_PUSH', device: [{ deviceId: updated.deviceId, ip: updated.ip, port: updated.port, name: updated.name, enabled: updated.enabled !== false }] });
    }
    res.json({ status: 'success', data: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ENABLE / DISABLE DEVICE ───────────────────────────────────────────────────
router.patch('/organizations/:orgId/devices/:deviceId/enabled', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const { enabled, reason } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: '"enabled" must be true or false' });

    if (!_Device) return res.status(503).json({ error: 'Device service unavailable' });
    const device = await _Device.findOne({ deviceId: req.params.deviceId, bridgeId: org.bridgeId });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const upd = enabled
      ? { enabled: true, disabledAt: null, disabledReason: null }
      : { enabled: false, disabledAt: new Date(), disabledReason: reason || null };

    await _Device.updateOne({ deviceId: req.params.deviceId }, { $set: upd });

    const live = _bridgeMap?.get(org.bridgeId);
    if (live?.socket?.readyState === 1 && _socketSend) {
      if (enabled) {
        _socketSend(live.socket, { type: 'DEVICE_ENABLE', deviceId: device.deviceId, device: { deviceId: device.deviceId, ip: device.ip, port: device.port, name: device.name, enabled: true } });
      } else {
        _socketSend(live.socket, { type: 'DEVICE_DISABLE', deviceId: device.deviceId, reason: reason || 'Disabled by organization owner' });
      }
      if (live.deviceEnabled instanceof Map) live.deviceEnabled.set(device.deviceId, enabled);
    }
    res.json({ status: 'success', message: `Device ${enabled ? 'enabled' : 'disabled'}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE DEVICE ─────────────────────────────────────────────────────────────
router.delete('/organizations/:orgId/devices/:deviceId', requireAuth, strictAdminLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!_Device) return res.status(503).json({ error: 'Device service unavailable' });

    const device = await _Device.findOneAndDelete({ deviceId: req.params.deviceId, bridgeId: org.bridgeId });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const live = _bridgeMap?.get(org.bridgeId);
    if (live) {
      live.deviceStatuses.delete(device.deviceId);
      if (live.deviceEnabled instanceof Map) live.deviceEnabled.delete(device.deviceId);
      if (live.socket?.readyState === 1 && _socketSend) {
        _socketSend(live.socket, { action: 'DISCONNECT_DEVICE', deviceId: device.deviceId });
      }
    }
    // Clean up device data
    const mongoose = require('mongoose');
    const AttendanceLog = mongoose.model('AttendanceLog');
    const MachineUser   = mongoose.model('MachineUser');
    const SyncState     = mongoose.model('SyncState');
    await Promise.all([
      _MachineUser && _MachineUser.deleteMany({ bridgeId: org.bridgeId, deviceId: device.deviceId }),
      AttendanceLog.deleteMany({ bridgeId: org.bridgeId, deviceId: device.deviceId }),
      SyncState.deleteMany({ bridgeId: org.bridgeId, deviceId: device.deviceId }),
    ].filter(Boolean));

    res.json({ status: 'success' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE INFO (from machine via bridge tunnel) ──────────────────────────────
router.get('/organizations/:orgId/devices/:deviceId/info', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    const { bridgeId } = org;
    const { deviceId } = req.params;
    const [info, name, version, osInfo, platform, mac] = await Promise.all([
      _queueTunnel(bridgeId, deviceId, 'getInfo'),
      _queueTunnel(bridgeId, deviceId, 'getDeviceName'),
      _queueTunnel(bridgeId, deviceId, 'getDeviceVersion'),
      _queueTunnel(bridgeId, deviceId, 'getOS').catch(() => null),
      _queueTunnel(bridgeId, deviceId, 'getPlatform').catch(() => null),
      _queueTunnel(bridgeId, deviceId, 'getMacAddress').catch(() => null),
    ]);
    res.json({ status: 'success', data: { name, version, os: osInfo, platform, mac, stats: info } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE TIME GET ───────────────────────────────────────────────────────────
router.get('/organizations/:orgId/devices/:deviceId/time', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    const deviceTime = await _queueTunnel(org.bridgeId, req.params.deviceId, 'getTime');
    res.json({ status: 'success', data: { deviceTime, serverTime: new Date().toISOString() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE TIME SET ───────────────────────────────────────────────────────────
router.put('/organizations/:orgId/devices/:deviceId/time', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    const time = req.body.time ? new Date(req.body.time) : new Date();
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'setTime', [time]);
    res.json({ status: 'success', message: `Device time set to ${time.toISOString()}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VOICE TEST ────────────────────────────────────────────────────────────────
router.post('/organizations/:orgId/devices/:deviceId/voice-test', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'voiceTest');
    res.json({ status: 'success', message: 'Voice test triggered' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONNECT DEVICE ────────────────────────────────────────────────────────────
router.post('/organizations/:orgId/devices/:deviceId/connect', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    const result = await _queueTunnel(org.bridgeId, req.params.deviceId, 'connect');
    res.json({ status: 'success', data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DISCONNECT DEVICE ─────────────────────────────────────────────────────────
router.post('/organizations/:orgId/devices/:deviceId/disconnect', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'disconnect');
    res.json({ status: 'success', message: 'Device disconnected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DEVICE STATUS ─────────────────────────────────────────────────────────────
router.get('/organizations/:orgId/devices/:deviceId/status', requireAuth, generalApiLimiter, (req, res) => {
  try {
    const org  = req.params.orgId; // auth checked via middleware, orgId is trusted here
    const live = _bridgeMap ? Array.from(_bridgeMap.values()).find(b => b.deviceStatuses?.get(req.params.deviceId)) : null;
    const online = live ? live.deviceStatuses.get(req.params.deviceId) === 'online' : false;
    res.json({ status: 'success', data: { deviceId: req.params.deviceId, online } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TRIGGER SYNC ──────────────────────────────────────────────────────────────
router.post('/organizations/:orgId/devices/:deviceId/sync', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    const live = _bridgeMap?.get(org.bridgeId);
    if (!live?.socket || live.socket.readyState !== 1) return res.status(503).json({ error: 'Bridge is offline' });
    _socketSend(live.socket, { type: 'TRIGGER_SYNC', deviceId: req.params.deviceId, reqId: uuidv4() });
    res.json({ status: 'success', message: 'Sync triggered' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ATTENDANCE LOGS ───────────────────────────────────────────────────────────
router.get('/organizations/:orgId/devices/:deviceId/attendance', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    const { startDate, endDate, userId, limit = 500 } = req.query;
    const mongoose = require('mongoose');
    const AttendanceLog = mongoose.model('AttendanceLog');
    const filter = { bridgeId: org.bridgeId, deviceId: req.params.deviceId };
    if (userId)    filter.userId = String(userId);
    if (startDate) filter.timestamp = { $gte: new Date(`${startDate}T00:00:00`), $lte: new Date(`${endDate || startDate}T23:59:59.999`) };
    const logs = await AttendanceLog.find(filter).sort({ timestamp: -1 }).limit(+limit).lean();
    res.json({ status: 'success', count: logs.length, data: logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MACHINE USERS (enrolled on device) ───────────────────────────────────────
router.get('/organizations/:orgId/devices/:deviceId/users', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    const mongoose    = require('mongoose');
    const MachineUser = mongoose.model('MachineUser');

    // Also enrich with employee name if linked
    const Employee = mongoose.model('Employee');
    const { uidFrom, uidTo } = req.query;
    const muFilter = { bridgeId: org.bridgeId, deviceId: req.params.deviceId };
    if (uidFrom !== undefined) muFilter.uid = { ...muFilter.uid, $gte: Number(uidFrom) };
    if (uidTo   !== undefined) muFilter.uid = { ...muFilter.uid, $lte: Number(uidTo) };
    const users = await MachineUser.find(muFilter).lean();

    const linked = users.filter(u => u.userId && String(u.userId).startsWith('emp-')).length;

    // Attach employee info for linked users
    const enriched = await Promise.all(users.map(async u => {
      if (!u.userId) return { ...u, employee: null };
      const emp = await Employee.findOne({ employeeId: u.userId })
        .select('firstName lastName displayName employeeCode photoUrl').lean();
      return { ...u, employee: emp || null };
    }));

    res.json({ status: 'success', total: users.length, linked, data: enriched });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FACTORY RESET (dangerous) ─────────────────────────────────────────────────
router.delete('/organizations/:orgId/devices/:deviceId/factory-reset', requireAuth, strictAdminLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org?.bridgeId) return res.status(404).json({ error: 'Organization or bridge not found' });
    if (!_queueTunnel) return res.status(503).json({ error: 'Bridge tunnel not available' });
    await _queueTunnel(org.bridgeId, req.params.deviceId, 'clearData');
    const mongoose = require('mongoose');
    const AttendanceLog = mongoose.model('AttendanceLog');
    const MachineUser   = mongoose.model('MachineUser');
    await Promise.all([
      AttendanceLog.deleteMany({ bridgeId: org.bridgeId, deviceId: req.params.deviceId }),
      MachineUser.deleteMany({ bridgeId: org.bridgeId, deviceId: req.params.deviceId }),
    ]);
    res.json({ status: 'success', message: 'Device factory reset. All data cleared.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── BRIDGE CONFIG for setup page (reads from bridge_app plugin) ──────────────
router.get('/organizations/:orgId/bridge-config', requireAuth, async (req, res) => {
  try {
    const isStaff = ['admin','support'].includes(req.authUser.role)
    const query   = isStaff ? { orgId: req.params.orgId } : { orgId: req.params.orgId, ownerId: req.authUser.userId }
    const org = await Organization.findOne(query).lean()
    if (!org) return res.status(404).json({ error: 'Organization not found' })

    const { Plugin } = require('../models/Plugin')
    const appPlugin  = await Plugin.findOne({ name:'bridge_app' }).lean()
    const cfg        = appPlugin?.config || {}

    const protocol = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')
    const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8000'
    const wsProto  = protocol === 'https' ? 'wss' : 'ws'

    res.json({
      data: {
        bridgeId      : org.bridgeId    || null,
        wsUrl         : cfg.wsUrl       || `${wsProto}://${host}/bridge`,
        apiUrl        : cfg.apiUrl      || `${protocol}://${host}/api`,
        wsSecret      : cfg.wsSecret    || process.env.WS_SECRET || 'change-this-ws-secret-2026',
        downloadUrl   : cfg.downloadUrl || null,
        version       : cfg.version     || null,
        fileSizeMb    : cfg.fileSizeMb  || null,
        changelog     : cfg.changelog   || null,
        downloadCount : cfg.downloadCount || 0,
      }
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ── BRIDGE APP DOWNLOAD — tracks download count ───────────────────────────────
router.post('/bridge-app/download', requireAuth, async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin')
    const p = await Plugin.findOneAndUpdate(
      { name:'bridge_app' },
      { $inc: { 'config.downloadCount': 1 } },
      { new: true }
    ).lean()
    if (!p?.config?.downloadUrl) return res.status(404).json({ error: 'Download not configured. Contact admin.' })
    res.json({ status:'success', downloadUrl: p.config.downloadUrl, version: p.config.version })
  } catch(e) { res.status(500).json({ error: e.message }) }
})


// ── MACHINE USERS — all across user's orgs ───────────────────────────────────
router.get('/machine-users/all', requireAuth, async (req, res) => {
  try {
    const orgs = await Organization.find({ ownerId: req.authUser.userId }).lean();
    if (!orgs.length || !_MachineUser) return res.json({ data: [] });

    const bridgeIds = orgs.map(o => o.bridgeId).filter(Boolean);
    const mus = await _MachineUser.find({ bridgeId: { $in: bridgeIds } })
      .select('uid name bridgeId deviceId userId cardno role syncedAt').lean();

    // Build maps for org and device name lookup
    const orgMap    = Object.fromEntries(orgs.map(o => [o.bridgeId, o]));
    const deviceIds = [...new Set(mus.map(m => m.deviceId))];
    const devices   = deviceIds.length && _Device
      ? await _Device.find({ deviceId: { $in: deviceIds } }).select('deviceId name model location').lean()
      : [];
    const devMap = Object.fromEntries(devices.map(d => [d.deviceId, d]));

    const enriched = mus.map(m => ({
      ...m,
      orgId:          orgMap[m.bridgeId]?.orgId   || null,
      bridgeName:     orgMap[m.bridgeId]?.name    || m.bridgeId,
      deviceName:     devMap[m.deviceId]?.name    || m.deviceId,
      deviceModel:    devMap[m.deviceId]?.model   || null,
      deviceLocation: devMap[m.deviceId]?.location|| null,
    }));

    res.json({ data: enriched });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── MACHINE USERS for org (used in employee linking) ─────────────────────────
router.get('/organizations/:orgId/machine-users', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const isStaff = ['admin','support'].includes(req.authUser.role);
    const query   = isStaff
      ? { orgId: req.params.orgId }
      : { orgId: req.params.orgId, ownerId: req.authUser.userId };
    const org = await Organization.findOne(query).lean();
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.bridgeId || !_MachineUser) return res.json({ status:'success', total:0, linked:0, data: [] });
    const mus = await _MachineUser.find({ bridgeId: org.bridgeId })
      .select('uid name bridgeId deviceId userId role cardno syncedAt').lean();
    const linked = mus.filter(u => u.userId && String(u.userId).startsWith('emp-')).length;
    res.json({ status: 'success', total: mus.length, linked, data: mus });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── REPORT SCHEDULE ───────────────────────────────────────────────────────────

// GET /organizations/:orgId/report-schedule
router.get('/organizations/:orgId/report-schedule', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json({ status: 'success', data: org.reportSchedule || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /organizations/:orgId/report-schedule
router.put('/organizations/:orgId/report-schedule', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { enabled, sendTime, timezone, recipients } = req.body;

    // Validate sendTime format HH:MM
    if (sendTime && !/^\d{2}:\d{2}$/.test(sendTime)) {
      return res.status(400).json({ error: 'sendTime must be HH:MM format (e.g. 20:00)' });
    }
    // Validate recipients
    if (recipients && !Array.isArray(recipients)) {
      return res.status(400).json({ error: 'recipients must be an array' });
    }
    const cleanRecipients = (recipients || []).map(r => ({
      name:   String(r.name  || '').trim(),
      email:  String(r.email || '').trim().toLowerCase(),
      mobile: String(r.mobile|| '').trim(),
    })).filter(r => r.email || r.mobile);

    const update = {};
    if (typeof enabled === 'boolean')  update['reportSchedule.enabled']    = enabled;
    if (sendTime)                      update['reportSchedule.sendTime']    = sendTime;
    if (timezone)                      update['reportSchedule.timezone']    = timezone;
    if (recipients !== undefined)      update['reportSchedule.recipients']  = cleanRecipients;

    const updated = await Organization.findOneAndUpdate(
      { orgId: req.params.orgId },
      { $set: update },
      { new: true }
    );
    res.json({ status: 'success', data: updated.reportSchedule });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /organizations/:orgId/reports/send-now
router.post('/organizations/:orgId/reports/send-now', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOwnedOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!org.bridgeId) return res.status(400).json({ error: 'No bridge connected' });

    const tz        = org.reportSchedule?.timezone || 'Asia/Kolkata';
    const recipients= org.reportSchedule?.recipients || [];
    if (!recipients.length) return res.status(400).json({ error: 'No recipients configured. Add at least one recipient first.' });

    // Determine date: use provided or today in org timezone
    const date = req.body.date || new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const result = await sendDailyReport(org.orgId, date, tz, recipients, {
      AttendanceLog: _AttendanceLog, MachineUser: _MachineUser,
    });

    res.json({ status: 'success', date, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.init = init;
module.exports.router = router;
