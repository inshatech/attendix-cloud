'use strict';
/**
 * ticketNotify.js
 * ───────────────
 * Sends email notifications for ticket lifecycle events.
 * All sends are fire-and-forget (errors logged, never thrown).
 *
 * Events:
 *   notifyNewTicket(ticket)           → staff (admin+support) get emailed
 *   notifyStaffReply(ticket, message) → user gets emailed
 *   notifyUserReply(ticket, message)  → staff assigned/all staff get emailed
 *   notifyStatusChange(ticket, old)   → user gets emailed
 */

const mongoose = require('mongoose');
const { sendEmail, getBrand } = require('./engine');

// ── HTML helpers ──────────────────────────────────────────────────────────────

/**
 * Wraps body HTML in a polished branded email shell.
 * Accepts an optional brand object; if omitted falls back to defaults.
 */
function wrap(body, brand = {}) {
  const appName     = brand.appName     || 'Attendix';
  const tagline     = brand.tagline     || 'Support System';
  const logoUrl     = brand.logoUrl     || '';
  const companyName = brand.companyName || '';
  const website     = brand.website     || '';
  const year        = new Date().getFullYear();

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" style="height:28px;width:auto;object-fit:contain;"/>`
    : `<span style="font-size:18px;">🔐</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px;">

    <!-- Header -->
    <div style="background:#111121;border:1px solid #1e1e35;border-radius:14px 14px 0 0;padding:20px 28px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #1e1e35;">
      <div style="width:38px;height:38px;border-radius:10px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        ${logoBlock}
      </div>
      <div>
        <p style="margin:0;color:#e0e0f0;font-weight:700;font-size:0.95rem;">${appName}</p>
        <p style="margin:2px 0 0;color:#4a4a72;font-size:0.7rem;font-family:monospace;">${tagline}</p>
      </div>
    </div>

    <!-- Body -->
    <div style="background:#111121;border:1px solid #1e1e35;border-top:none;padding:28px;">
      ${body}
    </div>

    <!-- Footer -->
    <div style="background:#0d0d1a;border:1px solid #1e1e35;border-top:none;border-radius:0 0 14px 14px;padding:16px 28px;text-align:center;">
      <p style="margin:0;color:#3a3a58;font-size:0.7rem;">
        ${companyName ? `© ${year} ${companyName} · ` : ''}${appName} · Automated notification · Do not reply
      </p>
      ${website ? `<p style="margin:6px 0 0;"><a href="${website}" style="color:#58a6ff;font-size:0.7rem;text-decoration:none;">${website.replace(/^https?:\/\//,'')}</a></p>` : ''}
    </div>

  </div>
</body>
</html>`;
}

function ticketCard(ticket) {
  const prColors = { critical:'#f87171', high:'#fb923c', medium:'#facc15', low:'#94a3b8' };
  const pc = prColors[ticket.priority] || '#94a3b8';
  return `
  <div style="background:#0f0f18;border:1px solid #1e1e30;border-radius:8px;padding:14px 16px;margin:16px 0;border-left:3px solid ${pc};">
    <p style="margin:0 0 4px;color:#5a5a7a;font-size:0.65rem;font-family:monospace;">${ticket.ticketId}</p>
    <p style="margin:0 0 8px;color:#d0d0e8;font-weight:600;font-size:0.9rem;">${ticket.subject}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span style="color:${pc};background:${pc}22;padding:2px 8px;border-radius:99px;font-size:0.65rem;font-weight:700;">${ticket.priority?.toUpperCase()}</span>
      <span style="color:#9090b8;background:#1e1e30;padding:2px 8px;border-radius:99px;font-size:0.65rem;text-transform:capitalize;">${ticket.category}</span>
      <span style="color:#9090b8;background:#1e1e30;padding:2px 8px;border-radius:99px;font-size:0.65rem;">From: ${ticket.userName}</span>
    </div>
  </div>`;
}

function msgBox(message) {
  return `
  <div style="background:#0a0a0f;border:1px solid #1e1e30;border-radius:8px;padding:14px 16px;margin:12px 0;">
    <p style="margin:0 0 6px;color:#5a5a7a;font-size:0.7rem;">${message.authorName} · ${new Date(message.createdAt||Date.now()).toLocaleString('en-IN')}</p>
    <p style="margin:0;color:#9090b8;font-size:0.85rem;line-height:1.6;white-space:pre-wrap;">${String(message.body||'').slice(0,500)}</p>
  </div>`;
}

function btn(text, url) {
  return `<div style="text-align:center;margin-top:20px;"><a href="${url}" style="display:inline-block;padding:10px 24px;background:${BASE};color:#fff;border-radius:8px;font-weight:600;font-size:0.875rem;text-decoration:none;">${text}</a></div>`;
}

// ── Get user contact ──────────────────────────────────────────────────────────
async function getUserContact(userId) {
  try {
    const AuthUser = mongoose.model('AuthUser');
    const u = await AuthUser.findOne({ userId }).select('email mobile name').lean();
    return u || null;
  } catch { return null; }
}

async function getStaffContacts() {
  try {
    const AuthUser = mongoose.model('AuthUser');
    const staff = await AuthUser.find({ role: { $in: ['admin','support'] }, isActive: true })
      .select('email name').lean();
    return staff.filter(s => s.email);
  } catch { return []; }
}

// ── Fire and forget ───────────────────────────────────────────────────────────
function fire(fn) {
  fn().catch(e => console.warn('[ticketNotify]', e.message));
}

// ── 1. New ticket created by user → notify all staff ─────────────────────────
async function notifyNewTicket(ticket) {
  fire(async () => {
    const [staff, brand] = await Promise.all([getStaffContacts(), getBrand()]);
    if (!staff.length) return;

    const html = wrap(`
      <h2 style="color:#e0e0f0;margin:0 0 4px;font-size:1.15rem;font-weight:800;letter-spacing:-0.02em;">🎫 New Support Ticket</h2>
      <p style="color:#6060a0;font-size:0.82rem;margin:0 0 20px;">A new ticket has been submitted and needs attention.</p>
      ${ticketCard(ticket)}
      ${ticket.body ? msgBox({ authorName: ticket.userName, body: ticket.body }) : ''}
      <p style="color:#5a5a7a;font-size:0.8rem;margin:16px 0 0;">Log in to the admin panel to assign and respond to this ticket.</p>
    `, brand);

    for (const s of staff) {
      await sendEmail(
        s.email,
        `[New Ticket] ${ticket.ticketId}: ${ticket.subject}`,
        html,
        `New support ticket ${ticket.ticketId} from ${ticket.userName}: ${ticket.subject}`
      ).catch(() => {});
    }
  });
}

// ── 2. Staff replied → notify user ───────────────────────────────────────────
async function notifyStaffReply(ticket, message) {
  if (message.isInternal) return; // never notify user about internal notes
  fire(async () => {
    const [contact, brand] = await Promise.all([getUserContact(ticket.userId), getBrand()]);
    if (!contact?.email) return;

    const html = wrap(`
      <h2 style="color:#e0e0f0;margin:0 0 4px;font-size:1.15rem;font-weight:800;letter-spacing:-0.02em;">💬 Reply on Your Support Ticket</h2>
      <p style="color:#6060a0;font-size:0.82rem;margin:0 0 20px;">The support team has responded to your ticket.</p>
      ${ticketCard(ticket)}
      ${msgBox(message)}
      <div style="background:rgba(88,166,255,0.07);border:1px solid rgba(88,166,255,0.2);border-radius:8px;padding:12px 16px;margin-top:16px;">
        <p style="margin:0;color:#7090c8;font-size:0.8rem;">Log in to view the full conversation and send a reply.</p>
      </div>
    `, brand);

    await sendEmail(
      contact.email,
      `[Ticket ${ticket.ticketId}] New reply from support`,
      html,
      `Support replied on ticket ${ticket.ticketId}: ${ticket.subject}`
    );
  });
}

// ── 3. User replied → notify assigned staff (or all staff) ───────────────────
async function notifyUserReply(ticket, message) {
  fire(async () => {
    let recipients = [];
    if (ticket.assignedTo) {
      const c = await getUserContact(ticket.assignedTo);
      if (c?.email) recipients = [c];
    }
    if (!recipients.length) recipients = await getStaffContacts();
    if (!recipients.length) return;

    const brand = await getBrand();
    const html = wrap(`
      <h2 style="color:#e0e0f0;margin:0 0 4px;font-size:1.15rem;font-weight:800;letter-spacing:-0.02em;">↩️ User Replied on Ticket</h2>
      <p style="color:#6060a0;font-size:0.82rem;margin:0 0 20px;">The customer has added a reply and may need a response.</p>
      ${ticketCard(ticket)}
      ${msgBox(message)}
    `, brand);

    for (const r of recipients) {
      await sendEmail(
        r.email,
        `[Ticket ${ticket.ticketId}] User replied: ${ticket.subject}`,
        html,
        `User replied on ticket ${ticket.ticketId}`
      ).catch(() => {});
    }
  });
}

// ── 4. Status changed → notify user ──────────────────────────────────────────
async function notifyStatusChange(ticket, oldStatus) {
  if (['open','assigned','in-progress'].includes(ticket.status)) return; // only notify meaningful changes
  fire(async () => {
    const [contact, brand] = await Promise.all([getUserContact(ticket.userId), getBrand()]);
    if (!contact?.email) return;

    const statusLabels = { resolved:'✅ Resolved', closed:'🔒 Closed', waiting:'⏳ Waiting for Info' };
    const label = statusLabels[ticket.status] || ticket.status;

    const statusNote = ticket.status === 'resolved'
      ? `<div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.25);border-radius:8px;padding:14px 16px;margin-top:16px;">
           <p style="margin:0;color:#34d399;font-size:0.85rem;line-height:1.6;">✅ Your issue has been resolved. If you still experience problems, you can reply to reopen this ticket.</p>
         </div>`
      : ticket.status === 'waiting'
        ? `<div style="background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.25);border-radius:8px;padding:14px 16px;margin-top:16px;">
             <p style="margin:0;color:#facc15;font-size:0.85rem;line-height:1.6;">⏳ Our team needs more information from you. Please log in and reply to this ticket.</p>
           </div>`
        : '';

    const html = wrap(`
      <h2 style="color:#e0e0f0;margin:0 0 4px;font-size:1.15rem;font-weight:800;letter-spacing:-0.02em;">${label}</h2>
      <p style="color:#6060a0;font-size:0.82rem;margin:0 0 20px;">Your support ticket status has been updated.</p>
      ${ticketCard(ticket)}
      ${statusNote}
    `, brand);

    await sendEmail(
      contact.email,
      `[Ticket ${ticket.ticketId}] Status updated: ${label}`,
      html,
      `Ticket ${ticket.ticketId} status changed to ${ticket.status}`
    );
  });
}

// ── 5. Ticket created by staff for user → notify user ────────────────────────
async function notifyTicketCreatedForUser(ticket) {
  fire(async () => {
    const [contact, brand] = await Promise.all([getUserContact(ticket.userId), getBrand()]);
    if (!contact?.email) return;

    const html = wrap(`
      <h2 style="color:#e0e0f0;margin:0 0 4px;font-size:1.15rem;font-weight:800;letter-spacing:-0.02em;">🎫 Support Ticket Opened for You</h2>
      <p style="color:#6060a0;font-size:0.82rem;margin:0 0 20px;">Our support team has opened a ticket on your behalf.</p>
      ${ticketCard(ticket)}
      <div style="background:rgba(88,166,255,0.07);border:1px solid rgba(88,166,255,0.2);border-radius:8px;padding:12px 16px;margin-top:16px;">
        <p style="margin:0;color:#7090c8;font-size:0.8rem;">Log in to view and respond to this ticket.</p>
      </div>
    `, brand);

    await sendEmail(
      contact.email,
      `[Ticket ${ticket.ticketId}] Support opened a ticket for you`,
      html,
      `A support ticket ${ticket.ticketId} was opened for you: ${ticket.subject}`
    );
  });
}

module.exports = {
  notifyNewTicket,
  notifyStaffReply,
  notifyUserReply,
  notifyStatusChange,
  notifyTicketCreatedForUser,
};
