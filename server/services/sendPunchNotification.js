'use strict';
/**
 * sendPunchNotification.js
 * ─────────────────────────
 * Builds and sends a single punch notification to a guardian/parent.
 * Called by the NotificationQueue worker in app.js.
 *
 * Channel priority (tries in order, stops on first success):
 *   whatsapp → sms → email
 */

const { sendEmail, sendWhatsApp, sendSms, getBrand } = require('../notify/engine');

// ── Format punch time ─────────────────────────────────────────────────────────
function fmtTime(date, tz) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz || 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(date));
}

function fmtDateTime(date, tz) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz || 'Asia/Kolkata',
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(date));
}

// ── Build WhatsApp / SMS text ─────────────────────────────────────────────────
function buildTextMessage(item, tz, appName) {
  const timeStr = fmtTime(item.punchTime, tz);
  const dateStr = fmtDateTime(item.punchTime, tz);
  const icon    = item.direction === 'IN' ? '✅' : item.direction === 'OUT' ? '🔔' : '📍';
  const verb    = item.direction === 'IN' ? 'arrived at' : item.direction === 'OUT' ? 'left' : 'punched at';
  const device  = item.deviceName || item.deviceId || 'device';
  const guardian = item.guardianName ? `Dear ${item.guardianName},\n` : '';

  return [
    `${guardian}${icon} *${item.empName}* has ${verb} school`,
    `🕐 ${timeStr}`,
    `📍 ${device}`,
    `📅 ${dateStr}`,
    `— ${appName}`,
  ].join('\n');
}

// ── Build HTML email ──────────────────────────────────────────────────────────
async function buildEmailHtml(item, tz) {
  const brand    = await getBrand();
  const timeStr  = fmtTime(item.punchTime, tz);
  const dateStr  = fmtDateTime(item.punchTime, tz);
  const isIn     = item.direction === 'IN';
  const isOut    = item.direction === 'OUT';
  const color    = isIn ? '#34d399' : isOut ? '#f87171' : '#58a6ff';
  const verb     = isIn ? 'Arrived' : isOut ? 'Left' : 'Punched';
  const icon     = isIn ? '✅' : isOut ? '🔔' : '📍';
  const device   = item.deviceName || item.deviceId || 'Biometric Device';

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.appName}" style="height:26px;width:auto;"/>`
    : `<span style="font-size:16px;">${icon}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px) {
      .aw { padding:0 6px !important; margin:12px auto !important; }
      .ah { padding:14px 16px !important; }
      .ab { padding:20px 16px !important; }
      .af { padding:10px 16px !important; }
      .tt { font-size:1.1rem !important; }
      .tc { font-size:1.3rem !important; }
    }
    @media (prefers-color-scheme:light) {
      .outer { background:#f0f4f8 !important; }
      .ah    { background:#ffffff !important; border-color:#dde0f0 !important; }
      .ab    { background:#ffffff !important; border-color:#dde0f0 !important; }
      .af    { background:#f8f8fc !important; border-color:#dde0f0 !important; }
      .pcard { background:#f0f2ff !important; border-color:rgba(88,166,255,0.3) !important; }
      .ptag  { background:#f4f4fc !important; border-color:#dde0f0 !important; }
      .c-name { color:#1a1a2e !important; }
      .c-rel  { color:#5a5a90 !important; }
      .c-tag  { color:#6a6a9a !important; }
      .c-foot { color:#9898b8 !important; }
    }
  </style>
</head>
<body class="outer" style="margin:0;padding:0;background:#07070f;font-family:'Segoe UI',Arial,sans-serif;">
<div class="aw" style="max-width:480px;margin:28px auto;padding:0 10px;">

  <!-- Header -->
  <div class="ah" style="background:#111121;border:1px solid #1e1e35;border-radius:14px 14px 0 0;padding:16px 22px;display:flex;align-items:center;gap:12px;">
    <div style="width:34px;height:34px;border-radius:9px;background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
      ${logoBlock}
    </div>
    <div>
      <p style="margin:0;color:#e0e0f0;font-weight:700;font-size:0.875rem;">${brand.appName}</p>
      <p style="margin:2px 0 0;color:#3a3a58;font-size:0.6rem;font-family:monospace;">Attendance Notification</p>
    </div>
  </div>

  <!-- Punch card -->
  <div class="ab" style="background:#0d0d1a;border:1px solid #1e1e35;border-top:none;padding:24px 22px;text-align:center;">
    <div style="width:56px;height:56px;border-radius:50%;background:${color}18;border:2px solid ${color}40;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px;">
      ${icon}
    </div>
    <h2 class="c-name tt" style="margin:0 0 5px;color:#e0e0f0;font-size:1.2rem;font-weight:800;">${item.empName}</h2>
    <p class="c-rel" style="margin:0 0 18px;color:#7070a0;font-size:0.78rem;">
      ${item.guardianRelation ? `${item.guardianRelation}'s ward` : 'Student'}
    </p>

    <div class="pcard" style="background:#111121;border:1px solid ${color}30;border-radius:12px;padding:16px 18px;margin-bottom:16px;">
      <p class="tc" style="margin:0 0 3px;color:${color};font-size:1.45rem;font-weight:800;font-family:'Courier New',monospace;">${timeStr}</p>
      <p style="margin:0;color:#4a4a72;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;">${verb}</p>
    </div>

    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <span class="ptag c-tag" style="background:#111121;border:1px solid #1e1e35;border-radius:8px;padding:6px 12px;font-size:0.73rem;color:#7070a0;">
        📍 ${device}
      </span>
      <span class="ptag c-tag" style="background:#111121;border:1px solid #1e1e35;border-radius:8px;padding:6px 12px;font-size:0.73rem;color:#7070a0;font-family:monospace;">
        📅 ${dateStr}
      </span>
    </div>
  </div>

  <!-- Footer -->
  <div class="af" style="background:#0a0a14;border:1px solid #1e1e35;border-top:none;border-radius:0 0 14px 14px;padding:11px 22px;text-align:center;">
    <p class="c-foot" style="margin:0;color:#2a2a42;font-size:10px;">Automated notification · Do not reply · ${brand.appName}</p>
  </div>

