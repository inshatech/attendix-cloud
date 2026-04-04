'use strict';
require('dotenv').config();

const express   = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http      = require('http');
const mongoose  = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path      = require('path');

process.on('uncaughtException',  e => console.error('[CRITICAL] Uncaught:',   e.stack || e));
process.on('unhandledRejection', e => console.error('[CRITICAL] Rejection:',  e));

const app    = express();
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50mb' }));

// ── ENV ───────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT       || 8000;
const WS_SECRET  = process.env.WS_SECRET  || 'change-this-ws-secret-2026';
const MONGO_URI  = process.env.MONGO_URI  || 'mongodb://127.0.0.1:27017/attendance';
const MAX_PAYLOAD = 10 * 1024 * 1024;

// ── MONGODB ───────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 })
  .then(() => console.log('[server] MongoDB connected'))
  .catch(e  => console.error('[server] MongoDB connect failed:', e.message));

mongoose.connection.on('disconnected', () => console.warn('[server] MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('[server]  MongoDB reconnected'));
mongoose.connection.on('error',        e  => console.error('[server] MongoDB error:', e.message));

// ── ORIGINAL SCHEMAS (Bridge, Device, AttendanceLog, MachineUser, SyncState, UserProfile) ──
const Bridge = mongoose.model('Bridge', new mongoose.Schema({
  bridgeId: { type: String, unique: true, required: true, index: true },
  name:     { type: String, default: 'Branch' },
  status:   { type: String, default: 'offline', enum: ['online','offline'] },
  lastSeen: { type: Date },
}, { timestamps: true }));

const Device = mongoose.model('Device', new mongoose.Schema({
  bridgeId:       { type: String,  required: true, index: true },
  deviceId:       { type: String,  unique: true, required: true, index: true },
  name:           { type: String,  default: 'Machine' },
  ip:             { type: String,  required: true },
  port:           { type: Number,  default: 4370 },
  enabled:        { type: Boolean, default: true, index: true },
  disabledAt:     { type: Date,    default: null },
  disabledReason: { type: String,  default: null },
}, { timestamps: true }));

const AttendanceLog = mongoose.model('AttendanceLog', new mongoose.Schema({
  bridgeId:  { type: String, required: true },
  deviceId:  { type: String, required: true },
  userId:    { type: String, required: true },
  timestamp: { type: Date,   required: true },
  punchType: { type: Number, default: null },
  rawJson:   { type: Object, default: null },
  syncedAt:  { type: Date,   default: Date.now },
}, { strict: false, timestamps: true }));

AttendanceLog.collection.createIndex({ bridgeId:1, deviceId:1, userId:1, timestamp:1 }, { unique: true, background: true }).catch(()=>{});
AttendanceLog.collection.createIndex({ bridgeId:1, deviceId:1, timestamp:-1 },         { background: true }).catch(()=>{});

const MachineUser = mongoose.model('MachineUser', new mongoose.Schema({
  bridgeId: { type: String, required: true },
  deviceId: { type: String, required: true },
  uid:      { type: Number, required: true },
  userId:   { type: String, default: null },
  name:     { type: String, default: null },
  role:     { type: Number, default: null },
  cardno:   { type: String, default: null },
  password: { type: String, default: null },
  rawJson:  { type: Object, default: null },
  syncedAt: { type: Date,   default: Date.now },
}, { strict: false, timestamps: true }));
MachineUser.collection.createIndex({ bridgeId:1, deviceId:1, uid:1 }, { unique: true, background: true }).catch(()=>{});

const SyncState = mongoose.model('SyncState', new mongoose.Schema({
  bridgeId:              { type: String, required: true },
  deviceId:              { type: String, required: true },
  lastAttendanceSync:    { type: Date,   default: null },
  lastUserSync:          { type: Date,   default: null },
  totalAttendanceSynced: { type: Number, default: 0 },
  totalUsersSynced:      { type: Number, default: 0 },
}, { timestamps: true }));
SyncState.collection.createIndex({ bridgeId:1, deviceId:1 }, { unique: true, background: true }).catch(()=>{});

const UserProfile = mongoose.model('UserProfile', new mongoose.Schema({
  userId:         { type: String, required: true, unique: true, index: true },
  name:           { type: String, default: null },
  email:          { type: String, default: null },
  phone:          { type: String, default: null },
  employeeCode:   { type: String, default: null, index: true },
  department:     { type: String, default: null },
  designation:    { type: String, default: null },
  joiningDate:    { type: Date,   default: null },
  leavingDate:    { type: Date,   default: null },
  status:         { type: String, default: 'active', enum: ['active','inactive','terminated'] },
  salary:         { type: Number, default: null },
  salaryType:     { type: String, default: null, enum: [null,'monthly','daily','hourly'] },
  bankAccount:    { type: String, default: null },
  bankName:       { type: String, default: null },
  taxId:          { type: String, default: null },
  shiftId:        { type: String, default: null, index: true },
  weeklyOffDays:  { type: [Number], default: [] },
  overtimeAllowed:{ type: Boolean, default: false },
  meta:           { type: Object, default: {} },
}, { strict: false, timestamps: true }));

// ── PLUGIN REGISTRY ───────────────────────────────────────────────────────────
const { seedPlugins } = require('./models/Plugin');
mongoose.connection.once('open', () => {
  seedPlugins();
  // Background: backfill null punchType from rawJson (for historical records)
  setImmediate(async () => {
    try {
      let fixed = 0;
      const cursor = AttendanceLog.find({ punchType: null, rawJson: { $type: 'object' } })
        .select('_id rawJson').lean().cursor();
      for await (const d of cursor) {
        const raw = d.rawJson || {};
        const pt  = normalisePunchType(raw.punch_type ?? raw.punchType ?? raw.state_code);
        if (pt != null) {
          await AttendanceLog.updateOne({ _id: d._id }, { $set: { punchType: pt } });
          fixed++;
        }
      }
      if (fixed > 0) console.log(`[migration] backfilled punchType for ${fixed} attendance records`);
    } catch(e) { console.error('[migration] punchType backfill failed:', e.message); }
  });
});

// ── SUBSCRIPTION & ORGANIZATION MODULES ──────────────────────────────────────
require('./models/Subscription');   // register schemas
require('./models/Organization');   // register schemas
const subService = require('./services/subscriptionService');
const orgRouter     = require('./routes/organizations');
const initOrgRoutes = orgRouter.init;
const subRouter  = require('./routes/subscriptions');

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
const { requireAuth, requireRole, requireBridgeAccess } = require('./auth/middleware');
const { strictAdminLimiter, generalApiLimiter, adminApiLimiter } = require('./auth/rateLimits');

// ── LOAD ALL ROUTE FILES ─────────────────────────────────────────────────────
var routeAuth        = require('./routes/auth');
var routePlugins     = require('./routes/plugins');
var routeAdminOrgs   = require('./routes/adminOrgs');
var routeAdminUsers  = require('./routes/adminUsers');
var routeUserSelf    = require('./routes/userSelf');
var routeTickets     = require('./routes/tickets');
var routeHolidays    = require('./routes/holidays');
var routeCoupons     = require('./routes/coupons');
var routeEmployees   = require('./routes/employees');
var routeDepartments = require('./routes/departments');
var routeAttendance  = require('./routes/attendance');

// ── ABOUT PAGE (public — serves About Us content to frontend) ────────────────
app.get('/api/about', async (req, res) => {
  try {
    const { Plugin } = require('./models/Plugin');
    const p = await Plugin.findOne({ name: 'about_us' }).lean();
    res.json({ status: 'success', data: p?.config || {}, enabled: p?.enabled ?? true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TAWK CONFIG (public — serves Tawk.to credentials to frontend) ─────────────
app.get('/tawk-config', async (req, res) => {
  try {
    const { Plugin } = require('./models/Plugin');
    const p = await Plugin.findOne({ name: 'tawk', enabled: true }).lean();
    if (!p || !p.config?.propertyId || !p.config?.widgetId)
      return res.status(503).json({ error: 'Tawk.to not configured' });
    res.json({ propertyId: p.config.propertyId, widgetId: p.config.widgetId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── APPLY GENERAL RATE LIMIT TO ALL /api ROUTES ───────────────────────────────
app.use('/api', generalApiLimiter);

// ── MOUNT ALL ROUTES ──────────────────────────────────────────────────────────
app.use('/auth',          routeAuth);
app.use('/admin/plugins', routePlugins);
app.use('/admin',         routeAdminOrgs);
app.use('/admin',         routeAdminUsers);
app.use('/user',          routeUserSelf);
app.use('/',              subRouter);
app.use('/',              routeDepartments);
app.use('/',              orgRouter);
app.use('/',              routeTickets);
app.use('/',              routeHolidays);
app.use('/',              routeCoupons);
app.use('/',              routeEmployees);
app.use('/',              routeAttendance);

// ── STATIC (React SPA build) ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../dist')));

// ── RUNTIME STATE ─────────────────────────────────────────────────────────────
const bridgeMap       = new Map();
const pendingRequests = new Map();
let   sseClients      = [];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function socketSend(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try { socket.send(JSON.stringify(payload)); } catch (e) { console.error('[server] socketSend:', e.message); }
}
function pushSSE(payload) {
  sseClients = sseClients.filter(c => {
    if (c.bridgeId !== payload.bridgeId) return true;
    if (c.deviceId && c.deviceId !== payload.deviceId) return true;
    try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); return true; } catch { return false; }
  });
}
function parseRawJson(v) {
  for (let i = 0; i < 3; i++) {
    if (v == null || typeof v === 'object') return v || null;
    try { v = JSON.parse(v); } catch { return null; }
  }
  return typeof v === 'object' ? v : null;
}
const PUNCH_LABELS = { 'check-in':0,'checkin':0,'in':0,'check-out':1,'checkout':1,'out':1,'break-out':2,'breakout':2,'break-in':3,'breakin':3,'ot-in':4,'otin':4,'ot-out':5,'otout':5 };
function normalisePunchType(v) {
  if (v == null) return null;
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string') {
    const m = PUNCH_LABELS[v.toLowerCase().replace(/\s+/g, '-')];
    if (m !== undefined) return m;
    const n = Number(v); if (!isNaN(n)) return n;
  }
  return null;
}

// ── TUNNEL ────────────────────────────────────────────────────────────────────
function tunnel(bridgeId, deviceId, method, params = []) {
  return new Promise((resolve, reject) => {
    const bridge = bridgeMap.get(bridgeId);
    if (!bridge?.socket || bridge.socket.readyState !== WebSocket.OPEN)
      return reject(new Error(`Bridge '${bridgeId}' is offline`));
    const reqId  = uuidv4();
    const handle = setTimeout(() => { pendingRequests.delete(reqId); reject(new Error(`Timeout: ${method}`)); }, 120000);
    pendingRequests.set(reqId, {
      bridgeId,
      resolve: v => { clearTimeout(handle); resolve(v); },
      reject:  e => { clearTimeout(handle); reject(e instanceof Error ? e : new Error(String(e))); },
      buffer: [], total: null,
    });
    socketSend(bridge.socket, { action: 'EXECUTE', deviceId, method, params, reqId });
  });
}
function queueTunnel(bridgeId, deviceId, method, params = []) {
  const bridge = bridgeMap.get(bridgeId);
  if (!bridge) return Promise.reject(new Error(`Bridge '${bridgeId}' not connected`));
  let res, rej;
  const p = new Promise((r, e) => { res = r; rej = e; });
  bridge.apiQueue = (bridge.apiQueue || Promise.resolve()).then(async () => {
    try { const r = await tunnel(bridgeId, deviceId, method, params); await new Promise(ok => setTimeout(ok, 150)); res(r); }
    catch (e) { rej(e); }
  }).catch(()=>{});
  return p;
}

// ── BULK UPSERTS ──────────────────────────────────────────────────────────────
async function upsertAttendance(rows) {
  if (!rows?.length) return { upserted: 0, modified: 0 };
  let u = 0, m = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const ops = rows.slice(i, i+500).map(r => ({
      updateOne: {
        filter: { bridgeId: r.bridgeId, deviceId: r.deviceId, userId: String(r.userId||''), timestamp: new Date(r.timestamp) },
        update: { $set: { bridgeId:r.bridgeId, deviceId:r.deviceId, userId:String(r.userId||''), timestamp:new Date(r.timestamp), punchType:normalisePunchType(r.punchType??r.punch_type??r.state_code), rawJson:parseRawJson(r.rawJson), syncedAt:new Date() } },
        upsert: true,
      },
    }));
    const res = await AttendanceLog.bulkWrite(ops, { ordered: false });
    u += res.upsertedCount; m += res.modifiedCount;
  }
  return { upserted: u, modified: m };
}
async function upsertUsers(rows) {
  if (!rows?.length) return { upserted: 0, modified: 0 };
  let u = 0, m = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const ops = rows.slice(i, i+500).map(r => ({
      updateOne: {
        filter: { bridgeId: r.bridgeId, deviceId: r.deviceId, uid: Number(r.uid) },
        update: { $set: { bridgeId:r.bridgeId, deviceId:r.deviceId, uid:Number(r.uid), userId:(r.userId!=null && r.userId!==0 && r.userId!=='' && r.userId!==false)?String(r.userId):null, name:r.name!=null?String(r.name):null, role:r.role!=null?Number(r.role):null, cardno:r.cardno!=null?String(r.cardno):null, password:r.password!=null?String(r.password):null, rawJson:parseRawJson(r.rawJson), syncedAt:new Date() } },
        upsert: true,
      },
    }));
    const res = await MachineUser.bulkWrite(ops, { ordered: false });
    u += res.upsertedCount; m += res.modifiedCount;
  }
  return { upserted: u, modified: m };
}

// ── PUSH DEVICE CONFIG ────────────────────────────────────────────────────────
async function pushDeviceConfig(bridgeId, socket) {
  try {
    const devs = await Device.find({ bridgeId }).lean();
    if (!devs.length) return;
    const payload = devs.map(d => ({ deviceId: d.deviceId, ip: d.ip, port: d.port||4370, name: d.name||'Machine', enabled: d.enabled!==false }));
    const bridge  = bridgeMap.get(bridgeId);
    if (bridge) {
      if (!(bridge.deviceEnabled instanceof Map)) bridge.deviceEnabled = new Map();
      for (const d of devs) bridge.deviceEnabled.set(d.deviceId, d.enabled !== false);
    }
    socketSend(socket, { type: 'DEVICE_CONFIG_PUSH', device: payload });
    // Ask bridge to immediately report current device connection statuses
    socketSend(socket, { type: 'REQUEST_STATUS' });
    console.log(`[server] Pushed ${payload.length} device(s) to bridge ${bridgeId}`);
  } catch (e) { console.error('[server] pushDeviceConfig:', e.message); }
}

// ── INJECT RUNTIME REFS INTO SUB-SERVICES ────────────────────────────────────
// Done here because Bridge/Device/bridgeMap/socketSend are defined above
subService.init({ Bridge, Device, bridgeMap, socketSend });
initOrgRoutes({ Bridge, Device, MachineUser, bridgeMap, socketSend, pushDeviceConfig, queueTunnel });
routeAdminOrgs.init({ Bridge, Device, MachineUser, AttendanceLog, bridgeMap });
routeDepartments.init({ Organization: require('./models/Organization') });
routeEmployees.init({ MachineUser, AttendanceLog, Organization: require('./models/Organization') });
routeAttendance.init({ AttendanceLog, Device, MachineUser, bridgeMap });

// ── SUBSCRIPTION EXPIRY CRON (runs every hour) ────────────────────────────────
setInterval(async () => {
  try {
    const n = await subService.expireOverdueSubscriptions();
    if (n > 0) console.log(`[cron] Expired ${n} subscription(s)`);
  } catch (e) { console.error('[cron] Expiry error:', e.message); }
}, 60 * 60 * 1000);
// Also run once on startup
setTimeout(() => subService.expireOverdueSubscriptions().catch(e => console.error('[cron] startup expiry:', e.message)), 10000);

// ── WEBSOCKET SERVER ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/bridge', maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

wss.on('connection', (socket, req) => {
  const url    = new URL(req.url, 'ws://localhost');
  const secret = url.searchParams.get('secret');
  if (secret !== WS_SECRET) { socket.close(4401, 'Unauthorized'); return; }

  let bridgeId = null, authorized = false;
  socket.setMaxListeners(0);
  const authTO = setTimeout(() => { if (!authorized) socket.terminate(); }, 60000);

  socket.on('message', (data, isBinary) => {
    let msg;
    try { msg = JSON.parse(isBinary ? data.toString('utf8') : data); } catch { return; }
    handleBridgeMessage(msg).catch(e => console.error('[server] ws msg error:', e.message));
  });

  async function handleBridgeMessage(msg) {
    if (msg.type === 'IDENTIFY') {
      clearTimeout(authTO);
      const rec = await Bridge.findOne({ bridgeId: msg.bridgeId }).catch(() => null);
      if (!rec) { socket.close(4403, 'Unknown bridge'); return; }
      const ex = bridgeMap.get(msg.bridgeId);
      if (ex && ex.socket !== socket) { try { ex.socket.terminate(); } catch {} }
      authorized = true; bridgeId = msg.bridgeId;
      bridgeMap.set(bridgeId, {
        socket, apiQueue: Promise.resolve(),
        deviceStatuses: (ex?.deviceStatuses instanceof Map) ? ex.deviceStatuses : new Map(),
        deviceEnabled:  (ex?.deviceEnabled  instanceof Map) ? ex.deviceEnabled  : new Map(),
      });
      await Bridge.findOneAndUpdate({ bridgeId }, { status: 'online', lastSeen: new Date() }).catch(()=>{});
      console.log(`[server] Bridge authorized: ${bridgeId}`);
      await pushDeviceConfig(bridgeId, socket);
      return;
    }
    if (!authorized || !bridgeId) return;
    if (msg.type === 'KEEPALIVE') return;

    if (msg.type === 'BRIDGE_READY') {
      const b = bridgeMap.get(bridgeId);
      if (b && Array.isArray(msg.devices)) {
        for (const d of msg.devices) {
          // Accept any truthy online indicator the bridge may send
          const isOnline = !!(d.online || d.connected || d.status === 'online' || d.status === 'connected');
          const status = isOnline ? 'online' : 'offline';
          b.deviceStatuses.set(d.deviceId, status);
          pushSSE({ type: 'DEVICE_STATUS', bridgeId, deviceId: d.deviceId, status });
        }
      }
      return;
    }
    if (msg.type === 'DEVICE_STATUS') {
      const b = bridgeMap.get(bridgeId);
      if (b) b.deviceStatuses.set(msg.deviceId, msg.status);
      pushSSE({ type:'DEVICE_STATUS', bridgeId, deviceId:msg.deviceId, status:msg.status, error:msg.error||null });
      return;
    }
    if (msg.type === 'REALTIME_PUNCH') {
      const log = msg.log || {};
      pushSSE({ type:'REALTIME_PUNCH', bridgeId, deviceId:msg.deviceId, log });
      const b = bridgeMap.get(bridgeId);
      if ((b?.deviceEnabled instanceof Map) ? b.deviceEnabled.get(msg.deviceId) === false : false) return;
      AttendanceLog.updateOne(
        { bridgeId, deviceId:msg.deviceId, userId:String(log.user_id||log.userId||''), timestamp:new Date(log.timestamp) },
        { $set:{ punchType:normalisePunchType(log.punch_type??log.punchType??log.state_code), rawJson:parseRawJson(log), syncedAt:new Date() } },
        { upsert:true }
      ).catch(()=>{});
      return;
    }
    if (msg.type === 'ATTENDANCE_SYNC') {
      const { reqId, deviceId, data } = msg;
      const b = bridgeMap.get(bridgeId);
      let enabled = (b?.deviceEnabled instanceof Map) ? b.deviceEnabled.get(deviceId) : undefined;
      if (enabled === undefined) {
        const d = await Device.findOne({ deviceId }).select('enabled').lean();
        enabled = d ? d.enabled !== false : true;
        if (b?.deviceEnabled instanceof Map) b.deviceEnabled.set(deviceId, enabled);
      }
      if (!enabled) { socketSend(socket, { type:'ATTENDANCE_SYNC_ACK', reqId, ok:false, disabled:true }); return; }
      if (!Array.isArray(data) || !data.length) { socketSend(socket, { type:'ATTENDANCE_SYNC_ACK', reqId, ok:true, count:0, upserted:0 }); return; }
      const rows = data.map(r => ({ ...r, bridgeId, deviceId }));
      try {
        const { upserted, modified } = await upsertAttendance(rows);
        SyncState.findOneAndUpdate({ bridgeId, deviceId }, { $set:{lastAttendanceSync:new Date()}, $inc:{totalAttendanceSynced:upserted} }, { upsert:true }).catch(()=>{});
        socketSend(socket, { type:'ATTENDANCE_SYNC_ACK', reqId, ok:true, count:rows.length, upserted, modified });
        console.log(`[server] [${bridgeId}/${deviceId}] Att: ${rows.length} rows, ${upserted} new`);
      } catch (e) { socketSend(socket, { type:'ATTENDANCE_SYNC_ACK', reqId, ok:false, error:e.message }); }
      return;
    }
    if (msg.type === 'USERS_SYNC') {
      const { reqId, deviceId, data } = msg;
      const b = bridgeMap.get(bridgeId);
      let enabled = (b?.deviceEnabled instanceof Map) ? b.deviceEnabled.get(deviceId) : undefined;
      if (enabled === undefined) {
        const d = await Device.findOne({ deviceId }).select('enabled').lean();
        enabled = d ? d.enabled !== false : true;
        if (b?.deviceEnabled instanceof Map) b.deviceEnabled.set(deviceId, enabled);
      }
      if (!enabled) { socketSend(socket, { type:'USERS_SYNC_ACK', reqId, ok:false, disabled:true }); return; }
      if (!Array.isArray(data) || !data.length) { socketSend(socket, { type:'USERS_SYNC_ACK', reqId, ok:true, count:0, upserted:0 }); return; }
      const rows = data.map(r => ({ ...r, bridgeId, deviceId }));
      try {
        const { upserted, modified } = await upsertUsers(rows);
        SyncState.findOneAndUpdate({ bridgeId, deviceId }, { $set:{lastUserSync:new Date()}, $inc:{totalUsersSynced:upserted} }, { upsert:true }).catch(()=>{});
        socketSend(socket, { type:'USERS_SYNC_ACK', reqId, ok:true, count:rows.length, upserted, modified });
      } catch (e) { socketSend(socket, { type:'USERS_SYNC_ACK', reqId, ok:false, error:e.message }); }
      return;
    }
    if (msg.type === 'CONFIG_ACK' || msg.type === 'PUSH_USERS_ACK') return;
    if (msg.type === 'DATA_CHUNK') {
      const st = msg.reqId && pendingRequests.get(msg.reqId);
      if (!st) return;
      if (Array.isArray(msg.data)) st.buffer.push(...msg.data);
      if (msg.total != null) st.total = msg.total;
      if (msg.isLast) { st.resolve(st.buffer); pendingRequests.delete(msg.reqId); }
      return;
    }
    if (msg.type === 'EXEC_RESULT') {
      const st = msg.reqId && pendingRequests.get(msg.reqId);
      if (!st) return;
      st.resolve(msg.result?.data !== undefined ? msg.result.data : msg.result);
      pendingRequests.delete(msg.reqId);
      return;
    }
    if (msg.type === 'ERROR') {
      const st = msg.reqId && pendingRequests.get(msg.reqId);
      if (!st) return;
      st.reject(new Error(msg.message || 'Bridge error'));
      pendingRequests.delete(msg.reqId);
      return;
    }
  }

  socket.on('error', e => { if (!['ECONNRESET','EPIPE'].includes(e.code)) console.error('[server] WS error:', e.message); });
  socket.on('close', async (code) => {
    clearTimeout(authTO);
    if (!bridgeId) return;
    const b = bridgeMap.get(bridgeId);
    if (b?.socket === socket) {
      for (const [id, st] of pendingRequests) { if (st.bridgeId === bridgeId) { st.reject(new Error('Bridge disconnected')); pendingRequests.delete(id); } }
      bridgeMap.delete(bridgeId);
    }
    console.log(`[server] Bridge disconnected: ${bridgeId} (code=${code})`);
    await Bridge.findOneAndUpdate({ bridgeId }, { status: 'offline' }).catch(()=>{});
  });
});

// ── REST HELPERS ──────────────────────────────────────────────────────────────
function requireBody(...keys) {
  return (req, res, next) => {
    for (const k of keys) if (req.body[k] == null || req.body[k] === '') return res.status(400).json({ error: `Missing: ${k}` });
    next();
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECURED REST API
// ══════════════════════════════════════════════════════════════════════════════

// ── BRIDGES ───────────────────────────────────────────────────────────────────
app.get('/api/admin/bridges',      requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    const bs = await Bridge.find().lean();
    res.json({ status:'success', data: bs.map(b => { const l=bridgeMap.get(b.bridgeId); return {...b, status:l?'online':'offline', devices:l?Object.fromEntries(l.deviceStatuses):{}}; }) });
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/bridges',     requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const b = await Bridge.create({ bridgeId:`br-${uuidv4().split('-')[0]}`, name:req.body.name||'New Branch' });
    res.status(201).json({ status:'success', data:b });
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/bridges/:bridgeId',   requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try {
    const b = await Bridge.findOne({ bridgeId:req.params.bridgeId }).lean();
    if(!b) return res.status(404).json({error:'Bridge not found'});
    const l=bridgeMap.get(b.bridgeId);
    res.json({status:'success',data:{...b,status:l?'online':'offline',devices:l?Object.fromEntries(l.deviceStatuses):{}}});
  } catch(e){res.status(500).json({error:e.message});}
});
app.patch('/api/admin/bridges/:bridgeId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const u={}; if(req.body.name) u.name=req.body.name;
    if(!Object.keys(u).length) return res.status(400).json({error:'Nothing to update'});
    const b = await Bridge.findOneAndUpdate({bridgeId:req.params.bridgeId},{$set:u},{new:true});
    if(!b) return res.status(404).json({error:'Bridge not found'});
    res.json({status:'success',data:b});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/admin/bridges/:bridgeId',requireAuth, requireRole('admin'), strictAdminLimiter, async (req, res) => {
  try {
    const {bridgeId}=req.params;
    await Bridge.deleteOne({bridgeId}); await Device.deleteMany({bridgeId}); await SyncState.deleteMany({bridgeId}); await AttendanceLog.deleteMany({bridgeId}); await MachineUser.deleteMany({bridgeId});
    const l=bridgeMap.get(bridgeId); if(l?.socket){try{l.socket.terminate();}catch{}} bridgeMap.delete(bridgeId);
    res.json({status:'success'});
  } catch(e){res.status(500).json({error:e.message});}
});

// ── DEVICES ───────────────────────────────────────────────────────────────────
app.get('/api/admin/:bridgeId/devices',   requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try {
    const ds=await Device.find({bridgeId:req.params.bridgeId}).lean();
    const b=bridgeMap.get(req.params.bridgeId);
    res.json({status:'success',data:ds.map(d=>({...d,enabled:d.enabled!==false,online:b?b.deviceStatuses.get(d.deviceId)==='online':false}))});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/devices',            requireAuth, requireRole('admin'), requireBody('bridgeId','ip'), async (req, res) => {
  try {
    const {bridgeId,name,ip,port}=req.body;
    const d=await Device.create({bridgeId,name:name||'Machine',ip,port:Number(port)||4370,deviceId:`dev-${uuidv4().split('-')[0]}`,enabled:true});
    const b=bridgeMap.get(bridgeId);
    if(b?.socket?.readyState===WebSocket.OPEN){socketSend(b.socket,{type:'DEVICE_CONFIG_PUSH',device:[{deviceId:d.deviceId,ip:d.ip,port:d.port,name:d.name,enabled:true}]}); if(b.deviceEnabled instanceof Map) b.deviceEnabled.set(d.deviceId,true);}
    res.status(201).json({status:'success',data:d});
  } catch(e){res.status(500).json({error:e.message});}
});
app.patch('/api/admin/devices/:deviceId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const u={}; if(req.body.ip) u.ip=req.body.ip; if(req.body.port) u.port=Number(req.body.port); if(req.body.name) u.name=req.body.name;
    const d=await Device.findOneAndUpdate({deviceId:req.params.deviceId},{$set:u},{new:true});
    if(!d) return res.status(404).json({error:'Device not found'});
    const b=bridgeMap.get(d.bridgeId); if(b?.socket?.readyState===WebSocket.OPEN) socketSend(b.socket,{type:'DEVICE_CONFIG_PUSH',device:[{deviceId:d.deviceId,ip:d.ip,port:d.port,name:d.name,enabled:d.enabled!==false}]});
    res.json({status:'success',data:d});
  } catch(e){res.status(500).json({error:e.message});}
});
app.patch('/api/admin/devices/:deviceId/enabled', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const{enabled,reason}=req.body;
    if(typeof enabled!=='boolean') return res.status(400).json({error:'"enabled" must be boolean'});
    const upd=enabled?{enabled:true,disabledAt:null,disabledReason:null}:{enabled:false,disabledAt:new Date(),disabledReason:reason||null};
    const d=await Device.findOneAndUpdate({deviceId:req.params.deviceId},{$set:upd},{new:true});
    if(!d) return res.status(404).json({error:'Device not found'});
    const b=bridgeMap.get(d.bridgeId);
    if(b?.deviceEnabled instanceof Map) b.deviceEnabled.set(d.deviceId,enabled);
    if(b?.socket?.readyState===WebSocket.OPEN){
      if(enabled) socketSend(b.socket,{type:'DEVICE_ENABLE',deviceId:d.deviceId,device:{deviceId:d.deviceId,ip:d.ip,port:d.port,name:d.name,enabled:true}});
      else        socketSend(b.socket,{type:'DEVICE_DISABLE',deviceId:d.deviceId,reason:reason||'disabled by administrator'});
    }
    res.json({status:'success',data:d});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/admin/devices/:deviceId',requireAuth, requireRole('admin'), strictAdminLimiter, async (req, res) => {
  try {
    const d=await Device.findOneAndDelete({deviceId:req.params.deviceId});
    if(!d) return res.status(404).json({error:'Device not found'});
    await AttendanceLog.deleteMany({bridgeId:d.bridgeId,deviceId:d.deviceId}); await MachineUser.deleteMany({bridgeId:d.bridgeId,deviceId:d.deviceId}); await SyncState.deleteMany({bridgeId:d.bridgeId,deviceId:d.deviceId});
    const b=bridgeMap.get(d.bridgeId);
    if(b){b.deviceStatuses.delete(d.deviceId); if(b.deviceEnabled instanceof Map) b.deviceEnabled.delete(d.deviceId);}
    if(b?.socket?.readyState===WebSocket.OPEN) socketSend(b.socket,{action:'DISCONNECT_DEVICE',deviceId:d.deviceId});
    res.json({status:'success'});
  } catch(e){res.status(500).json({error:e.message});}
});

// ── SYNC ──────────────────────────────────────────────────────────────────────
app.get('/api/admin/:bridgeId/sync-status',    requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try { res.json({status:'success',data:await SyncState.find({bridgeId:req.params.bridgeId}).lean()}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/:bridgeId/:deviceId/sync',requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  const{bridgeId,deviceId}=req.params;
  const b=bridgeMap.get(bridgeId);
  if(!b?.socket||b.socket.readyState!==WebSocket.OPEN) return res.status(503).json({error:'Bridge offline'});
  socketSend(b.socket,{type:'TRIGGER_SYNC',deviceId,reqId:uuidv4()});
  res.json({status:'success',message:`Sync triggered`});
});

// ── USER PROFILES ─────────────────────────────────────────────────────────────
app.get('/api/users',              requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    const{status,shiftId,department,page=1,limit=50,q}=req.query;
    const f={};
    if(status)     f.status=status;
    if(shiftId)    f.shiftId=shiftId;
    if(department) f.department=department;
    if(q){const re=new RegExp(q,'i');f.$or=[{name:re},{userId:re},{employeeCode:re},{email:re}];}
    const[profiles,total]=await Promise.all([UserProfile.find(f).sort({createdAt:-1}).skip((+page-1)*+limit).limit(+limit).lean(),UserProfile.countDocuments(f)]);
    res.json({status:'success',total,page:+page,data:profiles});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/users',             requireAuth, requireRole('admin'), requireBody('userId'), async (req, res) => {
  try {
    if(await UserProfile.findOne({userId:req.body.userId})) return res.status(409).json({error:`userId '${req.body.userId}' already exists`});
    res.status(201).json({status:'success',data:await UserProfile.create(req.body)});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/users/:userId',      requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    const p=await UserProfile.findOne({userId:req.params.userId}).lean();
    if(!p) return res.status(404).json({error:'User not found'});
    const machines=await MachineUser.find({userId:req.params.userId}).select('bridgeId deviceId uid name role cardno syncedAt').lean();
    res.json({status:'success',data:{...p,machines}});
  } catch(e){res.status(500).json({error:e.message});}
});
app.patch('/api/users/:userId',    requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const{userId:_a,_id:_b,createdAt:_c,updatedAt:_d,...fields}=req.body;
    if(!Object.keys(fields).length) return res.status(400).json({error:'Nothing to update'});
    const p=await UserProfile.findOneAndUpdate({userId:req.params.userId},{$set:fields},{new:true,upsert:false});
    if(!p) return res.status(404).json({error:'User not found'});
    res.json({status:'success',data:p});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/users/:userId',   requireAuth, requireRole('admin'), strictAdminLimiter, async (req, res) => {
  try {
    const p=await UserProfile.findOneAndDelete({userId:req.params.userId});
    if(!p) return res.status(404).json({error:'User not found'});
    res.json({status:'success'});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/users/:userId/attendance', requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    const{startDate,endDate,limit=1000}=req.query;
    const f={userId:req.params.userId};
    if(startDate) f.timestamp={$gte:new Date(`${startDate}T00:00:00+05:30`),$lte:new Date(`${endDate||startDate}T23:59:59.999+05:30`)};
    const[profile,logs]=await Promise.all([UserProfile.findOne({userId:req.params.userId}).select('name employeeCode shiftId').lean(),AttendanceLog.find(f).sort({timestamp:-1}).limit(+limit).lean()]);
    res.json({status:'success',user:profile||null,count:logs.length,data:logs});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/users/:userId/machines',   requireAuth, requireRole('admin','support'), async (req, res) => {
  try {
    res.json({status:'success',data:await MachineUser.find({userId:req.params.userId}).select('bridgeId deviceId uid name role cardno syncedAt').lean()});
  } catch(e){res.status(500).json({error:e.message});}
});

// ── ATTENDANCE ────────────────────────────────────────────────────────────────
app.get('/api/:bridgeId/:deviceId/attendance',      requireAuth, requireBridgeAccess, async (req, res) => {
  try {
    const{bridgeId,deviceId}=req.params; const{startDate,endDate,userId,limit=10000}=req.query;
    const f={bridgeId,deviceId};
    if(userId)    f.userId=String(userId);
    if(startDate) f.timestamp={$gte:new Date(`${startDate}T00:00:00+05:30`),$lte:new Date(`${endDate||startDate}T23:59:59.999+05:30`)};
    const logs=await AttendanceLog.find(f).sort({timestamp:-1}).limit(+limit).lean();
    res.json({status:'success',count:logs.length,data:logs});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/:bridgeId/:deviceId/attendance/size', requireAuth, requireBridgeAccess, async (req, res) => {
  try { res.json({status:'success',total_records:await AttendanceLog.countDocuments({bridgeId:req.params.bridgeId,deviceId:req.params.deviceId})}); } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/:bridgeId/:deviceId/attendance/clear', requireAuth, requireRole('admin'), strictAdminLimiter, async (req, res) => {
  const{bridgeId,deviceId}=req.params;
  try { await queueTunnel(bridgeId,deviceId,'clearAttendanceLog'); await AttendanceLog.deleteMany({bridgeId,deviceId}); res.json({status:'success'}); } catch(e){res.status(500).json({error:e.message});}
});

// ── MACHINE USERS ─────────────────────────────────────────────────────────────
app.get('/api/:bridgeId/:deviceId/users',           requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try { res.json({status:'success',data:await MachineUser.find({bridgeId:req.params.bridgeId,deviceId:req.params.deviceId}).lean()}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/:bridgeId/:deviceId/users',          requireAuth, requireRole('admin'), requireBridgeAccess, async (req, res) => {
  const{bridgeId,deviceId}=req.params; const{uid,userid,name,password,role,cardno}=req.body;
  if(!uid) return res.status(400).json({error:'uid required'});
  try {
    await queueTunnel(bridgeId,deviceId,'setUser',[uid,userid,name,password,role,cardno]);
    await MachineUser.findOneAndUpdate({bridgeId,deviceId,uid:Number(uid)},{$set:{userId:userid||null,name:name||null,role:role!=null?Number(role):null,cardno:cardno||null,syncedAt:new Date()}},{upsert:true});
    res.status(201).json({status:'success'});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/:bridgeId/:deviceId/users/:uid',   requireAuth, requireRole('admin'), strictAdminLimiter, requireBridgeAccess, async (req, res) => {
  const{bridgeId,deviceId,uid}=req.params;
  try { await queueTunnel(bridgeId,deviceId,'deleteUser',[uid]); await MachineUser.deleteOne({bridgeId,deviceId,uid:Number(uid)}); res.json({status:'success'}); } catch(e){res.status(500).json({error:e.message});}
});

// ── DEVICE COMMANDS ───────────────────────────────────────────────────────────
app.get('/api/:bridgeId/:deviceId/device/info',     requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  const{bridgeId,deviceId}=req.params;
  try {
    const[info,name,version,os,platform,mac,vendor,productTime]=await Promise.all([
      queueTunnel(bridgeId,deviceId,'getInfo'),queueTunnel(bridgeId,deviceId,'getDeviceName'),queueTunnel(bridgeId,deviceId,'getDeviceVersion'),
      queueTunnel(bridgeId,deviceId,'getOS'),queueTunnel(bridgeId,deviceId,'getPlatform'),queueTunnel(bridgeId,deviceId,'getMacAddress'),
      queueTunnel(bridgeId,deviceId,'getVendor'),queueTunnel(bridgeId,deviceId,'getProductTime'),
    ]);
    res.json({status:'success',data:{name,version,os,platform,mac,vendor,productTime,stats:info}});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/:bridgeId/:deviceId/device/time',     requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try { res.json({status:'success',data:{device_time:await queueTunnel(req.params.bridgeId,req.params.deviceId,'getTime')}}); } catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/:bridgeId/:deviceId/device/time',     requireAuth, requireRole('admin'), requireBridgeAccess, async (req, res) => {
  if(!req.body.time) return res.status(400).json({error:'time required'});
  try { await queueTunnel(req.params.bridgeId,req.params.deviceId,'setTime',[new Date(req.body.time)]); res.json({status:'success'}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/:bridgeId/:deviceId/device/voice-test', requireAuth, requireRole('admin'), requireBridgeAccess, async (req, res) => {
  try { await queueTunnel(req.params.bridgeId,req.params.deviceId,'voiceTest'); res.json({status:'success'}); } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/:bridgeId/:deviceId/device/factory-reset', requireAuth, requireRole('admin'), strictAdminLimiter, requireBridgeAccess, async (req, res) => {
  try { await queueTunnel(req.params.bridgeId,req.params.deviceId,'clearData'); res.json({status:'success'}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/:bridgeId/:deviceId/connect',    requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try { res.json({status:'success',data:await queueTunnel(req.params.bridgeId,req.params.deviceId,'connect')}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/:bridgeId/:deviceId/disconnect', requireAuth, requireRole('admin','support'), requireBridgeAccess, async (req, res) => {
  try { await queueTunnel(req.params.bridgeId,req.params.deviceId,'disconnect'); res.json({status:'success'}); } catch(e){res.status(500).json({error:e.message});}
});

// ── STATUS ────────────────────────────────────────────────────────────────────
app.get('/api/:bridgeId/status',           requireAuth, requireBridgeAccess, (req, res) => {
  const b=bridgeMap.get(req.params.bridgeId);
  res.json({status:'success',data:{bridgeId:req.params.bridgeId,online:!!b,devices:b?Object.fromEntries(b.deviceStatuses):{}}});
});
app.get('/api/:bridgeId/:deviceId/status', requireAuth, requireBridgeAccess, (req, res) => {
  const{bridgeId,deviceId}=req.params; const b=bridgeMap.get(bridgeId);
  res.json({status:'success',data:{bridgeId,deviceId,online:b?b.deviceStatuses.get(deviceId)==='online':false}});
});

// ── SSE REALTIME ──────────────────────────────────────────────────────────────
function sseHandler(bId, dId) {
  return (req, res) => {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    if(res.flushHeaders) res.flushHeaders();
    const c={bridgeId:bId,deviceId:dId||null,res};
    sseClients.push(c);

    // Immediately push current device statuses so client gets up-to-date state on connect
    const b = bridgeMap.get(bId);
    if (b?.deviceStatuses instanceof Map) {
      for (const [deviceId, status] of b.deviceStatuses) {
        if (!dId || dId === deviceId) {
          try { res.write(`data:${JSON.stringify({ type:'DEVICE_STATUS', bridgeId:bId, deviceId, status })}\n\n`); } catch {}
        }
      }
    }
    // Also request a fresh status report from the bridge
    if (b?.socket?.readyState === WebSocket.OPEN) {
      socketSend(b.socket, { type: 'REQUEST_STATUS' });
    }

    const hb=setInterval(()=>{try{res.write(': heartbeat\n\n');}catch{}},20000);
    req.on('close',()=>{clearInterval(hb);sseClients=sseClients.filter(x=>x!==c);});
  };
}
app.get('/api/:bridgeId/:deviceId/attendance/realtime', requireAuth, requireBridgeAccess, (req,res)=>sseHandler(req.params.bridgeId,req.params.deviceId)(req,res));
app.get('/api/:bridgeId/attendance/realtime',           requireAuth, requireBridgeAccess, (req,res)=>sseHandler(req.params.bridgeId,null)(req,res));

// ── MIGRATION ─────────────────────────────────────────────────────────────────
app.post('/api/admin/migrate-rawjson', requireAuth, requireRole('admin'), strictAdminLimiter, async (req, res) => {
  try {
    let af=0,uf=0,pf=0;
    // Fix rawJson stored as string
    for await (const d of AttendanceLog.find({rawJson:{$type:'string'}}).select('_id rawJson').lean().cursor()) {
      const p=parseRawJson(d.rawJson); if(p&&typeof p==='object'){await AttendanceLog.updateOne({_id:d._id},{$set:{rawJson:p}});af++;}
    }
    for await (const d of MachineUser.find({rawJson:{$type:'string'}}).select('_id rawJson').lean().cursor()) {
      const p=parseRawJson(d.rawJson); if(p&&typeof p==='object'){await MachineUser.updateOne({_id:d._id},{$set:{rawJson:p}});uf++;}
    }
    // Backfill null punchType from rawJson.state_code / rawJson.punch_type
    for await (const d of AttendanceLog.find({punchType:null,'rawJson':{$type:'object'}}).select('_id rawJson').lean().cursor()) {
      const raw=d.rawJson||{};
      const pt=normalisePunchType(raw.punch_type??raw.punchType??raw.state_code);
      if(pt!=null){await AttendanceLog.updateOne({_id:d._id},{$set:{punchType:pt}});pf++;}
    }
    res.json({status:'success',fixed:{attendance:af,users:uf,punchType:pf}});
  } catch(e){res.status(500).json({error:e.message});}
});

// ── HEALTH (public) ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok', uptime: process.uptime(),
  bridges: bridgeMap.size, mongoState: mongoose.connection.readyState,
}));


// ── ADMIN NOTIFICATIONS SSE STREAM ───────────────────────────────────────────
app.get('/api/admin/subscriptions/events/stream', requireAuth, requireRole('admin','support'), (req, res) => {
  res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive', 'X-Accel-Buffering':'no' });
  if (res.flushHeaders) res.flushHeaders();
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 20000);
  req.on('close', () => clearInterval(hb));
});

// ── CHAT SYSTEM (in-app support chat) ────────────────────────────────────────
var chatSessions = new Map(); // sessionId -> { userId, messages:[], createdAt }

app.get('/chat/session', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.userId;
    var existing = [...chatSessions.values()].find(s => s.userId === userId && s.status !== 'closed');
    if (!existing) {
      var id = 'chat-' + uuidv4().split('-')[0];
      existing = { sessionId: id, userId, messages: [], status: 'open', createdAt: new Date() };
      chatSessions.set(id, existing);
    }
    res.json({ status: 'success', data: existing });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/chat/message', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.userId;
    const { text, sessionId } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    var session = sessionId ? chatSessions.get(sessionId) : [...chatSessions.values()].find(s => s.userId === userId && s.status !== 'closed');
    if (!session) {
      var id = 'chat-' + uuidv4().split('-')[0];
      session = { sessionId: id, userId, messages: [], status: 'open', createdAt: new Date() };
      chatSessions.set(id, session);
    }
    var msg = { id: uuidv4(), from: 'user', text, createdAt: new Date() };
    session.messages.push(msg);
    res.json({ status: 'success', data: msg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/chat/sessions', requireAuth, requireRole('admin','support'), (req, res) => {
  try {
    var sessions = [...chatSessions.values()].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ status: 'success', data: sessions });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/chat/:sessionId', requireAuth, requireRole('admin','support'), (req, res) => {
  try {
    var session = chatSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ status: 'success', data: session });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/chat/:sessionId/reply', requireAuth, requireRole('admin','support'), (req, res) => {
  try {
    var session = chatSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    var msg = { id: uuidv4(), from: 'admin', text: req.body.text, createdAt: new Date() };
    session.messages.push(msg);
    res.json({ status: 'success', data: msg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/admin/chat/:sessionId/close', requireAuth, requireRole('admin','support'), (req, res) => {
  try {
    var session = chatSessions.get(req.params.sessionId);
    if (session) session.status = 'closed';
    res.json({ status: 'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/chat/stream', requireAuth, requireRole('admin','support'), (req, res) => {
  res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
  if (res.flushHeaders) res.flushHeaders();
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 20000);
  req.on('close', () => clearInterval(hb));
});

// ── SPA FALLBACK / 404 ────────────────────────────────────────────────────────
const API_PREFIXES = ['/api/','/auth/','/admin/','/user/','/organizations/','/subscriptions/','/tawk-config','/chat/','/tickets/','/webhooks/','/bridge-app/','/machine-users/','/health','/bridge'];
app.use((req, res) => {
  if (API_PREFIXES.some(p => req.path === p || req.path.startsWith(p))) {
    return res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { console.error('[server]', err.stack); res.status(500).json({ error: 'Internal server error' }); });

// ── SHUTDOWN ──────────────────────────────────────────────────────────────────
let _down = false;
async function shutdown(sig) {
  if (_down) return; _down = true;
  console.log(`[server] ${sig} — shutting down`);
  wss.close(); server.close();
  await mongoose.disconnect().catch(()=>{});
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── START ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[server] Listening on :${PORT}`);
  console.log(`[server] App:          http://localhost:${PORT}`);
  console.log(`[server] Health:       http://localhost:${PORT}/health`);
  console.log(`[server] WS endpoint:  ws://HOST:${PORT}/bridge?secret=<WS_SECRET>`);
});
