'use strict';
/**
 * authNotify.js
 * ─────────────────────────────────────────────
 * Fire-and-forget email notifications for auth lifecycle events:
 *   • Welcome on registration
 *   • Password changed / reset
 *   • Subscription activated / changed / suspended
 */

const mongoose = require('mongoose');
const { sendEmail, getBrand } = require('./engine');

// ── Shared email shell (dark + light-mode + mobile responsive) ────────────────
function shell(bodyHtml, brand = {}) {
  const appName     = brand.appName     || 'Attendix';
  const tagline     = brand.tagline     || 'Attendance & Payroll Simplified';
  const logoUrl     = brand.logoUrl     || '';
  const companyName = brand.companyName || '';
  const website     = brand.website     || '';
  const year        = new Date().getFullYear();

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" style="height:28px;width:auto;object-fit:contain;display:block;"/>`
    : `<span style="font-size:20px;">🔐</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${appName}</title>
  <style>
    /* ── Mobile ─────────────────────────────────── */
    @media only screen and (max-width:600px) {
      .aw { padding:0 8px !important; margin:12px auto !important; }
      .ah { padding:16px !important; }
      .ab { padding:22px 16px !important; }
      .af { padding:12px 16px !important; }
    }
    /* ── Light mode ─────────────────────────────── */
    @media (prefers-color-scheme:light) {
      .outer  { background:#f0f0f8 !important; }
      .ah     { background:#ffffff !important; border-color:#dde0f0 !important; }
      .ab     { background:#ffffff !important; border-color:#dde0f0 !important; }
      .af     { background:#f8f8fc !important; border-color:#dde0f0 !important; }
      .c-head { color:#1a1a2e !important; }
      .c-sub  { color:#5252a0 !important; }
      .c-muted{ color:#7878a8 !important; }
      .c-foot { color:#9090b8 !important; }
    }
  </style>
</head>
<body class="outer" style="margin:0;padding:0;background:#07070f;font-family:'Segoe UI',Arial,sans-serif;">
  <div class="aw" style="max-width:520px;margin:32px auto;padding:0 12px;">

    <!-- Header -->
    <div class="ah" style="background:#111121;border:1px solid #1e1e35;border-radius:14px 14px 0 0;padding:18px 24px;display:flex;align-items:center;gap:12px;">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        ${logoBlock}
      </div>
      <div>
        <p class="c-head" style="margin:0;color:#e0e0f0;font-weight:700;font-size:0.9rem;">${appName}</p>
        <p class="c-muted" style="margin:2px 0 0;color:#4a4a72;font-size:0.65rem;font-family:monospace;">${tagline}</p>
      </div>
    </div>

    <!-- Body -->
    <div class="ab" style="background:#0d0d1a;border:1px solid #1e1e35;border-top:none;padding:28px 24px;">
      ${bodyHtml}
    </div>

    <!-- Footer -->
    <div class="af" style="background:#0a0a14;border:1px solid #1e1e35;border-top:none;border-radius:0 0 14px 14px;padding:14px 24px;text-align:center;">
      <p class="c-foot" style="margin:0;color:#3a3a58;font-size:10px;">
        ${companyName ? `© ${year} ${companyName} · ` : ''}${appName} · Automated notification · Do not reply
      </p>
      ${website ? `<p style="margin:5px 0 0;"><a href="${website}" style="color:#58a6ff;font-size:10px;text-decoration:none;">${website.replace(/^https?:\/\//,'')}</a></p>` : ''}
    </div>

  </div>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fire(fn) {
  fn().catch(e => console.warn('[authNotify]', e.message));
}

async function getUserEmail(userId) {
  try {
    const AuthUser = mongoose.model('AuthUser');
    const u = await AuthUser.findOne({ userId }).select('email name').lean();
    return u?.email ? u : null;
  } catch { return null; }
}

// ── 1. Welcome email on registration ─────────────────────────────────────────
function sendWelcomeEmail(user) {
  fire(async () => {
    if (!user.email) return;
    const brand = await getBrand();

    const body = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:40px;margin-bottom:10px;">🎉</div>
        <h2 class="c-head" style="margin:0 0 8px;color:#e0e0f0;font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;">Welcome to ${brand.appName}!</h2>
        <p class="c-sub" style="margin:0;color:#6060a0;font-size:0.85rem;">Your account has been created successfully.</p>
      </div>

      <p class="c-muted" style="margin:0 0 20px;color:#8080a8;font-size:0.875rem;line-height:1.7;">
        Hi <strong style="color:#d0d0ec;">${user.name || 'there'}</strong>, welcome aboard!
        You can now create your organization and start managing attendance with biometric devices.
      </p>

      <div style="background:#111121;border:1px solid #1e1e35;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <p style="margin:0 0 10px;color:#7070a0;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Getting started</p>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
          <span style="background:#58a6ff22;border:1px solid #58a6ff44;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#58a6ff;flex-shrink:0;margin-top:1px;">1</span>
          <p style="margin:0;color:#8080a8;font-size:0.82rem;line-height:1.5;">Create an organization and set up your profile</p>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
          <span style="background:#58a6ff22;border:1px solid #58a6ff44;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#58a6ff;flex-shrink:0;margin-top:1px;">2</span>
          <p style="margin:0;color:#8080a8;font-size:0.82rem;line-height:1.5;">Connect your biometric device via the Bridge App</p>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <span style="background:#58a6ff22;border:1px solid #58a6ff44;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#58a6ff;flex-shrink:0;margin-top:1px;">3</span>
          <p style="margin:0;color:#8080a8;font-size:0.82rem;line-height:1.5;">Add employees and start tracking real-time attendance</p>
        </div>
      </div>

      <p style="margin:0;color:#5a5a7a;font-size:0.78rem;line-height:1.6;">
        If you have any questions, visit the Support section in your dashboard or contact our team.
      </p>`;

    const html = shell(body, brand);
    await sendEmail(user.email, `Welcome to ${brand.appName}!`, html, `Welcome to ${brand.appName}, ${user.name || 'there'}! Your account is ready.`);
  });
}

// ── 2. Password changed / reset notification ──────────────────────────────────
function sendPasswordChangedEmail(user, isReset = false) {
  fire(async () => {
    if (!user.email) return;
    const brand = await getBrand();
    const time  = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date());

    const body = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:36px;margin-bottom:10px;">🔐</div>
        <h2 class="c-head" style="margin:0 0 8px;color:#e0e0f0;font-size:1.15rem;font-weight:800;">
          ${isReset ? 'Password Reset' : 'Password Changed'}
        </h2>
        <p class="c-sub" style="margin:0;color:#6060a0;font-size:0.82rem;">Your account password was updated.</p>
      </div>

      <p class="c-muted" style="margin:0 0 20px;color:#8080a8;font-size:0.875rem;line-height:1.7;">
        Hi <strong style="color:#d0d0ec;">${user.name || 'there'}</strong>,
        your ${brand.appName} password was ${isReset ? 'reset' : 'successfully changed'} on
        <strong style="color:#d0d0ec;">${time}</strong>.
        All active sessions have been logged out.
      </p>

      <div style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.25);border-radius:10px;padding:14px 18px;">
        <p style="margin:0;color:#f87171;font-size:0.82rem;line-height:1.6;">
          ⚠️ If you did not make this change, your account may be compromised.
          Please contact support immediately.
        </p>
      </div>`;

    const subject = isReset
      ? `[${brand.appName}] Password reset successful`
      : `[${brand.appName}] Your password was changed`;

    const html = shell(body, brand);
    await sendEmail(user.email, subject, html, `Your ${brand.appName} password was ${isReset ? 'reset' : 'changed'} at ${time}. If this wasn't you, contact support.`);
  });
}

// ── 3. Subscription activated / changed / suspended ───────────────────────────
function sendSubscriptionEmail(userId, { planName, status, endDate, billingCycle, notes }) {
  fire(async () => {
    const contact = await getUserEmail(userId);
    if (!contact?.email) return;
    const brand = await getBrand();

    const isActive    = ['active','trial'].includes(status);
    const isSuspended = ['suspended','cancelled','expired'].includes(status);

    const statusLabel = {
      trial:     '🆓 Free Trial Started',
      active:    '✅ Subscription Activated',
      suspended: '⏸️ Subscription Suspended',
      cancelled: '❌ Subscription Cancelled',
      expired:   '⏰ Subscription Expired',
    }[status] || `Subscription ${status}`;

    const color = isActive ? '#34d399' : isSuspended ? '#f87171' : '#facc15';

    const endStr = endDate
      ? new Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(endDate))
      : null;

    const body = `
      <div style="text-align:center;margin-bottom:24px;">
        <h2 class="c-head" style="margin:0 0 8px;color:#e0e0f0;font-size:1.15rem;font-weight:800;">${statusLabel}</h2>
        <p class="c-sub" style="margin:0;color:#6060a0;font-size:0.82rem;">Your ${brand.appName} plan has been updated.</p>
      </div>

      <div style="background:#111121;border:1px solid ${color}33;border-radius:10px;padding:18px 20px;margin-bottom:20px;text-align:center;">
        <p style="margin:0 0 4px;color:${color};font-size:1.3rem;font-weight:800;">${planName}</p>
        <p style="margin:0;color:#5a5a7a;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;">
          ${billingCycle ? billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1) + ' plan' : 'Plan'}
        </p>
        ${endStr ? `<p style="margin:10px 0 0;color:#7070a0;font-size:0.78rem;">Valid until <strong style="color:#d0d0ec;">${endStr}</strong></p>` : ''}
      </div>

      ${isActive ? `
      <p class="c-muted" style="margin:0 0 16px;color:#8080a8;font-size:0.85rem;line-height:1.6;">
        Hi <strong style="color:#d0d0ec;">${contact.name || 'there'}</strong>,
        your subscription is now active. Log in to your dashboard to manage your organization.
      </p>` : `
      <p class="c-muted" style="margin:0 0 16px;color:#8080a8;font-size:0.85rem;line-height:1.6;">
        Hi <strong style="color:#d0d0ec;">${contact.name || 'there'}</strong>,
        your subscription has been ${status}. Contact support if you have questions or to renew.
      </p>`}

      ${notes ? `<div style="background:#111121;border:1px solid #1e1e35;border-radius:8px;padding:12px 16px;">
        <p style="margin:0;color:#6060a0;font-size:0.78rem;line-height:1.5;">Note: ${notes}</p>
      </div>` : ''}`;

    const subject = `[${brand.appName}] ${statusLabel} — ${planName}`;
    const html = shell(body, brand);
    await sendEmail(contact.email, subject, html, `${statusLabel} — ${planName}. ${endStr ? `Valid until ${endStr}.` : ''}`);
  });
}

module.exports = { sendWelcomeEmail, sendPasswordChangedEmail, sendSubscriptionEmail };
