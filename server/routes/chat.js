'use strict';
const express  = require('express');
const router   = express.Router();
const { ChatSession } = require('../models/Chat');
const Ticket   = require('../models/Ticket');
const { requireAuth, requireRole } = require('../auth/middleware');
const { generalApiLimiter, adminApiLimiter } = require('../auth/rateLimits');

// ── Online presence tracking ──────────────────────────────────────────────────
// staffOnline: Set of userIds of admin/support currently connected via SSE
const staffOnline  = new Set();
// userSseClients: Map<userId, res[]> for pushing messages to user
const userSseClients  = new Map();
// adminSseClients: Map<clientId, res> for pushing to all admin/support
const adminSseClients = new Map();

function isStaffOnline() { return staffOnline.size > 0; }

function pushToUser(userId, event, data) {
  const clients = userSseClients.get(userId) || [];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => { try { res.write(payload); } catch {} });
}

function pushToAdmin(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  adminSseClients.forEach(res => { try { res.write(payload); } catch {} });
}

// ── USER: get or create active session ───────────────────────────────────────
// ── Health check ─────────────────────────────────────────────────────────────
router.get('/chat/ping', (req, res) => res.json({ ok: true, time: new Date() }));

router.get('/chat/session', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const userId = req.authUser.userId;
    let session  = await ChatSession.findOne({ userId, status: { $in: ['active','converted'] } }).lean();
    if (!session) {
      session = (await ChatSession.create({
        userId,
        userName:  req.authUser.name || 'User',
        userEmail: req.authUser.email || null,
        orgId:     req.authUser.orgId || null,
      })).toObject();
    }
    res.json({ status:'success', data: { ...session, staffOnline: isStaffOnline() } });
  } catch(e) { console.error('[chat route error]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// ── USER: send message ────────────────────────────────────────────────────────
router.post('/chat/message', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Message text required' });
    const userId = req.authUser.userId;

    let session = await ChatSession.findOne({ userId, status: { $in: ['active','converted'] } });
    if (!session) {
      session = await ChatSession.create({
        userId,
        userName:  req.authUser.name || 'User',
        userEmail: req.authUser.email || null,
        orgId:     req.authUser.orgId || null,
      });
      // convert to plain object for consistent handling
      if (typeof session.toObject === 'function') session = session.toObject();
    }

    const msg = {
      senderId:   userId,
      senderName: req.authUser.name || 'User',
      senderRole: 'user',
      text:       text.trim(),
    };

    session.messages.push(msg);
    session.lastMsgAt    = new Date();
    session.unreadByAdmin += 1;

    const staffIsOnline = isStaffOnline();

    // AUTO-CONVERT TO TICKET if staff offline and this is first message or already converting
    if (!staffIsOnline && !session.convertedToTicket) {
      session.convertedToTicket = true;
      session.convertedAt       = new Date();

      // Create ticket from session
      const subject = text.slice(0, 80) + (text.length > 80 ? '…' : '');
      const ticket  = await Ticket.create({
        userId,
        userName:  req.authUser.name || 'User',
        userEmail: req.authUser.email || null,
        orgId:     req.authUser.orgId || null,
        subject:   `[Chat] ${subject}`,
        body:      text.trim(),
        category:  'general',
        priority:  'medium',
        status:    'open',
        messages:  [{
          authorId:   userId,
          authorName: req.authUser.name || 'User',
          authorRole: 'user',
          body:       text.trim(),
          isInternal: false,
        }],
      });
      session.ticketId = ticket.ticketId;
      // Keep status 'active' so user can keep chatting — ticket just tracks it
    }

    await session.save();
    const rawMsg = session.messages[session.messages.length - 1];
    const savedMsg = rawMsg?.toObject ? rawMsg.toObject() : rawMsg;

    // Push real-time to admin if online
    pushToAdmin('new_message', {
      sessionId:  session.sessionId,
      userId,
      userName:   req.authUser.name || 'User',
      userEmail:  req.authUser.email || null,
      orgId:      req.authUser.orgId || null,
      message:    savedMsg,
      session: {  // full session so admin can add it to list if not already there
        sessionId:         session.sessionId,
        userId,
        userName:          req.authUser.name || 'User',
        userEmail:         req.authUser.email || null,
        orgId:             req.authUser.orgId || null,
        convertedToTicket: session.convertedToTicket,
        ticketId:          session.ticketId,
        lastMsgAt:         session.lastMsgAt,
        unreadByAdmin:     session.unreadByAdmin,
        messages:          [savedMsg],
      },
      staffOnline: staffIsOnline,
    });

    res.json({
      status:  'success',
      data: {
        message:     savedMsg,
        staffOnline: staffIsOnline,
        convertedToTicket: session.convertedToTicket,
        ticketId:    session.ticketId,
        autoReply:   !staffIsOnline
          ? "Our team is currently offline. Your message has been saved as a support ticket and we'll get back to you shortly."
          : null,
      },
    });
  } catch(e) { console.error('[chat route error]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// ── USER: SSE stream — receive admin replies in real-time ─────────────────────
router.get('/chat/stream', requireAuth, async (req, res) => {
  const userId = req.authUser.userId;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Register
  if (!userSseClients.has(userId)) userSseClients.set(userId, []);
  userSseClients.get(userId).push(res);

  // Send current staff online status
  res.write(`event: presence\ndata: ${JSON.stringify({ staffOnline: isStaffOnline() })}\n\n`);

  // Keepalive
  const ka = setInterval(() => { try { res.write(': ka\n\n') } catch {} }, 25000);

  req.on('close', () => {
    clearInterval(ka);
    const arr = userSseClients.get(userId) || [];
    const idx = arr.indexOf(res);
    if (idx !== -1) arr.splice(idx, 1);
    if (!arr.length) userSseClients.delete(userId);
  });
});

// ── ADMIN: SSE stream — all chat activity + presence ─────────────────────────
router.get('/admin/chat/stream', requireAuth, requireRole('admin', 'support'), async (req, res) => {
  const clientId = `${req.authUser.userId}-${Date.now()}`;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Mark staff online
  staffOnline.add(req.authUser.userId);
  adminSseClients.set(clientId, res);

  // Notify all users that staff came online
  userSseClients.forEach((clients, uid) => {
    const payload = `event: presence\ndata: ${JSON.stringify({ staffOnline: true })}\n\n`;
    clients.forEach(c => { try { c.write(payload) } catch {} });
  });
  pushToAdmin('staff_presence', { userId: req.authUser.userId, name: req.authUser.name, online: true });

  // Send initial active sessions
  try {
    const sessions = await ChatSession.find({ status: { $in: ['active','converted'] } }).sort({ lastMsgAt: -1 }).lean();
    res.write(`event: init\ndata: ${JSON.stringify({ sessions })}\n\n`);
  } catch {}

  const ka = setInterval(() => { try { res.write(': ka\n\n') } catch {} }, 25000);

  req.on('close', () => {
    clearInterval(ka);
    adminSseClients.delete(clientId);
    // Only mark offline if no other connections for this staff member
    const stillConnected = [...adminSseClients.keys()].some(k => k.startsWith(req.authUser.userId));
    if (!stillConnected) {
      staffOnline.delete(req.authUser.userId);
      // Notify users
      userSseClients.forEach(clients => {
        const payload = `event: presence\ndata: ${JSON.stringify({ staffOnline: isStaffOnline() })}\n\n`;
        clients.forEach(c => { try { c.write(payload) } catch {} });
      });
      pushToAdmin('staff_presence', { userId: req.authUser.userId, name: req.authUser.name, online: false });
    }
  });
});

// ── ADMIN: reply to a chat session ───────────────────────────────────────────
router.post('/admin/chat/:sessionId/reply', requireAuth, requireRole('admin', 'support'), adminApiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Message required' });

    const session = await ChatSession.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const msg = {
      senderId:   req.authUser.userId,
      senderName: req.authUser.name || 'Support',
      senderRole: req.authUser.role,
      text:       text.trim(),
      read:       false,
    };

    session.messages.push(msg);
    session.lastMsgAt     = new Date();
    session.unreadByUser  += 1;
    if (!session.assignedTo) {
      session.assignedTo   = req.authUser.userId;
      session.assignedName = req.authUser.name;
    }
    await session.save();

    const rawMsg = session.messages[session.messages.length - 1];
    const savedMsg = rawMsg?.toObject ? rawMsg.toObject() : rawMsg;

    // Push to user in real-time
    pushToUser(session.userId, 'new_message', {
      sessionId: session.sessionId,
      message:   savedMsg,
    });

    res.json({ status:'success', data: savedMsg });
  } catch(e) { console.error('[chat route error]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// ── ADMIN: list all active sessions ──────────────────────────────────────────
router.get('/admin/chat/sessions', requireAuth, requireRole('admin', 'support'), adminApiLimiter, async (req, res) => {
  try {
    const sessions = await ChatSession.find({ status: { $in: ['active','converted'] } }).sort({ lastMsgAt: -1 }).lean();
    res.json({ status:'success', data: sessions, staffOnline: isStaffOnline() });
  } catch(e) { console.error('[chat route error]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// ── ADMIN: get one session ────────────────────────────────────────────────────
router.get('/admin/chat/:sessionId', requireAuth, requireRole('admin', 'support'), adminApiLimiter, async (req, res) => {
  try {
    const session = await ChatSession.findOne({ sessionId: req.params.sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Not found' });
    // Mark unread as read
    await ChatSession.updateOne({ sessionId: req.params.sessionId }, { $set: { unreadByAdmin: 0 } });
    res.json({ status:'success', data: session });
  } catch(e) { console.error('[chat route error]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// ── ADMIN: close session ──────────────────────────────────────────────────────
router.patch('/admin/chat/:sessionId/close', requireAuth, requireRole('admin', 'support'), adminApiLimiter, async (req, res) => {
  try {
    await ChatSession.updateOne({ sessionId: req.params.sessionId }, { $set: { status: 'closed' } });
    pushToUser((await ChatSession.findOne({ sessionId: req.params.sessionId }).lean())?.userId, 'session_closed', {});
    res.json({ status:'success' });
  } catch(e) { console.error('[chat route error]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// ── Export presence helpers for other routes ──────────────────────────────────
module.exports = { router, isStaffOnline, pushToUser, pushToAdmin };
