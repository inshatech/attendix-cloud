'use strict';
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { requireAuth } = require('../auth/middleware');
const { generalApiLimiter } = require('../auth/rateLimits');
const Organization = require('../models/Organization');
const Employee     = require('../models/Employee');
const Shift        = require('../models/Shift');
const LeavePolicy  = require('../models/LeavePolicy');

// Lazy-load Holiday model (defined in holidays.js)
function getHolidayModel() {
  try { return mongoose.model('Holiday'); } catch { return null; }
}

let _AttendanceLog, _Device, _MachineUser, _bridgeMap;
function init(refs) {
  _AttendanceLog = refs.AttendanceLog;
  _Device        = refs.Device;
  _MachineUser   = refs.MachineUser;
  _bridgeMap     = refs.bridgeMap;
}

// ── Manual Attendance Model ───────────────────────────────────────────────────
const ManualAttSchema = new mongoose.Schema({
  manualId:      { type:String, unique:true },
  orgId:         { type:String, required:true, index:true },
  employeeId:    { type:String, required:true, index:true },
  date:          { type:String, required:true },   // YYYY-MM-DD
  inTime:        { type:String, default:null },     // HH:MM
  outTime:       { type:String, default:null },
  workedMinutes: { type:Number, default:null },
  status:        { type:String, default:'present' },
  leaveType:     { type:String, default:null },
  leaveHalf:     { type:String, default:null },
  reason:        { type:String, default:'' },
  approvedBy:    { type:String, default:null },
}, { timestamps:true });

const ManualAtt = mongoose.models.ManualAttendance || mongoose.model('ManualAttendance', ManualAttSchema);

// ── Helper — owner or admin/support ──────────────────────────────────────────
async function getOrg(orgId, userId, role) {
  if (['admin','support'].includes(role)) return Organization.findOne({ orgId }).lean();
  return Organization.findOne({ orgId, ownerId: userId }).lean();
}

// ── Helper — build employee lookup map { employeeId -> emp } ──────────────────
async function buildEmpMap(orgId) {
  const emps = await Employee.find({ orgId }).lean();
  const map = {};
  emps.forEach(e => { map[e.employeeId] = e; });
  return map;
}

// ── Helper — build shift map { shiftId -> shift } ────────────────────────────
async function buildShiftMap(orgId) {
  const shifts = await Shift.find({ orgId }).lean();
  const map = {};
  shifts.forEach(s => { map[s.shiftId] = s; });
  return map;
}