</div>
</body>
</html>`;
}

// ── Is within quiet hours? ────────────────────────────────────────────────────
function isQuietHour(punchTime, quietStart, quietEnd, tz) {
  if (!quietStart || !quietEnd) return false;
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(punchTime));
  const [ch, cm] = timeStr.split(':').map(Number);
  const [sh, sm] = quietStart.split(':').map(Number);
  const [eh, em] = quietEnd.split(':').map(Number);
  const cur   = ch * 60 + cm;
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;
  // Handle overnight quiet hours (e.g. 22:00 – 06:00)
  if (start > end) return cur >= start || cur < end;
  return cur >= start && cur < end;
}

// ── Main send function ────────────────────────────────────────────────────────
/**
 * item: NotificationQueue document (plain object)
 * cfg:  org.punchNotify config
 * tz:   org timezone string
 */
async function sendPunchNotification(item, cfg, tz) {
  const brand    = await getBrand();
  const channels = cfg?.channels?.length ? cfg.channels : ['whatsapp', 'sms', 'email'];
  const text     = buildTextMessage(item, tz, brand.appName);
  const subject  = `${item.empName} — ${item.direction === 'IN' ? 'Arrived' : item.direction === 'OUT' ? 'Left' : 'Punched'} · ${fmtTime(item.punchTime, tz)}`;

  let sent = false;

  for (const ch of channels) {
    if (sent) break;
    try {
      if (ch === 'whatsapp' && item.guardianMobile) {
        await sendWhatsApp(item.guardianMobile, item.guardianName || item.empName, text);
        sent = true;
      } else if (ch === 'sms' && item.guardianMobile) {
        await sendSms(item.guardianMobile, text);
        sent = true;
      } else if (ch === 'email' && item.guardianEmail) {
        const html = await buildEmailHtml(item, tz);
        await sendEmail(item.guardianEmail, subject, html, text);
        sent = true;
      }
    } catch (e) {
      // Channel failed — try next
      console.warn(`[notify] ${ch} failed for ${item.empName}: ${e.message}`);
    }
  }

  if (!sent) throw new Error('All channels failed or no contact info available');
  return true;
}

module.exports = { sendPunchNotification, isQuietHour };
