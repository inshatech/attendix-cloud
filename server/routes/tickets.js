'use strict';
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { requireAuth, requireRole } = require('../auth/middleware');
const { generalApiLimiter } = require('../auth/rateLimits');
const {
  notifyNewTicket,
  notifyStaffReply,
  notifyUserReply,
  notifyStatusChange,
  notifyTicketCreatedForUser,
} = require('../notify/ticketNotify');

// ── Schemas ───────────────────────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema({
  messageId:  { type: String, default: () => uuidv4().split('-')[0] },
  authorId:   { type: String },
  authorName: { type: String },
  authorRole: { type: String },   // 'user' | 'admin' | 'support'
  body:       { type: String, required: true },
  isInternal: { type: Boolean, default: false },
  createdAt:  { type: Date, default: Date.now },
}, { _id: false });

const TicketSchema = new mongoose.Schema({
  ticketId:     { type: String, unique: true, index: true },
  userId:       { type: String, required: true, index: true },
  orgId:        { type: String, default: null },
  userName:     { type: String, default: '' },
  subject:      { type: String, required: true },
  status:       { type: String, enum: ['open','assigned','in-progress','waiting','resolved','closed'], default: 'open', index: true },
  priority:     { type: String, enum: ['critical','high','medium','low'], default: 'medium' },
  category:     { type: String, default: 'general' },
  messages:     [MessageSchema],
  assignedTo:   { type: String, default: null },
  assignedName: { type: String, default: null },
  closedAt:     { type: Date, default: null },
}, { timestamps: true });

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(t) {
  // expose first message body as top-level for list views
  const obj = t.toObject ? t.toObject() : { ...t };
  return obj;
}

router.use(requireAuth, generalApiLimiter);

// ── USER ROUTES ───────────────────────────────────────────────────────────────

