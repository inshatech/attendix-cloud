'use strict';
/**
 * attendanceReport.js
 * ───────────────────
 * Builds and sends daily attendance summary reports.
 *
 * Exports:
 *   buildReportData(orgId, dateStr, timezone, refs) → reportData
 *   sendDailyReport(orgId, dateStr, timezone, recipients, refs) → { emailSent, waSent, errors }
 */

const mongoose   = require('mongoose');
const Employee   = require('../models/Employee');
const Shift      = require('../models/Shift');
const Organization = require('../models/Organization');
const { sendEmail, sendWhatsApp, getBrand } = require('../notify/engine');

function getHolidayModel() {
  try { return mongoose.model('Holiday'); } catch { return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert Date → HH:MM string in a given timezone */
function toHHMMtz(date, tz) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(date));
}

/** Get UTC date boundaries for a YYYY-MM-DD in a given timezone.
 *  Strategy: format a known UTC time into the target timezone, measure the offset. */
function dayBounds(dateStr, tz) {
  // Find what UTC moment corresponds to midnight of dateStr in tz.
  // We do this by binary-searching isn't needed — we can use the formatter trick:
  // Format a candidate UTC date in the target tz, compare to dateStr 00:00,
  // then apply the offset difference.
  //
  // Simple reliable approach: construct noon UTC for the date, format it in tz to
  // get the tz date, then compute the tz midnight offset from UTC midnight.
  const noonUTC = new Date(`${dateStr}T12:00:00.000Z`);
  // Get the tz offset at that moment: difference between UTC and local time
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(noonUTC);
  // localStr looks like "2026-04-05, 17:30:00"
  const localDate = new Date(localStr.replace(', ', 'T') + 'Z');
  // offset = UTC - local (in ms)
  const offsetMs = noonUTC - localDate;
  // Midnight of dateStr in tz = UTC midnight + offset
  const utcMidnight = new Date(`${dateStr}T00:00:00.000Z`);
  const dayStart    = new Date(utcMidnight.getTime() + offsetMs);
  const dayEnd      = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { dayStart, dayEnd };
}

/** Compute worked minutes between two log timestamps */
function workedMins(inLog, outLog) {
  if (!inLog || !outLog) return 0;
  return Math.max(0, Math.round((new Date(outLog.timestamp) - new Date(inLog.timestamp)) / 60000));
}