// ── Helper — YYYY-MM-DD in server local time (avoids UTC offset shifting date) ─
function localDateStr(date) {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Helper — parse HH:MM from a Date ─────────────────────────────────────────
function toHHMM(date) {
  if (!date) return null;
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── Helper — find half-day weekday entry for a given day number ───────────────
function getHalfDayEntry(shift, dayOfWeek) {
  if (dayOfWeek == null || !Array.isArray(shift?.halfDayWeekDays)) return null;
  return shift.halfDayWeekDays.find(h => h.day === dayOfWeek) || null;
}

// ── Helper — Professional Tax from org PT slabs ───────────────────────────────
// slabs: [{ min, max, pt }] sorted ascending by min. First match wins.
// max: null = no upper limit
function calcPT(monthlyGross, slabs) {
  if (!slabs || !slabs.length) return monthlyGross > 10000 ? 200 : 0;
  for (const s of slabs) {
    if (monthlyGross >= s.min && (s.max == null || monthlyGross <= s.max)) return s.pt;
  }
  return 0;
}

// ── Helper — LOP weight for a single absent day ───────────────────────────────
// Half-day weekdays (e.g. scheduled Friday 09:30–14:00) count as 0.5 LOP when absent.
// All other working days count as 1.0 LOP.
function lopWeight(shift, dayOfWeek) {
  return getHalfDayEntry(shift, dayOfWeek) ? 0.5 : 1.0;
}

// ── Helper — compute attendance status for a day ──────────────────────────────
// dayOfWeek: 0=Sun…6=Sat — used to check halfDayWeekDays
function computeStatus(emp, shift, inTime, outTime, workedMinutes, dayOfWeek) {
  // If this weekday is a defined half-day weekday → half-day regardless of hours
  const hdEntry = getHalfDayEntry(shift, dayOfWeek);
  if (hdEntry) return inTime ? 'half-day' : 'absent';
  if (!inTime) return 'absent';
  const lateGrace   = emp?.graceMinutes   || shift?.attendanceRules?.graceLateMinutes   || shift?.graceMinutes   || 0;
  const halfDayMins = emp?.halfDayMinutes || shift?.attendanceRules?.halfDayAfterMinutes || shift?.halfDayMinutes || 240;
  // Check late — compare against shift defaultInTime
  if (shift?.defaultInTime) {
    const [sh, sm] = shift.defaultInTime.split(':').map(Number);
    const [ih, im] = inTime.split(':').map(Number);
    const lateBy = (ih * 60 + im) - (sh * 60 + sm);
    if (lateBy > lateGrace) {
      if (workedMinutes < halfDayMins) return 'half-day';
      return 'late';
    }
  }
  if (workedMinutes < halfDayMins) return 'half-day';
  return 'present';
}

// ── Helper — compute late minutes ────────────────────────────────────────────
// Uses half-day entry's inTime when the day is a half-day weekday
function computeLate(emp, shift, inTime, dayOfWeek) {
  if (!inTime) return 0;
  const hdEntry    = getHalfDayEntry(shift, dayOfWeek);
  const shiftInTime = hdEntry?.inTime || shift?.defaultInTime;
  if (!shiftInTime) return 0;
  const grace = emp?.graceMinutes || shift?.attendanceRules?.graceLateMinutes || shift?.graceMinutes || 0;
  const [sh, sm] = shiftInTime.split(':').map(Number);
  const [ih, im] = inTime.split(':').map(Number);
  const late = (ih * 60 + im) - (sh * 60 + sm) - grace;
  return Math.max(0, late);
}

// ── Helper — resolve punchType with rawJson fallback ─────────────────────────
const _PUNCH_LABELS = {'check-in':0,'checkin':0,'in':0,'check-out':1,'checkout':1,'out':1,'break-out':2,'breakout':2,'break-in':3,'breakin':3,'ot-in':4,'otin':4,'ot-out':5,'otout':5};
function getPunchType(log) {
  if (log.punchType != null) return log.punchType;
  const raw = log.rawJson || {};
  if (raw.state_code != null) return Number(raw.state_code);
  if (raw.punch_type != null) {
    const m = _PUNCH_LABELS[String(raw.punch_type).toLowerCase().replace(/[\s_]+/g,'-')];
    if (m !== undefined) return m;
  }
  return null;
}

// ── Helper — full shift detail for client ─────────────────────────────────────
function shiftDetail(shift) {
  if (!shift) return null;
  return {
    name: shift.name, color: shift.color,
    defaultInTime: shift.defaultInTime || null,
    defaultOutTime: shift.defaultOutTime || null,
    durationMinutes: shift.durationMinutes || 480,
    isNightShift: shift.isNightShift || false,
    weeklyOffDays: shift.weeklyOffDays || [],
    halfDayWeekDays: shift.halfDayWeekDays || [],
    breaks: shift.breaks || [],
    attendanceRules: shift.attendanceRules || {},
    overtimeRules: shift.overtimeRules || {},
  };
}

// ── Helper — compute overtime minutes ─────────────────────────────────────────
function computeOT(shift, workedMinutes) {
  const ot = shift?.overtimeRules;
  if (!ot?.enabled) return 0;
  const after = ot.afterMinutes || 0;
  const base  = shift.durationMinutes || 480;
  const excess = workedMinutes - base - after;
  if (excess <= 0) return 0;
  return ot.maxMinutesPerDay ? Math.min(excess, ot.maxMinutesPerDay) : excess;
}

// ── Shared UID→empId helpers (used by today / range / payroll / logs) ─────────

/** Build { "deviceId:uid": empId, uid: empId } lookup from a MachineUser list. */
function buildUidMap(muList) {
  const map = {};
  muList.forEach(mu => {
    map[`${mu.deviceId}:${mu.uid}`] = mu.userId;
    map[String(mu.uid)]             = mu.userId;
  });
  return map;
}

/** Resolve a raw punch log to an employeeId using a uidMap. */
function resolveEmpId(log, uidMap) {
  const key = log.deviceId ? `${log.deviceId}:${log.userId}` : log.userId;
  return uidMap[key] || uidMap[log.userId] || null;
}

/** Group punch logs into { empId: { 'YYYY-MM-DD': [logs] } }. */
function groupByEmpDate(logs, uidMap) {
  const byEmpDate = {};
  logs.forEach(log => {
    const eid = resolveEmpId(log, uidMap);
    if (!eid) return;
    const date = localDateStr(log.timestamp);
    if (!byEmpDate[eid])       byEmpDate[eid]       = {};
    if (!byEmpDate[eid][date]) byEmpDate[eid][date] = [];
    byEmpDate[eid][date].push(log);
  });
  return byEmpDate;
}

// ── Leave balance helpers ─────────────────────────────────────────────────────

const LEAVE_STATUSES = new Set(['on-leave','paid-leave','sick-leave','comp-off']);

/** Map a leave status + optional leaveType to the correct leaveBalance key. */
const STATUS_LEAVE_KEY = { 'sick-leave':'sick', 'paid-leave':'earned', 'comp-off':'other', 'on-leave':'casual' };
function leaveKey(status, leaveType) {
  const valid = ['casual','sick','earned','maternity','paternity','other'];
  if (leaveType && valid.includes(leaveType)) return leaveType;
  return STATUS_LEAVE_KEY[status] || null;
}

/**
 * Adjust an employee's leaveBalance.
 * delta = -1 to deduct (marking leave), +1 to restore (removing leave).
 * Clamps balance at 0 so it never goes negative from restores that exceed current value.
 */
async function adjustLeaveBalance(employeeId, status, leaveType, leaveHalf, delta) {
  const key = leaveKey(status, leaveType);
  if (!key) return;
  const amount = (leaveHalf === 'first' || leaveHalf === 'second') ? 0.5 * delta : 1 * delta;
  await Employee.updateOne({ employeeId }, { $inc: { [`leaveBalance.${key}`]: amount } });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TODAY
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/organizations/:orgId/attendance/today', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
    const { deviceId } = req.query;

    // All active employees
    const [empMap, shiftMap] = await Promise.all([
      buildEmpMap(req.params.orgId),
      buildShiftMap(req.params.orgId),
    ]);

    // Today's punch logs
    if (!org.bridgeId) return res.json({ status:'success', total:0, present:0, late:0, halfDay:0, absent:0, onLeave:0, holiday:0, weekOff:0, records:[], recentPunches:[], holidayName:null });
    const logFilter = { bridgeId: org.bridgeId, timestamp: { $gte: todayStart, $lte: todayEnd } };
    if (deviceId) logFilter.deviceId = deviceId;

    const logs = _AttendanceLog
      ? await _AttendanceLog.find(logFilter).sort({ timestamp: 1 }).lean()
      : [];

    // Map device userId (e.g. "5") -> employeeId (e.g. "emp-abc123") via MachineUser
    // MachineUser.userId = employeeId when linked (starts with emp-)
    const muList = _MachineUser
      ? await _MachineUser.find({ bridgeId: org.bridgeId, userId: { $regex: /^emp-/ } }).select('userId uid deviceId').lean()
      : [];
    const deviceUidToEmpId = buildUidMap(muList);

    // Group logs by employeeId using MachineUser mapping
    const byEmp = {};
    logs.forEach(log => {
      const empId = resolveEmpId(log, deviceUidToEmpId);
      if (!empId) return; // unlinked machine user — skip
      if (!byEmp[empId]) byEmp[empId] = [];
      byEmp[empId].push(log);
    });

    // Manual overrides for today
    const todayStr = localDateStr(todayStart);
    const manuals  = await ManualAtt.find({ orgId: req.params.orgId, date: todayStr }).lean();
    const manualByEmp = {};
    manuals.forEach(m => { manualByEmp[m.employeeId] = m; });

    // Check if today is a holiday — do this BEFORE building records
    let holidayName = null;
    const HolidayModel = getHolidayModel();
    if (HolidayModel) {
      const holiday = await HolidayModel.findOne({ orgId: req.params.orgId, date: todayStr }).lean().catch(() => null);
      if (holiday) holidayName = holiday.name;
    }
    const isTodayHoliday = !!holidayName;

    // For monthly late allowance: fetch this month's logs/manuals to count prior lates per employee
    const todayDow   = new Date().getDay();
    const monthStart = new Date(todayStart); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const monthStartStr = localDateStr(monthStart);

    // Fetch all logs this month up to (but not including) today for late-count computation
    const monthLogsRaw = todayStart > monthStart && org.bridgeId
      ? (_AttendanceLog ? await _AttendanceLog.find({ bridgeId: org.bridgeId, timestamp: { $gte: monthStart, $lt: todayStart } }).sort({ timestamp:1 }).lean() : [])
      : [];
    // Group month logs by empId+date
    const monthByEmpDate = groupByEmpDate(monthLogsRaw, deviceUidToEmpId);
    // Fetch manual overrides for this month (prior to today)
    const monthManuals = await ManualAtt.find({ orgId: req.params.orgId, date: { $gte: monthStartStr, $lt: todayStr } }).lean();
    const monthManualByEmpDate = {};
    monthManuals.forEach(m => {
      if (!monthManualByEmpDate[m.employeeId]) monthManualByEmpDate[m.employeeId] = {};
      monthManualByEmpDate[m.employeeId][m.date] = m;
    });

    // Compute prior-lates-this-month per employee (raw late status, before allowance is applied)
    function countMonthLates(empId, emp, shift) {
      const empDates = monthByEmpDate[empId] || {};
      let lates = 0;
      const cur = new Date(monthStart);
      while (cur < todayStart) {
        const date = localDateStr(cur);
        const dow  = cur.getDay();
        const wOff = emp?.weeklyOffDays || shift?.weeklyOffDays || [0];
        cur.setDate(cur.getDate() + 1);
        if (wOff.includes(dow)) continue;
        const man = monthManualByEmpDate[empId]?.[date];
        if (man) { if (man.status === 'late') lates++; continue; }
        const dayLogs = empDates[date] || [];
        if (!dayLogs.length) continue;
        const inLog  = dayLogs.find(l => { const pt=getPunchType(l); return pt===0||pt===4; }) || dayLogs[0];
        const outLog = [...dayLogs].reverse().find(l => { const pt=getPunchType(l); return pt===1||pt===5; });
        const inT    = toHHMM(inLog?.timestamp);
        const outT   = outLog ? toHHMM(outLog.timestamp) : null;
        const wMins  = (outLog && inLog) ? Math.round((new Date(outLog.timestamp)-new Date(inLog.timestamp))/60000) : 0;
        const s      = computeStatus(emp, shift, inT, outT, wMins, dow);
        if (s === 'late') lates++;
      }
      return lates;
    }

    // Build per-employee records
    const records = [];
    const allEmpIds = new Set([...Object.keys(empMap), ...Object.keys(byEmp)]);

    for (const empId of allEmpIds) {
      const emp   = empMap[empId];
      if (!emp || emp.status !== 'active') continue;
      const shift = emp.shiftId ? shiftMap[emp.shiftId] : null;

      // Check weekly off
      const weeklyOff = emp.weeklyOffDays || shift?.weeklyOffDays || [0];
      const empName = emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim();
      const empBase = { employeeId: empId, name: empName, code: emp.employeeCode, department: emp.department, photo: emp.photoUrl, gender: emp.gender || null, shift: shiftDetail(shift) };
      if (weeklyOff.includes(todayDow)) {
        records.push({ ...empBase, inTime: null, outTime: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, status: 'week-off', isManual: false, punches: [] });
        continue;
      }

      // Manual override takes priority
      const manual = manualByEmp[empId];
      if (manual) {
        records.push({ ...empBase, inTime: manual.inTime, outTime: manual.outTime, workedMinutes: manual.workedMinutes || 0, lateMinutes: 0, overtimeMinutes: 0, status: manual.status, isManual: true, manualId: manual.manualId, reason: manual.reason, punches: [] });
        continue;
      }

      const empLogs = byEmp[empId] || [];
      if (!empLogs.length) {
        const noShowStatus = isTodayHoliday ? 'holiday' : 'absent';
        records.push({ ...empBase, inTime: null, outTime: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, status: noShowStatus, isManual: false, punches: [] });
        continue;
      }

      // First in, last out
      const inLog  = empLogs.find(l => { const pt=getPunchType(l); return pt===0||pt===4; }) || empLogs[0];
      const outLog = [...empLogs].reverse().find(l => { const pt=getPunchType(l); return pt===1||pt===5; });
      const inTime  = toHHMM(inLog?.timestamp);
      const outTime = outLog ? toHHMM(outLog.timestamp) : null;
      const workedMinutes = (outLog && inLog)
        ? Math.round((new Date(outLog.timestamp) - new Date(inLog.timestamp)) / 60000)
        : 0;
      let status         = computeStatus(emp, shift, inTime, outTime, workedMinutes, todayDow);
      const lateMinutes  = computeLate(emp, shift, inTime, todayDow);
      const overtimeMinutes = computeOT(shift, workedMinutes);

      // Apply monthly late allowance: if today would be 'late' and prior lates < allowance → present
      if (status === 'late') {
        const allowance = shift?.attendanceRules?.monthlyLateAllowance || 0;
        if (allowance > 0) {
          const priorLates = countMonthLates(empId, emp, shift);
          if (priorLates < allowance) status = 'present'; // pardon this late
        }
      }

      records.push({ ...empBase, inTime, outTime, workedMinutes, lateMinutes, overtimeMinutes, status, isManual: false,
        punches: empLogs.map(l => ({ punchType: getPunchType(l), time: toHHMM(l.timestamp), deviceId: l.deviceId })) });
    }

    // Summary counts
    const summary = { total: records.length, present: 0, late: 0, halfDay: 0, absent: 0, onLeave: 0, holiday: 0, weekOff: 0 };
    records.forEach(r => {
      if (r.status === 'present')                                          summary.present++;
      else if (r.status === 'late')                                        summary.late++;
      else if (r.status === 'half-day')                                    summary.halfDay++;
      else if (r.status === 'absent')                                      summary.absent++;
      else if (['on-leave','paid-leave','sick-leave','comp-off'].includes(r.status)) summary.onLeave++;
      else if (r.status === 'holiday')                                     summary.holiday++;
      else if (r.status === 'week-off')                                    summary.weekOff++;
    });

    // Recent punches with employee info (for live feed)
    const recentPunches = logs.slice(-20).reverse().map(l => {
      const key = l.deviceId ? `${l.deviceId}:${l.userId}` : l.userId;
      const empId = deviceUidToEmpId[key] || deviceUidToEmpId[l.userId];
      const emp = empId ? empMap[empId] : null;
      return { ...l, punchType: getPunchType(l), employee: emp ? { name: emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim(), code: emp.employeeCode, photo: emp.photoUrl } : null };
    });

    res.json({
      status: 'success',
      ...summary,
      records,
      recentPunches,
      holidayName,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DATE RANGE REPORT
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/organizations/:orgId/attendance/range', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { startDate, endDate, deviceId, department } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const start = new Date(startDate + 'T00:00:00');
    const end   = new Date(endDate   + 'T23:59:59.999');

    const [empMap, shiftMap] = await Promise.all([
      buildEmpMap(req.params.orgId),
      buildShiftMap(req.params.orgId),
    ]);

    // All logs in range
    if (!org.bridgeId) return res.json({ status:'success', startDate, endDate, totalDays:0, data:[] });
    const logFilter = { bridgeId: org.bridgeId, timestamp: { $gte: start, $lte: end } };
    if (deviceId) logFilter.deviceId = deviceId;
    const logs = _AttendanceLog
      ? await _AttendanceLog.find(logFilter).sort({ timestamp: 1 }).lean()
      : [];

    // Map device userId -> employeeId via MachineUser
    const muList2 = _MachineUser
      ? await _MachineUser.find({ bridgeId: org.bridgeId, userId: { $regex: /^emp-/ } }).select('userId uid deviceId').lean()
      : [];
    const duidToEmpId = buildUidMap(muList2);

    // Group logs by employeeId + date using MachineUser mapping
    const byEmpDate = groupByEmpDate(logs, duidToEmpId);

    // Manual overrides in range
    const manuals = await ManualAtt.find({ orgId: req.params.orgId, date: { $gte: startDate, $lte: endDate } }).lean();
    const manualByEmpDate = {};
    manuals.forEach(m => {
      if (!manualByEmpDate[m.employeeId]) manualByEmpDate[m.employeeId] = {};
      manualByEmpDate[m.employeeId][m.date] = m;
    });

    // Build date array
    const dates = [];
    const cur = new Date(start);
    while (cur <= end) { dates.push(localDateStr(cur)); cur.setDate(cur.getDate()+1); }

    // Load all holidays in this date range so we can mark holiday days correctly
    const HolidayModel2 = getHolidayModel();
    const holidayMap = new Map(); // date → name
    if (HolidayModel2) {
      const hols = await HolidayModel2.find({
        orgId: req.params.orgId,
        date: { $gte: startDate, $lte: endDate },
      }).select('date name').lean().catch(() => []);
      hols.forEach(h => holidayMap.set(h.date, h.name || 'Holiday'));
    }

    // Pre-compute raw lates before range start (for monthly late allowance)
    // Only needed when range starts mid-month
    const rangeStartMonth = startDate.substring(0, 7);  // 'YYYY-MM'
    const monthFirstDay   = `${rangeStartMonth}-01`;
    const preLatesByEmp   = {}; // { empId: { 'YYYY-MM': rawLateCount } }
    if (startDate > monthFirstDay && org.bridgeId && _AttendanceLog) {
      const preStart = new Date(`${monthFirstDay}T00:00:00`);
      const preLogs  = await _AttendanceLog.find({ bridgeId: org.bridgeId, timestamp: { $gte: preStart, $lt: start } }).sort({ timestamp:1 }).lean();
      const preByEmpDate = groupByEmpDate(preLogs, duidToEmpId);
      const preManuals = await ManualAtt.find({ orgId: req.params.orgId, date: { $gte: monthFirstDay, $lt: startDate } }).lean();
      const preManByEmpDate = {};
      preManuals.forEach(m => {
        if (!preManByEmpDate[m.employeeId]) preManByEmpDate[m.employeeId] = {};
        preManByEmpDate[m.employeeId][m.date] = m;
      });
      for (const empId of Object.keys(empMap)) {
        const emp   = empMap[empId];
        if (emp.status !== 'active') continue;
        const shift = emp.shiftId ? shiftMap[emp.shiftId] : null;
        if (!(shift?.attendanceRules?.monthlyLateAllowance > 0)) continue;
        if (!preLatesByEmp[empId]) preLatesByEmp[empId] = {};
        preLatesByEmp[empId][rangeStartMonth] = 0;
        const wOff = emp?.weeklyOffDays || shift?.weeklyOffDays || [0];
        const cur  = new Date(preStart);
        while (localDateStr(cur) < startDate) {
          const d   = localDateStr(cur);
          const dow = cur.getDay();
          cur.setDate(cur.getDate() + 1);
          if (wOff.includes(dow)) continue;
          const man = preManByEmpDate[empId]?.[d];
          if (man) { if (man.status === 'late') preLatesByEmp[empId][rangeStartMonth]++; continue; }
          const dayLogs = preByEmpDate[empId]?.[d] || [];
          if (!dayLogs.length) continue;
          const inLog  = dayLogs.find(l => { const pt=getPunchType(l); return pt===0||pt===4; }) || dayLogs[0];
          const outLog = [...dayLogs].reverse().find(l => { const pt=getPunchType(l); return pt===1||pt===5; });
          const inT    = toHHMM(inLog?.timestamp);
          const wMins  = (outLog && inLog) ? Math.round((new Date(outLog.timestamp)-new Date(inLog.timestamp))/60000) : 0;
          const s      = computeStatus(emp, shift, inT, null, wMins, dow);
          if (s === 'late') preLatesByEmp[empId][rangeStartMonth]++;
        }
      }
    }

    // Per-employee range report
    const data = [];
    for (const empId of Object.keys(empMap)) {
      const emp = empMap[empId];
      if (emp.status !== 'active') continue;
      if (department && emp.department !== department) continue;

      const shift = emp.shiftId ? shiftMap[emp.shiftId] : null;
      const weeklyOff = emp.weeklyOffDays || shift?.weeklyOffDays || [0];

      const totals = { present:0, late:0, pardonedLate:0, halfDay:0, absent:0, halfDayWeekdayAbsent:0, weekOff:0, holiday:0, paidLeave:0, unpaidLeave:0, onLeave:0, workedMinutes:0, lateMinutes:0, overtimeMinutes:0 };
      const days   = [];
      // Running late count per calendar month (for monthly late allowance)
      const monthLateCount = { ...(preLatesByEmp[empId] || {}) };

      for (const date of dates) {
        const dow = new Date(date + 'T12:00:00').getDay();
        if (weeklyOff.includes(dow)) {
          totals.weekOff++;
          days.push({ date, status:'week-off', inTime:null, outTime:null, workedMinutes:0, lateMinutes:0, overtimeMinutes:0 });
          continue;
        }

        // Manual override
        const manual = manualByEmpDate[empId]?.[date];
        if (manual) {
          const s = manual.status;
          if      (s === 'present')                                          totals.present++;
          else if (s === 'late')                                             totals.late++;
          else if (s === 'half-day')                                         totals.halfDay++;
          else if (s === 'absent')                                           totals.absent++;
          else if (['paid-leave','sick-leave','comp-off'].includes(s)) { totals.paidLeave++; totals.onLeave++; }
          else if (s === 'on-leave')                                    { totals.unpaidLeave++; totals.onLeave++; }
          else if (s === 'holiday')                                          totals.holiday++;
          totals.workedMinutes += manual.workedMinutes || 0;
          days.push({ date, status: s, inTime: manual.inTime, outTime: manual.outTime, workedMinutes: manual.workedMinutes || 0, lateMinutes:0, overtimeMinutes:0, isManual:true, reason: manual.reason || null });
          continue;
        }

        const dayLogs = byEmpDate[empId]?.[date] || [];
        if (!dayLogs.length) {
          // Public holiday — don't count as absent
          if (holidayMap.has(date)) {
            totals.holiday++;
            days.push({ date, status:'holiday', inTime:null, outTime:null, workedMinutes:0, lateMinutes:0, overtimeMinutes:0, holidayName: holidayMap.get(date) });
          } else {
            const isHalfDayWeekday = !!getHalfDayEntry(shift, dow);
            totals.absent++;
            if (isHalfDayWeekday) totals.halfDayWeekdayAbsent++;
            days.push({ date, status:'absent', inTime:null, outTime:null, workedMinutes:0, lateMinutes:0, overtimeMinutes:0, lopWeight: isHalfDayWeekday ? 0.5 : 1.0 });
          }
          continue;
        }

        const inLog  = dayLogs.find(l => { const pt=getPunchType(l); return pt===0||pt===4; }) || dayLogs[0];
        const outLog = [...dayLogs].reverse().find(l => { const pt=getPunchType(l); return pt===1||pt===5; });
        const inTime  = toHHMM(inLog?.timestamp);
        const outTime = outLog ? toHHMM(outLog.timestamp) : null;
        const workedMinutes = (outLog && inLog)
          ? Math.round((new Date(outLog.timestamp) - new Date(inLog.timestamp)) / 60000)
          : 0;
        let status = computeStatus(emp, shift, inTime, outTime, workedMinutes, dow);

        // Apply monthly late allowance
        let isPardonedLate = false;
        if (status === 'late') {
          const allowance = shift?.attendanceRules?.monthlyLateAllowance || 0;
          const mKey = date.substring(0, 7);
          const rawCount = monthLateCount[mKey] || 0;
          monthLateCount[mKey] = rawCount + 1; // always count toward allowance (even if pardoned)
          if (allowance > 0 && rawCount < allowance) { status = 'present'; isPardonedLate = true; }
        }

        if      (status === 'present')  { totals.present++; if (isPardonedLate) totals.pardonedLate++; }
        else if (status === 'late')     totals.late++;
        else if (status === 'half-day') totals.halfDay++;
        else if (status === 'absent')   { totals.absent++; if (getHalfDayEntry(shift, dow)) totals.halfDayWeekdayAbsent++; }
        const dayLate = computeLate(emp, shift, inTime, dow);
        const dayOT   = computeOT(shift, workedMinutes);
        totals.workedMinutes   += workedMinutes;
        totals.lateMinutes     += dayLate;
        totals.overtimeMinutes += dayOT;

        const dayEntry = { date, status, inTime, outTime, workedMinutes, lateMinutes: dayLate, overtimeMinutes: dayOT };
        if (isPardonedLate) dayEntry.pardonedLate = true;
        if (status === 'absent') dayEntry.lopWeight = getHalfDayEntry(shift, dow) ? 0.5 : 1.0;
        days.push(dayEntry);
      }

      data.push({
        employeeId: empId,
        name:       emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim(),
        code:       emp.employeeCode,
        photo:      emp.photoUrl,
        gender:     emp.gender || null,
        department: emp.department,
        shift:      shiftDetail(shift),
        totals,
        days,
      });
    }

    res.json({ status:'success', startDate, endDate, totalDays: dates.length, data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PAYROLL CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/organizations/:orgId/attendance/payroll', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { startDate, endDate, department } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const start = new Date(startDate + 'T00:00:00');
    const end   = new Date(endDate   + 'T23:59:59.999');

    // Employees with full payroll fields
    const empsRaw = await Employee.find({ orgId: req.params.orgId, status: 'active' }).lean();
    const shiftMapRaw = await buildShiftMap(req.params.orgId);

    // Build date array
    const dates = [];
    const cur = new Date(start);
    while (cur <= end) { dates.push(localDateStr(cur)); cur.setDate(cur.getDate() + 1); }

    // Holidays in range
    const HolidayModel3 = getHolidayModel();
    const hMap = new Map();
    if (HolidayModel3) {
      const hols = await HolidayModel3.find({ orgId: req.params.orgId, date: { $gte: startDate, $lte: endDate } }).lean().catch(() => []);
      hols.forEach(h => hMap.set(h.date, h.name || 'Holiday'));
    }

    // Attendance logs in range (same as range endpoint)
    if (!org.bridgeId) return res.json({ status:'success', startDate, endDate, data:[], summary:{} });
    const logs = _AttendanceLog
      ? await _AttendanceLog.find({ bridgeId: org.bridgeId, timestamp: { $gte: start, $lte: end } }).sort({ timestamp:1 }).lean()
      : [];

    const muList3 = _MachineUser
      ? await _MachineUser.find({ bridgeId: org.bridgeId, userId: { $regex: /^emp-/ } }).select('userId uid deviceId').lean()
      : [];
    const duidMap3 = buildUidMap(muList3);
    const byEmpDate3 = groupByEmpDate(logs, duidMap3);

    const manuals3 = await ManualAtt.find({ orgId: req.params.orgId, date: { $gte: startDate, $lte: endDate } }).lean();
    const manualByEmpDate3 = {};
    manuals3.forEach(m => {
      if (!manualByEmpDate3[m.employeeId]) manualByEmpDate3[m.employeeId] = {};
      manualByEmpDate3[m.employeeId][m.date] = m;
    });

    // Load org leave policy for PT slabs
    const leavePolicy = await LeavePolicy.findOne({ orgId: req.params.orgId }).lean();

    // Standard Indian payroll: per-day rate = monthly_salary / 26
    const STANDARD_DAYS = 26;

    // Pre-range late counts per employee (for monthly late allowance spanning range start)
    // Same pattern as range endpoint
    const payRangeStartMonth = startDate.substring(0, 7);
    const payMonthFirst      = `${payRangeStartMonth}-01`;
    const payPreLatesByEmp   = {};
    if (startDate > payMonthFirst && org.bridgeId && _AttendanceLog) {
      const preStart4 = new Date(`${payMonthFirst}T00:00:00`);
      const preLogs4  = await _AttendanceLog.find({ bridgeId: org.bridgeId, timestamp: { $gte: preStart4, $lt: start } }).sort({ timestamp:1 }).lean();
      const preByEmpDate4 = groupByEmpDate(preLogs4, duidMap3);
      const preManuals4 = await ManualAtt.find({ orgId: req.params.orgId, date: { $gte: payMonthFirst, $lt: startDate } }).lean();
      const preManByEmpDate4 = {};
      preManuals4.forEach(m => {
        if (!preManByEmpDate4[m.employeeId]) preManByEmpDate4[m.employeeId] = {};
        preManByEmpDate4[m.employeeId][m.date] = m;
      });
      for (const emp of empsRaw) {
        const shift = emp.shiftId ? shiftMapRaw[emp.shiftId] : null;
        if (!(shift?.attendanceRules?.monthlyLateAllowance > 0)) continue;
        const wOff = emp.weeklyOffDays || shift?.weeklyOffDays || [0];
        payPreLatesByEmp[emp.employeeId] = { [payRangeStartMonth]: 0 };
        const cc = new Date(preStart4);
        while (localDateStr(cc) < startDate) {
          const dd = localDateStr(cc); const dow = cc.getDay(); cc.setDate(cc.getDate()+1);
          if (wOff.includes(dow)) continue;
          const man = preManByEmpDate4[emp.employeeId]?.[dd];
          if (man) { if (man.status === 'late') payPreLatesByEmp[emp.employeeId][payRangeStartMonth]++; continue; }
          const dl = preByEmpDate4[emp.employeeId]?.[dd] || [];
          if (!dl.length) continue;
          const inL  = dl.find(l => { const pt=getPunchType(l); return pt===0||pt===4; }) || dl[0];
          const outL = [...dl].reverse().find(l => { const pt=getPunchType(l); return pt===1||pt===5; });
          const inT  = toHHMM(inL?.timestamp);
          const wM   = (outL && inL) ? Math.round((new Date(outL.timestamp)-new Date(inL.timestamp))/60000) : 0;
          if (computeStatus(emp, shift, inT, null, wM, dow) === 'late') payPreLatesByEmp[emp.employeeId][payRangeStartMonth]++;
        }
      }
    }

    const data = [];
    for (const emp of empsRaw) {
      if (department && emp.department !== department) continue;
      const shift = emp.shiftId ? shiftMapRaw[emp.shiftId] : null;
      const weeklyOff = emp.weeklyOffDays || shift?.weeklyOffDays || [0];
      const allowance = shift?.attendanceRules?.monthlyLateAllowance || 0;

      // Running late count per calendar month (seeded with pre-range lates)
      const monthLateCount4 = { ...(payPreLatesByEmp[emp.employeeId] || {}) };

      const att = { present:0, late:0, pardonedLate:0, halfDay:0, absent:0, halfDayWeekdayAbsent:0, weekOff:0, holiday:0, paidLeave:0, unpaidLeave:0, workedMinutes:0, lateMinutes:0, overtimeMinutes:0 };

      for (const date of dates) {
        const dow = new Date(date + 'T12:00:00').getDay();
        if (weeklyOff.includes(dow)) { att.weekOff++; continue; }

        const manual = manualByEmpDate3[emp.employeeId]?.[date];
        if (manual) {
          const s = manual.status;
          if      (s === 'present')                                                       att.present++;
          else if (s === 'late')                                                          att.late++;
          else if (s === 'half-day')                                                      att.halfDay++;
          else if (s === 'absent')                                                        att.absent++;
          else if (s === 'holiday')                                                       att.holiday++;
          else if (['paid-leave','sick-leave','comp-off'].includes(s))                    att.paidLeave++;
          else if (['on-leave'].includes(s))                                              att.unpaidLeave++;
          att.workedMinutes += manual.workedMinutes || 0;
          continue;
        }

        const dayLogs = byEmpDate3[emp.employeeId]?.[date] || [];
        if (!dayLogs.length) {
          if (hMap.has(date)) { att.holiday++; }
          else {
            att.absent++;
            if (getHalfDayEntry(shift, dow)) att.halfDayWeekdayAbsent++; // scheduled half-day but absent
          }
          continue;
        }

        const inLog  = dayLogs.find(l => { const pt=getPunchType(l); return pt===0||pt===4; }) || dayLogs[0];
        const outLog = [...dayLogs].reverse().find(l => { const pt=getPunchType(l); return pt===1||pt===5; });
        const inTime  = toHHMM(inLog?.timestamp);
        const outTime = outLog ? toHHMM(outLog.timestamp) : null;
        const wMins   = (outLog && inLog) ? Math.round((new Date(outLog.timestamp)-new Date(inLog.timestamp))/60000) : 0;
        let status    = computeStatus(emp, shift, inTime, outTime, wMins, dow);

        // Apply monthly late allowance (same logic as range endpoint)
        if (status === 'late') {
          const mKey    = date.substring(0, 7);
          const rawCount = monthLateCount4[mKey] || 0;
          monthLateCount4[mKey] = rawCount + 1; // always increment raw counter
          if (allowance > 0 && rawCount < allowance) {
            status = 'present';
            att.pardonedLate++; // visible in report as "allowed late"
          }
        }

        if      (status === 'present')  att.present++;
        else if (status === 'late')     att.late++;
        else if (status === 'half-day') att.halfDay++;
        else if (status === 'absent')   att.absent++;

        att.workedMinutes   += wMins;
        att.lateMinutes     += computeLate(emp, shift, inTime, dow);
        att.overtimeMinutes += computeOT(shift, wMins);
      }

      // ── Payroll calculation ────────────────────────────────────────────────
      const salary     = emp.salary || 0;
      const salaryType = emp.salaryType || 'monthly';

      // Effective paid days:
      //   Full: present, late, holiday, week-off, paid-leave
      //   Half: half-day (worked) + scheduled half-day weekday absences count as 0.5 LOP (not 1.0)
      //   Zero: absent (full day), unpaid-leave
      const effectiveDays = att.present + att.late + att.holiday + att.weekOff + att.paidLeave + (att.halfDay * 0.5);
      // Half-day weekday absences = 0.5 LOP each; full-day absences = 1.0 LOP each
      const lopDays = (att.absent - att.halfDayWeekdayAbsent) + (att.halfDayWeekdayAbsent * 0.5) + att.unpaidLeave;

      let dailyRate = 0, hourlyRate = 0, grossPay = 0, otAmount = 0;

      if (salaryType === 'monthly') {
        dailyRate  = salary / STANDARD_DAYS;
        hourlyRate = dailyRate / 8;
        grossPay   = Math.max(0, salary - (lopDays * dailyRate));
      } else if (salaryType === 'daily') {
        dailyRate  = salary;
        hourlyRate = salary / 8;
        grossPay   = effectiveDays * salary;
      } else if (salaryType === 'hourly') {
        hourlyRate = salary;
        dailyRate  = salary * 8;
        grossPay   = (att.workedMinutes / 60) * salary;
      }

      // Overtime
      const otMultiplier = emp.overtimeRate || (shift?.overtimeRules?.enabled ? 1.5 : 1.5);
      if (emp.overtimeAllowed !== false && att.overtimeMinutes > 0) {
        otAmount = (att.overtimeMinutes / 60) * hourlyRate * otMultiplier;
      }

      // Deductions (Indian payroll standard)
      const monthlyGrossEquiv = salaryType === 'monthly' ? salary : grossPay * (STANDARD_DAYS / Math.max(dates.length,1));
      const pfBasic   = Math.min(15000, monthlyGrossEquiv); // PF on max 15000 basic
      const pfAmount  = emp.pfNumber ? Math.round(pfBasic * 0.12) : 0;
      const esiAmount = emp.esiNumber && monthlyGrossEquiv <= 21000 ? Math.round(grossPay * 0.0075) : 0;
      // PT: employee override takes precedence over org slab
      const monthlyPT = emp.ptOverride != null ? emp.ptOverride : calcPT(monthlyGrossEquiv, leavePolicy?.ptSlabs);
      const ptAmount  = Math.round(monthlyPT * (dates.length / 26)); // pro-rated PT

      const totalDeductions = pfAmount + esiAmount + ptAmount;
      const netPay = Math.max(0, grossPay + otAmount - totalDeductions);

      data.push({
        employeeId:  emp.employeeId,
        name:        emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim(),
        code:        emp.employeeCode,
        department:  emp.department,
        designation: emp.designation,
        gender:      emp.gender || null,
        photo:       emp.photoUrl,
        salary, salaryType,
        pfNumber:    emp.pfNumber || null,
        esiNumber:   emp.esiNumber || null,
        uanNumber:   emp.uanNumber || null,
        panNumber:   emp.panNumber || null,
        bankDetails: emp.bankDetails || {},
        ptOverride:  emp.ptOverride ?? null,
        leaveBalance: emp.leaveBalance || {},
        shift:       shiftDetail(shift),
        attendance:  att,
        payroll: {
          workingDays:    dates.length - att.weekOff - att.holiday,
          effectiveDays:  +effectiveDays.toFixed(2),
          lopDays:        +lopDays.toFixed(2),
          dailyRate:      +dailyRate.toFixed(2),
          hourlyRate:     +hourlyRate.toFixed(2),
          grossPay:       +grossPay.toFixed(2),
          otMinutes:      att.overtimeMinutes,
          otAmount:       +otAmount.toFixed(2),
          deductions: {
            pf:  pfAmount,
            esi: esiAmount,
            pt:  ptAmount,
            total: totalDeductions,
          },
          netPay: +netPay.toFixed(2),
        },
      });
    }

    // Org-level summary
    const summary = {
      headcount:     data.length,
      totalGross:    +data.reduce((s,d) => s + d.payroll.grossPay,   0).toFixed(2),
      totalOT:       +data.reduce((s,d) => s + d.payroll.otAmount,   0).toFixed(2),
      totalPF:       +data.reduce((s,d) => s + d.payroll.deductions.pf, 0).toFixed(2),
      totalESI:      +data.reduce((s,d) => s + d.payroll.deductions.esi, 0).toFixed(2),
      totalNet:      +data.reduce((s,d) => s + d.payroll.netPay,     0).toFixed(2),
      totalLopDays:  +data.reduce((s,d) => s + d.payroll.lopDays,    0).toFixed(1),
    };

    res.json({ status:'success', startDate, endDate, periodDays: dates.length, summary, data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  RAW PUNCH LOGS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/organizations/:orgId/attendance/logs', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (!_AttendanceLog) return res.json({ status:'success', data: [] });

    const { startDate, endDate, deviceId, limit=10000, skip=0 } = req.query;
    if (!org.bridgeId) return res.json({ status:'success', data:[], total:0 });
    const filter = { bridgeId: org.bridgeId };
    if (deviceId)  filter.deviceId  = deviceId;
    if (startDate) filter.timestamp = { $gte: new Date(startDate + 'T00:00:00') };
    if (endDate)   filter.timestamp = { ...(filter.timestamp||{}), $lte: new Date(endDate + 'T23:59:59.999') };

    const [logs, total] = await Promise.all([
      _AttendanceLog.find(filter).sort({ timestamp: 1 }).limit(+limit).skip(+skip).lean(),
      _AttendanceLog.countDocuments(filter),
    ]);

    // Build MachineUser -> employeeId bridge map
    const muBridge = _MachineUser
      ? await _MachineUser.find({ bridgeId: org.bridgeId, userId: { $regex: /^emp-/ } }).select('userId uid deviceId').lean()
      : [];
    const logUidToEmpId = buildUidMap(muBridge);

    // Resolve device UIDs to employeeIds, then fetch employee info
    const resolvedEmpIds = [...new Set(logs.map(l => {
      const key = l.deviceId ? `${l.deviceId}:${l.userId}` : l.userId;
      return logUidToEmpId[key] || logUidToEmpId[l.userId] || null;
    }).filter(Boolean))];

    const emps = resolvedEmpIds.length
      ? await Employee.find({ employeeId: { $in: resolvedEmpIds } }).select('employeeId firstName lastName displayName employeeCode photoUrl gender').lean()
      : [];
    const empMap = {};
    emps.forEach(e => { empMap[e.employeeId] = e; });

    const enriched = logs.map(l => {
      const empId = resolveEmpId(l, logUidToEmpId);
      const emp   = empId ? empMap[empId] : null;
      return {
        ...l,
        punchType: getPunchType(l),         // normalize null punchType from rawJson
        localDate: localDateStr(l.timestamp), // server-local date string for correct grouping
        employee: emp
          ? { name: emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim(), code: emp.employeeCode, photoUrl: emp.photoUrl, gender: emp.gender || null }
          : null,
      };
    });

    res.json({ status:'success', data: enriched, total, returned: enriched.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MANUAL ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/organizations/:orgId/attendance/manual', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { startDate, endDate, employeeId } = req.query;
    const filter = { orgId: req.params.orgId };
    if (employeeId) filter.employeeId = employeeId;
    if (startDate)  filter.date = { $gte: startDate };
    if (endDate)    filter.date = { ...(filter.date||{}), $lte: endDate };

    const records = await ManualAtt.find(filter).sort({ date:-1 }).lean();

    // Attach employee info
    const empIds = [...new Set(records.map(r => r.employeeId))];
    const emps   = empIds.length
      ? await Employee.find({ employeeId: { $in: empIds } }).select('employeeId firstName lastName displayName employeeCode photoUrl').lean()
      : [];
    const empMap = {};
    emps.forEach(e => { empMap[e.employeeId] = e; });

    const enriched = records.map(r => ({
      ...r,
      employee: empMap[r.employeeId]
        ? { name: empMap[r.employeeId].displayName || `${empMap[r.employeeId].firstName} ${empMap[r.employeeId].lastName||''}`.trim(), code: empMap[r.employeeId].employeeCode }
        : null,
    }));

    res.json({ status:'success', data: enriched });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/organizations/:orgId/attendance/manual', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    let { employeeId, date, status, inTime, outTime, workedMinutes, leaveType, leaveHalf, reason } = req.body;
    if (!employeeId || !date) return res.status(400).json({ error: 'employeeId and date required' });

    // Auto-calculate workedMinutes from inTime + outTime when not explicitly provided
    if (inTime && outTime && workedMinutes == null) {
      const [ih, im] = inTime.split(':').map(Number);
      const [oh, om] = outTime.split(':').map(Number);
      let mins = (oh * 60 + om) - (ih * 60 + im);
      if (mins < 0) mins += 1440; // crosses midnight
      workedMinutes = mins;
    }

    // Restore leave balance if this employee+date already has a leave override
    const existing = await ManualAtt.findOne({ orgId: req.params.orgId, employeeId, date }).lean();
    if (existing && LEAVE_STATUSES.has(existing.status)) {
      await adjustLeaveBalance(employeeId, existing.status, existing.leaveType, existing.leaveHalf, +1);
    }

    const record = await ManualAtt.findOneAndUpdate(
      { orgId: req.params.orgId, employeeId, date },
      { $set: { manualId: `man-${uuidv4().split('-')[0]}`, orgId: req.params.orgId, employeeId, date, status: status||'present', inTime: inTime||null, outTime: outTime||null, workedMinutes: workedMinutes != null ? Number(workedMinutes) : null, leaveType: leaveType||null, leaveHalf: leaveHalf||null, reason: reason||'', approvedBy: req.authUser.userId } },
      { upsert: true, new: true }
    );

    // Deduct leave balance for new leave status
    if (LEAVE_STATUSES.has(status)) {
      await adjustLeaveBalance(employeeId, status, leaveType, leaveHalf, -1);
    }

    res.status(201).json({ status:'success', data: record });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/organizations/:orgId/attendance/manual/:manualId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const existing = await ManualAtt.findOne({ manualId: req.params.manualId, orgId: req.params.orgId }).lean();
    if (!existing) return res.status(404).json({ error: 'Not found' });

    let { status, inTime, outTime, workedMinutes, leaveType, leaveHalf, reason } = req.body;

    const update = {};
    if (status        !== undefined) update.status        = status;
    if (inTime        !== undefined) update.inTime        = inTime;
    if (outTime       !== undefined) update.outTime       = outTime;
    if (leaveType     !== undefined) update.leaveType     = leaveType;
    if (leaveHalf     !== undefined) update.leaveHalf     = leaveHalf;
    if (reason        !== undefined) update.reason        = reason;

    // Auto-calculate workedMinutes from resolved inTime/outTime
    const resolvedIn  = inTime  !== undefined ? inTime  : existing.inTime;
    const resolvedOut = outTime !== undefined ? outTime : existing.outTime;
    if (workedMinutes !== undefined) {
      update.workedMinutes = workedMinutes ? Number(workedMinutes) : null;
    } else if (resolvedIn && resolvedOut) {
      const [ih, im] = resolvedIn.split(':').map(Number);
      const [oh, om] = resolvedOut.split(':').map(Number);
      let mins = (oh * 60 + om) - (ih * 60 + im);
      if (mins < 0) mins += 1440;
      update.workedMinutes = mins;
    }

    // Adjust leave balance: restore old, deduct new
    if (LEAVE_STATUSES.has(existing.status)) {
      await adjustLeaveBalance(existing.employeeId, existing.status, existing.leaveType, existing.leaveHalf, +1);
    }
    const newStatus    = status    !== undefined ? status    : existing.status;
    const newLeaveType = leaveType !== undefined ? leaveType : existing.leaveType;
    const newLeaveHalf = leaveHalf !== undefined ? leaveHalf : existing.leaveHalf;
    if (LEAVE_STATUSES.has(newStatus)) {
      await adjustLeaveBalance(existing.employeeId, newStatus, newLeaveType, newLeaveHalf, -1);
    }

    const record = await ManualAtt.findOneAndUpdate(
      { manualId: req.params.manualId, orgId: req.params.orgId },
      { $set: update }, { new: true }
    );
    res.json({ status:'success', data: record });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/organizations/:orgId/attendance/manual/:manualId', requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Restore leave balance before deleting
    const existing = await ManualAtt.findOne({ manualId: req.params.manualId, orgId: req.params.orgId }).lean();
    if (existing && LEAVE_STATUSES.has(existing.status)) {
      await adjustLeaveBalance(existing.employeeId, existing.status, existing.leaveType, existing.leaveHalf, +1);
    }

    await ManualAtt.deleteOne({ manualId: req.params.manualId, orgId: req.params.orgId });
    res.json({ status:'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.init = init;
module.exports.router = router;