// GET /tickets  — list own tickets
router.get('/tickets', async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    const filter = { userId: req.authUser.userId };
    if (status) filter.status = status;
    const [tickets, total] = await Promise.all([
      Ticket.find(filter).sort({ createdAt: -1 }).limit(+limit).skip(+skip).lean(),
      Ticket.countDocuments(filter),
    ]);
    res.json({ status: 'success', total, data: tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /tickets  — create ticket
router.post('/tickets', async (req, res) => {
  try {
    const { subject, body, category = 'general', priority = 'medium', orgId, targetUserId, targetUserName } = req.body;
    if (!subject?.trim()) return res.status(400).json({ error: 'Subject required' });
    if (!body?.trim())    return res.status(400).json({ error: 'Message required' });

    const AuthUser = require('../models/AuthUser');

    // Admin/support can raise ticket on behalf of a user
    const isStaff = ['admin','support'].includes(req.authUser.role);
    const ownerId = (isStaff && targetUserId) ? targetUserId : req.authUser.userId;

    let ownerName = targetUserName || req.authUser.name || '';
    if (!ownerName) {
      const u = await AuthUser.findOne({ userId: ownerId }).select('name email').lean();
      ownerName = u?.name || u?.email || ownerId;
    }

    const authorName = isStaff
      ? (req.authUser.name || req.authUser.role)
      : ownerName;

    const ticket = await Ticket.create({
      ticketId:  `TKT-${uuidv4().split('-')[0].toUpperCase()}`,
      userId:    ownerId,
      orgId:     orgId || null,
      userName:  ownerName,
      subject:   subject.trim(),
      priority,
      category,
      messages: [{
        authorId:   req.authUser.userId,
        authorName: authorName,
        authorRole: req.authUser.role,
        body:       body.trim(),
      }],
    });
    // Notify: staff get alerted on new ticket; user gets alerted if staff opened on their behalf
    if (isStaff && targetUserId) {
      notifyTicketCreatedForUser(ticket);
    } else {
      notifyNewTicket(ticket);
    }
    res.status(201).json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /tickets/:ticketId  — get own ticket
router.get('/tickets/:ticketId', async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId, userId: req.authUser.userId }).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /tickets/:ticketId/reply  — user reply
router.post('/tickets/:ticketId/reply', async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Reply body required' });
    const AuthUser = require('../models/AuthUser');
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).select('name').lean();
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.ticketId, userId: req.authUser.userId },
      {
        $push: { messages: {
          authorId:   req.authUser.userId,
          authorName: u?.name || 'User',
          authorRole: 'user',
          body:       body.trim(),
        }},
        $set: { status: 'open' },
      },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    notifyUserReply(ticket, ticket.messages[ticket.messages.length - 1]);
    res.json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /tickets/:ticketId/close  — user close own ticket
router.patch('/tickets/:ticketId/close', async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.ticketId, userId: req.authUser.userId },
      { $set: { status: 'closed', closedAt: new Date() } },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /user/ticket-notifications
router.get('/user/ticket-notifications', async (req, res) => {
  try {
    const count = await Ticket.countDocuments({
      userId: req.authUser.userId,
      status: { $in: ['open','waiting','in-progress'] },
    });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────

// GET /admin/tickets/stats  — MUST be before /:ticketId route
router.get('/admin/tickets/stats', requireRole('admin', 'support'), async (req, res) => {
  try {
    const [byStatus, unassigned] = await Promise.all([
      Ticket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ticket.countDocuments({ assignedTo: null, status: { $nin: ['resolved','closed'] } }),
    ]);
    res.json({ status: 'success', data: { byStatus, unassigned } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/tickets  — all tickets
router.get('/admin/tickets', requireRole('admin', 'support'), async (req, res) => {
  try {
    const { status, q, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.$or = [
      { subject:  { $regex: q, $options: 'i' } },
      { userName: { $regex: q, $options: 'i' } },
      { ticketId: { $regex: q, $options: 'i' } },
    ];
    const [tickets, total] = await Promise.all([
      Ticket.find(filter).sort({ createdAt: -1 }).limit(+limit).skip(+skip).lean(),
      Ticket.countDocuments(filter),
    ]);
    res.json({ status: 'success', total, data: tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/tickets/:ticketId
router.get('/admin/tickets/:ticketId', requireRole('admin', 'support'), async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId }).lean();
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    res.json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /admin/tickets/:ticketId/reply  — staff reply or internal note
router.post('/admin/tickets/:ticketId/reply', requireRole('admin', 'support'), async (req, res) => {
  try {
    const { body, isInternal = false } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Reply required' });
    const AuthUser = require('../models/AuthUser');
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).select('name').lean();
    const authorName = u?.name || req.authUser.role;
    const update = {
      $push: { messages: {
        authorId:   req.authUser.userId,
        authorName: authorName,
        authorRole: req.authUser.role,
        body:       body.trim(),
        isInternal: !!isInternal,
      }},
    };
    // Only update status if it's a visible reply (not internal)
    if (!isInternal) {
      update.$set = { status: 'waiting', assignedTo: req.authUser.userId, assignedName: authorName };
    }
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.ticketId },
      update,
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    const lastMsg = ticket.messages[ticket.messages.length - 1];
    notifyStaffReply(ticket, lastMsg);
    res.json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /admin/tickets/:ticketId  — update status, priority, assignment
router.patch('/admin/tickets/:ticketId', requireRole('admin', 'support'), async (req, res) => {
  try {
    const { status, priority, assignedTo, assignedName } = req.body;
    const update = {};
    if (status)                    update.status       = status;
    if (priority)                  update.priority     = priority;
    if (assignedTo !== undefined)  update.assignedTo   = assignedTo;
    if (assignedName !== undefined) update.assignedName = assignedName;
    if (status === 'closed')       update.closedAt     = new Date();
    const oldStatus = (await Ticket.findOne({ ticketId: req.params.ticketId }).select('status').lean())?.status;
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.ticketId },
      { $set: update },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    if (status && status !== oldStatus) notifyStatusChange(ticket, oldStatus);
    res.json({ status: 'success', data: ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/ticket-notifications  — unread count for sidebar badge
router.get('/admin/ticket-notifications', requireRole('admin', 'support'), async (req, res) => {
  try {
    const count = await Ticket.countDocuments({ status: 'open' });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
