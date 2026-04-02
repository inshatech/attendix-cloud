'use strict';
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const MessageSchema = new mongoose.Schema({
  messageId:  { type: String, default: () => `msg-${uuidv4().slice(0,8)}` },
  authorId:   { type: String, required: true },
  authorName: { type: String, default: 'Unknown' },
  authorRole: { type: String, default: 'user' },
  body:       { type: String, required: true },
  isInternal: { type: Boolean, default: false }, // internal note — not visible to user
}, { timestamps: true });

const TicketSchema = new mongoose.Schema({
  ticketId:     { type: String, required: true, unique: true, index: true,
                  default: () => `TKT-${Date.now().toString(36).toUpperCase()}` },
  orgId:        { type: String, default: null, index: true },
  userId:       { type: String, required: true, index: true },
  userName:     { type: String, default: 'Unknown' },
  userEmail:    { type: String, default: null },

  subject:      { type: String, required: true },
  body:         { type: String, required: true },

  category: {
    type: String, default: 'general',
    enum: ['general','billing','technical','device','bridge','attendance','feature','other'],
  },
  priority:  { type: String, default: 'medium', enum: ['low','medium','high','critical'] },
  status:    { type: String, default: 'open',
               enum: ['open','assigned','in-progress','waiting','resolved','closed'] },

  assignedTo:   { type: String, default: null },  // support/admin userId
  assignedName: { type: String, default: null },

  messages:     { type: [MessageSchema], default: [] },

  resolvedAt:   { type: Date, default: null },
  closedAt:     { type: Date, default: null },
  lastReplyAt:  { type: Date, default: null },
  firstReplyAt: { type: Date, default: null },

  // SLA tracking
  slaBreached:  { type: Boolean, default: false },

  tags: { type: [String], default: [] },
}, { timestamps: true });

TicketSchema.index({ status: 1, priority: -1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Ticket', TicketSchema);