/** Format minutes → "Xh Ym" */
function fmtMins(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Build report data ─────────────────────────────────────────────────────────

/**
 * refs: { AttendanceLog, MachineUser }  (injected from app.js)
 */
async function buildReportData(orgId, dateStr, timezone, refs) {
  const tz = timezone || 'Asia/Kolkata';
  const org = await Organization.findOne({ orgId }).lean();
  if (!org?.bridgeId) throw new Error('Organization has no bridge');

  const { AttendanceLog, MachineUser } = refs;

  // Date bounds in org timezone
  const { dayStart, dayEnd } = dayBounds(dateStr, tz);

  // Check if this date is a holiday for the org
  let holidayName = null;
  const HolidayModel = getHolidayModel();
  if (HolidayModel) {
    const hol = await HolidayModel.findOne({ orgId, date: dateStr }).lean().catch(() => null);
    if (hol) holidayName = hol.name;
  }

  // Load employees, shifts, punch logs, machine-user map in parallel
  const [employees, shifts, logs, muList] = await Promise.all([
    Employee.find({ orgId, status: 'active' }).lean(),
    Shift.find({ orgId }).lean(),
    AttendanceLog
      ? AttendanceLog.find({ bridgeId: org.bridgeId, timestamp: { $gte: dayStart, $lte: dayEnd } })
          .sort({ timestamp: 1 }).lean()
      : [],
    MachineUser
      ? MachineUser.find({ bridgeId: org.bridgeId, userId: /^emp-/ })
          .select('userId uid deviceId rawJson.user_id').lean()
      : [],
  ]);

  // Build lookup maps
  const shiftMap = {};
  shifts.forEach(s => { shiftMap[s.shiftId] = s; });

  const uidMap = {};
  muList.forEach(mu => {
    uidMap[`${mu.deviceId}:${mu.uid}`] = mu.userId;
    uidMap[String(mu.uid)]             = mu.userId;
    const rawId = mu.rawJson?.user_id != null ? String(mu.rawJson.user_id) : null;
    if (rawId) {
      uidMap[`${mu.deviceId}:${rawId}`] = mu.userId;
      uidMap[rawId]                     = mu.userId;
    }
  });

  // Group logs by employeeId
  const byEmp = {};
  let unlinkedPunches = 0;
  logs.forEach(log => {
    const key = log.deviceId ? `${log.deviceId}:${log.userId}` : log.userId;
    const empId = uidMap[key] || uidMap[log.userId];
    if (!empId) { unlinkedPunches++; return; }
    if (!byEmp[empId]) byEmp[empId] = [];
    byEmp[empId].push(log);
  });

  // Day-of-week for weekly-off check
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(yr, mo - 1, dy).getDay(); // 0=Sun

  // Build per-employee rows
  const rows = [];
  for (const emp of employees) {
    const empLogs = byEmp[emp.employeeId] || [];
    const shift   = emp.shiftId ? shiftMap[emp.shiftId] : null;
    const weeklyOff = emp.weeklyOffDays || shift?.weeklyOffDays || [0];

    const name = emp.displayName || `${emp.firstName} ${emp.lastName || ''}`.trim();

    if (weeklyOff.includes(dayOfWeek)) {
      rows.push({ name, code: emp.employeeCode, dept: emp.department || '—', inTime: null, outTime: null, worked: 0, status: 'week-off' });
      continue;
    }

    if (!empLogs.length) {
      // Holiday takes precedence over absent
      const noShowStatus = holidayName ? 'holiday' : 'absent';
      rows.push({ name, code: emp.employeeCode, dept: emp.department || '—', inTime: null, outTime: null, worked: 0, status: noShowStatus });
      continue;
    }

    // Sort by timestamp — first punch = IN, last punch = OUT (punch type ignored)
    const sorted  = [...empLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const inLog   = sorted[0];
    const outLog  = sorted.length > 1 ? sorted[sorted.length - 1] : null;
    const inTime  = toHHMMtz(inLog.timestamp, tz);
    const outTime = outLog ? toHHMMtz(outLog.timestamp, tz) : null;

    // Raw worked = last − first, then deduct unpaid breaks from shift config
    let worked = workedMins(inLog, outLog);
    if (outLog && shift?.breaks?.length) {
      const breakDeductMins = shift.breaks
        .filter(b => !b.isPaid && b.startTime && b.endTime)
        .reduce((sum, b) => {
          const [bsh, bsm] = b.startTime.split(':').map(Number);
          const [beh, bem] = b.endTime.split(':').map(Number);
          return sum + Math.max(0, (beh * 60 + bem) - (bsh * 60 + bsm));
        }, 0);
      worked = Math.max(0, worked - breakDeductMins);
    }

    // Determine status — same thresholds as attendance.js computeStatus
    let status = 'present';
    const lateGrace   = emp.graceMinutes   || shift?.attendanceRules?.graceLateMinutes   || shift?.graceMinutes   || 0;
    const halfDayMins = emp.halfDayMinutes || shift?.attendanceRules?.halfDayAfterMinutes || shift?.halfDayMinutes || 240;
    if (shift?.defaultInTime && inTime) {
      const [sh, sm] = shift.defaultInTime.split(':').map(Number);
      const [ih, im] = inTime.split(':').map(Number);
      const lateBy   = (ih * 60 + im) - (sh * 60 + sm);
      if (lateBy > lateGrace) {
        status = worked < halfDayMins ? 'half-day' : 'late';
      }
    }
    if (worked > 0 && worked < halfDayMins && status === 'present') status = 'half-day';

    rows.push({ name, code: emp.employeeCode, dept: emp.department || '—', inTime, outTime, worked, status });
  }

  const present  = rows.filter(r => r.status === 'present').length;
  const late     = rows.filter(r => r.status === 'late').length;
  const halfDay  = rows.filter(r => r.status === 'half-day').length;
  const absent   = rows.filter(r => r.status === 'absent').length;
  const weekOff  = rows.filter(r => r.status === 'week-off').length;
  const holiday  = rows.filter(r => r.status === 'holiday').length;

  return { org, dateStr, tz, rows, present, late, halfDay, absent, weekOff, holiday, holidayName, unlinkedPunches, total: employees.length };
}

// ── Build HTML email ──────────────────────────────────────────────────────────

const STATUS_COLOR = {
  present:   { bg: 'rgba(22,163,74,.1)',   border: 'rgba(22,163,74,.3)',   text: '#16a34a', label: 'Present'  },
  late:      { bg: 'rgba(217,119,6,.1)',   border: 'rgba(217,119,6,.3)',   text: '#d97706', label: 'Late'     },
  'half-day':{ bg: 'rgba(124,58,237,.1)',  border: 'rgba(124,58,237,.3)',  text: '#7c3aed', label: 'Half Day' },
  absent:    { bg: 'rgba(220,38,38,.1)',   border: 'rgba(220,38,38,.3)',   text: '#dc2626', label: 'Absent'   },
  'week-off':{ bg: 'rgba(100,116,139,.1)', border: 'rgba(100,116,139,.25)',text: '#475569', label: 'Week Off' },
  holiday:   { bg: 'rgba(2,132,199,.1)',   border: 'rgba(2,132,199,.25)',  text: '#0284c7', label: 'Holiday'  },
};

async function buildEmailHtml(data) {
  const brand = await getBrand();
  const { org, dateStr, rows, present, late, halfDay, absent, weekOff, holiday, holidayName, unlinkedPunches, total } = data;

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.appName}" style="height:28px;width:auto;object-fit:contain;"/>`
    : `<span style="font-size:18px;">📊</span>`;

  const fmtDate = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const summaryCards = [
    { label: 'Present',  value: present,  color: '#16a34a' },
    { label: 'Late',     value: late,     color: '#d97706' },
    { label: 'Half Day', value: halfDay,  color: '#7c3aed' },
    { label: 'Absent',   value: absent,   color: '#dc2626' },
    holiday > 0 ? { label: 'Holiday', value: holiday, color: '#0284c7' } : null,
    { label: 'Week Off', value: weekOff,  color: '#64748b' },
  ].filter(Boolean).map(c => `
    <div class="sc" style="flex:1;min-width:0;background:#f0f2ff;border:1px solid #dde0f0;border-radius:10px;padding:12px 8px;text-align:center;box-sizing:border-box;">
      <p style="margin:0;font-size:22px;font-weight:800;color:${c.color};font-family:'Courier New',monospace;line-height:1;">${c.value}</p>
      <p style="margin:5px 0 0;font-size:9px;color:#5050a0;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">${c.label}</p>
    </div>`).join('');

  const tableRows = rows.map(r => {
    const sc = STATUS_COLOR[r.status] || STATUS_COLOR.absent;
    return `<tr class="tr-sep" style="border-bottom:1px solid #eeeef8;">
      <td class="tbl-name" style="padding:9px 12px;font-size:13px;color:#1a1a2e;font-weight:600;">${r.name}</td>
      <td class="tbl-cell hide-mob" style="padding:9px 8px;font-size:11px;color:#58a6ff;font-family:monospace;">${r.code}</td>
      <td class="tbl-cell hide-mob" style="padding:9px 8px;font-size:12px;color:#5050a0;">${r.dept}</td>
      <td class="tbl-cell" style="padding:9px 8px;font-size:13px;color:#1a1a2e;font-family:monospace;">${r.inTime || '—'}</td>
      <td class="tbl-cell" style="padding:9px 8px;font-size:13px;color:#1a1a2e;font-family:monospace;">${r.outTime || '—'}</td>
      <td class="tbl-cell" style="padding:9px 8px;font-size:12px;color:#5050a0;font-family:monospace;">${fmtMins(r.worked)}</td>
      <td class="tbl-cell" style="padding:9px 8px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;
          background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};">${sc.label}</span>
      </td>
    </tr>`;
  }).join('');

  const year = new Date().getFullYear();
  const poweredBy = brand.companyName || 'Insha Technologies';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px) {
      .aw   { padding:0 4px !important; margin:10px auto !important; }
      .ah   { padding:14px 14px !important; flex-direction:column !important; align-items:flex-start !important; gap:8px !important; }
      .ah-right { display:none !important; }
      .as   { padding:14px 14px !important; }
      .at   { padding:0 !important; }
      .af   { padding:12px 14px !important; }
      .cards-wrap { flex-wrap:wrap !important; gap:6px !important; }
      .sc   { flex:1 1 28% !important; padding:10px 6px !important; }
      .hide-mob { display:none !important; }
      .tbl-cell { padding:8px 6px !important; font-size:12px !important; }
      .tbl-name { padding:8px 10px !important; font-size:13px !important; }
    }
    @media (prefers-color-scheme:dark) {
      .outer { background:#07070f !important; }
      .ah    { background:#111121 !important; border-color:#1e1e35 !important; }
      .as    { background:#0d0d1a !important; border-color:#1e1e35 !important; }
      .at    { background:#111121 !important; border-color:#1e1e35 !important; }
      .af    { background:#0a0a14 !important; border-color:#1e1e35 !important; }
      .sc    { background:#0d0d1a !important; border-color:#1e1e35 !important; }
      .c-name { color:#e0e0f0 !important; }
      .c-sub  { color:#5050a0 !important; }
      .c-val  { color:#e0e0f0 !important; }
      .c-hdr  { color:#3a3a58 !important; background:#0a0a14 !important; }
      .c-foot { color:#5050a0 !important; }
      .tr-sep { border-color:#1a1a2e !important; }
      .th-row { background:#0a0a14 !important; border-color:#1e1e35 !important; }
    }
  </style>
</head>
<body class="outer" style="margin:0;padding:0;background:#f0f0f8;font-family:'Segoe UI',Arial,sans-serif;">
<div class="aw" style="max-width:680px;margin:32px auto;padding:0 12px;">

  <!-- Header -->
  <div class="ah" style="background:#ffffff;border:1px solid #dde0f0;border-radius:14px 14px 0 0;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        ${logoBlock}
      </div>
      <div>
        <p class="c-name" style="margin:0;color:#1a1a2e;font-weight:700;font-size:0.9rem;">${brand.appName}</p>
        <p class="c-sub" style="margin:2px 0 0;color:#9090b0;font-size:0.65rem;font-family:monospace;">Daily Attendance Report</p>
      </div>
    </div>
    <div class="ah-right" style="text-align:right;">
      <p class="c-sub" style="margin:0;color:#5050a0;font-size:0.7rem;font-family:monospace;">${org.name}</p>
      <p class="c-sub" style="margin:2px 0 0;color:#9090b0;font-size:0.65rem;">${fmtDate}</p>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="as" style="background:#ffffff;border:1px solid #dde0f0;border-top:none;padding:20px 28px;">
    <p class="c-sub" style="margin:0 0 14px;color:#5050a0;font-size:0.65rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;">Summary · ${total} employees · ${org.name} · ${fmtDate}</p>
    <div class="cards-wrap" style="display:flex;gap:8px;">${summaryCards}</div>
  </div>

  ${holidayName ? `
  <!-- Holiday banner -->
  <div style="background:rgba(2,132,199,.07);border:1px solid rgba(2,132,199,.2);border-top:none;padding:11px 20px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:14px;">🎉</span>
    <p style="margin:0;color:#0284c7;font-size:12px;font-weight:600;">Today is a public holiday: <strong>${holidayName}</strong></p>
  </div>` : ''}

  <!-- Employee table -->
  <div class="at" style="background:#ffffff;border:1px solid #dde0f0;border-top:none;overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;min-width:320px;">
      <thead>
        <tr class="th-row" style="background:#f0f2ff;border-bottom:1px solid #dde0f0;">
          <th class="c-hdr tbl-name" style="padding:9px 12px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">Employee</th>
          <th class="c-hdr tbl-cell hide-mob" style="padding:9px 8px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">Code</th>
          <th class="c-hdr tbl-cell hide-mob" style="padding:9px 8px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">Dept</th>
          <th class="c-hdr tbl-cell" style="padding:9px 8px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">In</th>
          <th class="c-hdr tbl-cell" style="padding:9px 8px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">Out</th>
          <th class="c-hdr tbl-cell" style="padding:9px 8px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">Hrs</th>
          <th class="c-hdr tbl-cell" style="padding:9px 8px;text-align:left;font-size:10px;font-family:monospace;color:#9090b0;text-transform:uppercase;letter-spacing:0.1em;">Status</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  ${unlinkedPunches > 0 ? `
  <!-- Unlinked warning -->
  <div style="background:rgba(217,119,6,.06);border:1px solid rgba(217,119,6,.2);border-top:none;padding:12px 20px;display:flex;align-items:center;gap:10px;">
    <span style="color:#d97706;font-size:14px;">⚠</span>
    <p style="margin:0;color:#d97706;font-size:12px;">${unlinkedPunches} punch record${unlinkedPunches!==1?'s':''} from unlinked machine users — link employees in the portal to capture them.</p>
  </div>` : ''}

  <!-- Footer -->
  <div class="af" style="background:#f8f8fc;border:1px solid #dde0f0;border-top:none;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;">
    <p class="c-foot" style="margin:0;color:#9090b0;font-size:10px;">Automated daily report · Do not reply</p>
    <p class="c-foot" style="margin:6px 0 0;color:#9090b0;font-size:10px;">
      © ${year} ${brand.appName} &nbsp;|&nbsp; ❤️ Powered by: <a href="https://www.inshatech.com" style="color:#58a6ff;text-decoration:none;font-weight:700;">${poweredBy}</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

// ── Build WhatsApp text ───────────────────────────────────────────────────────

function buildWhatsAppText(data) {
  const { org, dateStr, present, late, halfDay, absent, weekOff, holiday, holidayName, unlinkedPunches, total } = data;
  const fmtDate = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  const lines = [
    `📊 *Daily Attendance — ${org.name}*`,
    `📅 ${fmtDate}`,
    holidayName ? `🎉 Holiday: *${holidayName}*` : null,
    '',
    `✅ Present:  ${present}`,
    late     > 0 ? `⏰ Late:     ${late}`      : null,
    halfDay  > 0 ? `🕐 Half Day: ${halfDay}`   : null,
    absent   > 0 ? `❌ Absent:   ${absent}`    : null,
    holiday  > 0 ? `🎉 Holiday:  ${holiday}`   : null,
    weekOff  > 0 ? `🔵 Week Off: ${weekOff}`   : null,
    '',
    `👥 Total employees: ${total}`,
    unlinkedPunches > 0 ? `⚠ Unlinked punches: ${unlinkedPunches}` : null,
  ].filter(l => l !== null);
  return lines.join('\n');
}

// ── Send report ───────────────────────────────────────────────────────────────

/**
 * refs: { AttendanceLog, MachineUser }
 * recipients: [{ name, email, mobile }]
 */
async function sendDailyReport(orgId, dateStr, timezone, recipients, refs) {
  const data   = await buildReportData(orgId, dateStr, timezone, refs);
  const errors = [];
  let emailSent = 0, waSent = 0;

  const brand   = await getBrand();
  const subject = `${data.org.name} — Attendance Report · ${dateStr}`;

  // Check if WhatsApp plugin is enabled
  let waEnabled = false;
  try {
    const { Plugin } = require('../models/Plugin');
    const wap = await Plugin.findOne({ name: 'whatsapp' }).lean();
    waEnabled = !!(wap?.enabled);
  } catch {}

  // Build email HTML once
  let html;
  try { html = await buildEmailHtml(data); } catch (e) { errors.push(`html-build: ${e.message}`); }

  const waText = buildWhatsAppText(data);

  for (const r of (recipients || [])) {
    // Send email
    if (r.email && html) {
      try {
        await sendEmail(r.email, subject, html, waText);
        emailSent++;
      } catch (e) { errors.push(`email(${r.email}): ${e.message}`); }
    }
    // Send WhatsApp if plugin enabled and mobile provided
    if (r.mobile && waEnabled) {
      try {
        await sendWhatsApp(r.mobile, r.name || data.org.name, waText);
        waSent++;
      } catch (e) { errors.push(`whatsapp(${r.mobile}): ${e.message}`); }
    }
  }

  return { emailSent, waSent, errors, summary: { present: data.present, absent: data.absent, late: data.late } };
}

module.exports = { buildReportData, sendDailyReport };
