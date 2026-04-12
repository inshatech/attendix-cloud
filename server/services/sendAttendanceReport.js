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

    // First in-punch, last out-punch
    const inLog  = empLogs[0];
    const outLog = empLogs.length > 1 ? empLogs[empLogs.length - 1] : null;
    const inTime = toHHMMtz(inLog.timestamp, tz);
    const outTime = outLog ? toHHMMtz(outLog.timestamp, tz) : null;
    const worked  = workedMins(inLog, outLog);

    // Determine status
    let status = 'present';
    const lateGrace   = emp.graceMinutes || shift?.graceMinutes || 0;
    const halfDayMins = emp.halfDayMinutes || shift?.halfDayMinutes || 240;
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
  present:   { bg: 'rgba(52,211,153,.12)',  border: 'rgba(52,211,153,.3)',  text: '#34d399', label: 'Present'  },
  late:      { bg: 'rgba(251,191,36,.12)',  border: 'rgba(251,191,36,.3)',  text: '#fbbf24', label: 'Late'     },
  'half-day':{ bg: 'rgba(167,139,250,.12)', border: 'rgba(167,139,250,.3)',text: '#a78bfa', label: 'Half Day'  },
  absent:    { bg: 'rgba(248,113,113,.12)', border: 'rgba(248,113,113,.3)', text: '#f87171', label: 'Absent'   },
  'week-off':{ bg: 'rgba(100,116,139,.1)',  border: 'rgba(100,116,139,.25)',text: '#64748b', label: 'Week Off'  },
  holiday:   { bg: 'rgba(56,189,248,.1)',   border: 'rgba(56,189,248,.25)', text: '#38bdf8', label: 'Holiday'   },
};

async function buildEmailHtml(data) {
  const brand = await getBrand();
  const { org, dateStr, rows, present, late, halfDay, absent, weekOff, holiday, holidayName, unlinkedPunches, total } = data;

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.appName}" style="height:28px;width:auto;object-fit:contain;"/>`
    : `<span style="font-size:18px;">📊</span>`;

  const fmtDate = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const summaryCards = [
    { label: 'Present',  value: present,  color: '#34d399' },
    { label: 'Late',     value: late,     color: '#fbbf24' },
    { label: 'Half Day', value: halfDay,  color: '#a78bfa' },
    { label: 'Absent',   value: absent,   color: '#f87171' },
    holiday > 0 ? { label: 'Holiday',  value: holiday,  color: '#38bdf8' } : null,
    { label: 'Week Off', value: weekOff,  color: '#64748b' },
  ].filter(Boolean).map(c => `
    <td style="padding:0 6px;text-align:center;">
      <div style="background:#0d0d1a;border:1px solid #1e1e35;border-radius:10px;padding:12px 16px;min-width:70px;">
        <p style="margin:0;font-size:24px;font-weight:800;color:${c.color};font-family:'Courier New',monospace;">${c.value}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#4a4a72;text-transform:uppercase;letter-spacing:0.1em;">${c.label}</p>
      </div>
    </td>`).join('');

  const tableRows = rows.map(r => {
    const sc = STATUS_COLOR[r.status] || STATUS_COLOR.absent;
    return `<tr style="border-bottom:1px solid #1a1a2e;">
      <td style="padding:9px 12px;font-size:13px;color:#d0d0ec;font-weight:600;">${r.name}</td>
      <td style="padding:9px 8px;font-size:11px;color:#58a6ff;font-family:monospace;">${r.code}</td>
      <td style="padding:9px 8px;font-size:12px;color:#7070a0;">${r.dept}</td>
      <td style="padding:9px 8px;font-size:13px;color:#e0e0f0;font-family:monospace;">${r.inTime || '—'}</td>
      <td style="padding:9px 8px;font-size:13px;color:#e0e0f0;font-family:monospace;">${r.outTime || '—'}</td>
      <td style="padding:9px 8px;font-size:12px;color:#7070a0;font-family:monospace;">${fmtMins(r.worked)}</td>
      <td style="padding:9px 8px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;
          background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};">${sc.label}</span>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070f;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:680px;margin:32px auto;padding:0 12px;">

  <!-- Header -->
  <div style="background:#111121;border:1px solid #1e1e35;border-radius:14px 14px 0 0;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        ${logoBlock}
      </div>
      <div>
        <p style="margin:0;color:#e0e0f0;font-weight:700;font-size:0.9rem;">${brand.appName}</p>
        <p style="margin:2px 0 0;color:#3a3a58;font-size:0.65rem;font-family:monospace;">Daily Attendance Report</p>
      </div>
    </div>
    <div style="text-align:right;">
      <p style="margin:0;color:#7070a0;font-size:0.7rem;font-family:monospace;">${org.name}</p>
      <p style="margin:2px 0 0;color:#4a4a72;font-size:0.65rem;">${fmtDate}</p>
    </div>
  </div>

  <!-- Summary cards -->
  <div style="background:#0d0d1a;border:1px solid #1e1e35;border-top:none;padding:20px 28px;">
    <p style="margin:0 0 14px;color:#4a4a72;font-size:0.65rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;">Summary · ${total} employees</p>
    <table style="border-collapse:collapse;margin:0 -6px;"><tr>${summaryCards}</tr></table>
  </div>

  ${holidayName ? `
  <!-- Holiday banner -->
  <div style="background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.2);border-top:none;padding:11px 28px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:14px;">🎉</span>
    <p style="margin:0;color:#38bdf8;font-size:12px;font-weight:600;">Today is a public holiday: <strong>${holidayName}</strong></p>
  </div>` : ''}

  <!-- Employee table -->
  <div style="background:#111121;border:1px solid #1e1e35;border-top:none;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#0a0a14;border-bottom:1px solid #1e1e35;">
          ${['Employee','Code','Dept','In','Out','Hours','Status'].map(h =>
            `<th style="padding:9px ${h==='Employee'?'12':'8'}px;text-align:left;font-size:10px;font-family:monospace;color:#3a3a58;text-transform:uppercase;letter-spacing:0.1em;">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  ${unlinkedPunches > 0 ? `
  <!-- Unlinked warning -->
  <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);border-top:none;padding:12px 28px;display:flex;align-items:center;gap:10px;">
    <span style="color:#fbbf24;font-size:14px;">⚠</span>
    <p style="margin:0;color:#fbbf24;font-size:12px;">${unlinkedPunches} punch record${unlinkedPunches!==1?'s':''} from unlinked machine users — link employees in the portal to capture them.</p>
  </div>` : ''}

  <!-- Footer -->
  <div style="background:#0a0a14;border:1px solid #1e1e35;border-top:none;border-radius:0 0 14px 14px;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;">
    <p style="margin:0;color:#2a2a42;font-size:10px;">Automated daily report · Do not reply</p>
    <p style="margin:0;color:#2a2a42;font-size:10px;font-family:monospace;">${brand.appName}${brand.companyName ? ` · ${brand.companyName}` : ''}</p>
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
