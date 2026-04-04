import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays, BarChart3, Receipt, FileText, Clock,
  Shield, Minus, CreditCard, Download, Printer, Filter,
  Users, AlertTriangle, CheckCircle2, Star, Database,
  ChevronDown, ChevronRight, Wallet, PieChart, RefreshCw,
  Clock3, TrendingUp, Activity,
} from 'lucide-react'
import { Button }              from '../components/ui/Button'
import { Input }               from '../components/ui/Input'
import { Empty }               from '../components/ui/Empty'
import { UserAvatar, UserPage, UserPageHeader } from '../components/ui/UserUI'
import { AbbrLegendButton, buildAbbrKeySheet } from './AbbrLegend'
import { useOrgContext }       from '../store/context'
import * as XLSX               from 'xlsx'
import api                     from '../lib/api'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt   = n => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN',{minimumFractionDigits:0})}`
const fmtH  = m => !m ? '0h 0m' : `${Math.floor(m/60)}h ${m%60}m`
const fmtD  = n => n == null ? '—' : Number(n).toFixed(1)
const todayStr   = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const monthStart = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const DOW_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa']

function getDates(startDate, endDate) {
  const dates = [], cur = new Date(startDate + 'T00:00:00'), end = new Date(endDate + 'T00:00:00')
  while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1) }
  return dates
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_ABBR = {
  present:'P', late:'L', 'half-day':'H', absent:'A', 'week-off':'WO',
  holiday:'Hol', 'on-leave':'Lv', 'paid-leave':'PL', 'sick-leave':'SL', 'comp-off':'CO',
}
const STATUS_COLOR = {
  present:'#34d399', late:'#fb923c', 'half-day':'#facc15', absent:'#f87171',
  'week-off':'#6b7280', holiday:'#f472b6', 'on-leave':'#60a5fa',
  'paid-leave':'#60a5fa', 'sick-leave':'#c084fc', 'comp-off':'#22d3ee',
}
function dayAbbr(day) {
  if (!day) return '—'
  if (day.pardonedLate) return 'L*'
  if (day.status === 'absent' && day.lopWeight === 0.5) return 'A½'
  return STATUS_ABBR[day.status] || day.status || '—'
}
function dayColor(day) {
  if (!day) return '#555'
  if (day.pardonedLate) return '#fbbf24'
  if (day.status === 'absent' && day.lopWeight === 0.5) return '#fca5a5'
  return STATUS_COLOR[day.status] || '#888'
}

// ── Report definitions ────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { id:'monthly-att',      cat:'attendance', label:'Monthly Attendance',   icon:CalendarDays, desc:'Daily status with IN/OUT timestamps per employee', featured:true },
  { id:'att-summary',      cat:'attendance', label:'Attendance Summary',   icon:BarChart3,    desc:'Day counts: P, L, L*, H, A, A½, WO, Hol, LOP, OT' },
  { id:'payroll-register', cat:'payroll',    label:'Payroll Register',     icon:Receipt,      desc:'Full salary breakdown — Gross, OT, PF, ESI, PT, Net' },
  { id:'salary-slip',      cat:'payroll',    label:'Salary Slip',          icon:FileText,     desc:'Individual pay slip sheet per employee' },
  { id:'ot-report',        cat:'payroll',    label:'Overtime Report',      icon:Clock,        desc:'OT hours and earnings per employee' },
  { id:'deductions',       cat:'payroll',    label:'Deductions Report',    icon:Shield,       desc:'PF, ESI, PT breakdown with UAN / PAN' },
  { id:'lop-report',       cat:'payroll',    label:'LOP Report',           icon:Minus,        desc:'Loss of Pay — full day & half-day analysis' },
  { id:'bank-advice',      cat:'payroll',    label:'Bank Transfer Advice', icon:CreditCard,   desc:'Net salary per bank account for upload' },
]

// ── Excel: Org header rows ────────────────────────────────────────────────────
function buildOrgInfoRows(org, period, reportLabel, rowCount) {
  const now      = new Date().toLocaleString('en-IN')
  const location = [org?.city, org?.state].filter(Boolean).join(', ')
  return [
    [org?.name || 'Organisation'],
    ...(org?.industry
      ? [[`${org.industry}${location ? '  |  ' + location : ''}`]]
      : location ? [[location]] : []),
    ...(org?.address ? [[`${org.address}`]] : []),
    ...([org?.phone, org?.email].some(Boolean)
      ? [[`${[org?.phone && `Ph: ${org.phone}`, org?.email && `Email: ${org.email}`].filter(Boolean).join('  |  ')}`]]
      : []),
    [],
    [`Report: ${reportLabel}   |   Period: ${period.startDate} to ${period.endDate}   |   Employees: ${rowCount}`],
    [`Generated: ${now}   |   Proudly Powered by: Insha Technologies — Attendix (Attendance & Payroll Simplified)`],
    [],
  ]
}

// ── Excel: Monthly Attendance ─────────────────────────────────────────────────
function buildMonthlyAttSheet(rangeData, dates) {
  const dateHdrs = dates.map(d => {
    const dt = new Date(d + 'T00:00:00')
    return `${dt.getDate()}\n${DOW_SHORT[dt.getDay()]}`
  })
  const header = ['#','Code','Employee Name','Department','Shift', ...dateHdrs,
    'P','L','L*','H','A','A½','WO','Hol','Leave','LOP Days','Hours','OT Hrs']

  const rows = rangeData.map((emp, i) => {
    const dayMap = {}; emp.days.forEach(d => { dayMap[d.date] = d })
    const t = emp.totals
    const pardoned   = emp.days.filter(d => d.pardonedLate).length
    const hdAbsent   = emp.days.filter(d => d.status === 'absent' && d.lopWeight === 0.5).length
    const lopDays    = (t.absent - hdAbsent) + (hdAbsent * 0.5)

    const dayCells = dates.map(date => {
      const day = dayMap[date]
      if (!day) return ''
      const abbr  = dayAbbr(day)
      const parts = [abbr]
      if (day.inTime)  parts.push(`In:  ${day.inTime}`)
      if (day.outTime) parts.push(`Out: ${day.outTime}`)
      if (day.workedMinutes > 0 && day.inTime && day.outTime)
        parts.push(`${Math.floor(day.workedMinutes/60)}h ${day.workedMinutes%60}m`)
      return parts.join('\n')
    })

    return [
      i+1, emp.code||'', emp.name, emp.department||'', emp.shift?.name||'',
      ...dayCells,
      t.present - pardoned, t.late, pardoned,
      t.halfDay, t.absent - hdAbsent, hdAbsent,
      t.weekOff, t.holiday, t.onLeave,
      +lopDays.toFixed(1),
      +(t.workedMinutes/60).toFixed(2),
      +(t.overtimeMinutes/60).toFixed(2),
    ]
  })
  return [header, ...rows]
}

// ── Excel: Attendance Summary ─────────────────────────────────────────────────
function buildAttSummarySheet(rangeData) {
  const header = [
    '#','Code','Employee Name','Department','Shift',
    'Present (P)','Late (L)','Pardoned Late (L*)','Half Day (H)',
    'Absent Full (A)','Absent Half-Day (A½)','Week Off (WO)','Holiday (Hol)','Leave (Lv/PL)',
    'LOP Days','Worked Hours','OT Hours','Attendance %',
  ]
  const rows = rangeData.map((emp, i) => {
    const t = emp.totals
    const pardoned  = emp.days.filter(d => d.pardonedLate).length
    const hdAbsent  = emp.days.filter(d => d.status === 'absent' && d.lopWeight === 0.5).length
    const lopDays   = (t.absent - hdAbsent) + (hdAbsent * 0.5)
    const effectiveWork = t.present + t.late + (t.halfDay * 0.5)
    const totalWD = t.present + t.late + t.halfDay + t.absent
    const attPct = totalWD > 0 ? +((effectiveWork / totalWD) * 100).toFixed(1) : 0
    return [
      i+1, emp.code||'', emp.name, emp.department||'', emp.shift?.name||'',
      t.present - pardoned, t.late, pardoned, t.halfDay,
      t.absent - hdAbsent, hdAbsent, t.weekOff, t.holiday, t.onLeave,
      +lopDays.toFixed(1), +(t.workedMinutes/60).toFixed(2), +(t.overtimeMinutes/60).toFixed(2), attPct,
    ]
  })
  return [header, ...rows]
}

// ── Excel: Payroll sheets ─────────────────────────────────────────────────────
function buildPayrollRegisterSheet(rows, period) {
  const header = [
    '#','Code','Employee Name','Department','Designation','Salary Type','Monthly Salary',
    'Working Days','Effective Days','LOP Days',
    'Present','Late (Charged)','Late* (Pardoned)','Half Day','Absent',
    'Paid Leave','Holiday','Week Off','Worked Hours','OT Hours',
    'Gross Pay','OT Amount','PF (12%)','ESI (0.75%)','Prof Tax','Total Deductions','Net Pay',
    'PF/UAN','Bank Name','Account No','IFSC',
  ]
  const data = rows.map((r,i) => [
    i+1, r.code, r.name, r.department||'', r.designation||'', r.salaryType, r.salary||0,
    r.payroll.workingDays, r.payroll.effectiveDays, r.payroll.lopDays,
    r.attendance.present, r.attendance.late, r.attendance.pardonedLate||0,
    r.attendance.halfDay, r.attendance.absent,
    r.attendance.paidLeave, r.attendance.holiday, r.attendance.weekOff,
    +(r.attendance.workedMinutes/60).toFixed(2), +(r.attendance.overtimeMinutes/60).toFixed(2),
    r.payroll.grossPay, r.payroll.otAmount,
    r.payroll.deductions.pf, r.payroll.deductions.esi, r.payroll.deductions.pt,
    r.payroll.deductions.total, r.payroll.netPay,
    r.uanNumber||'', r.bankDetails?.bankName||'', r.bankDetails?.accountNumber||'', r.bankDetails?.ifscCode||'',
  ])
  return [header, ...data]
}

function buildOTSheet(rows) {
  const header = ['#','Code','Employee Name','Department','OT Minutes','OT Hours','Daily Rate','OT Multiplier','OT Amount']
  return [header, ...rows.filter(r => r.attendance.overtimeMinutes > 0).map((r,i) => [
    i+1, r.code, r.name, r.department||'',
    r.attendance.overtimeMinutes, +(r.attendance.overtimeMinutes/60).toFixed(2),
    r.payroll.hourlyRate, '1.5×', r.payroll.otAmount,
  ])]
}

function buildDeductionsSheet(rows) {
  const header = ['#','Code','Employee Name','Department','Gross Pay','PF (12%)','PF/UAN','ESI (0.75%)','ESI No','Prof Tax','Total Deductions','Net Pay','PAN']
  return [header, ...rows.map((r,i) => [
    i+1, r.code, r.name, r.department||'', r.payroll.grossPay,
    r.payroll.deductions.pf, r.uanNumber||'',
    r.payroll.deductions.esi, r.esiNumber||'',
    r.payroll.deductions.pt, r.payroll.deductions.total, r.payroll.netPay, r.panNumber||'',
  ])]
}

function buildLOPSheet(rows) {
  const header = ['#','Code','Employee Name','Department','Monthly Salary','Daily Rate','Absent (Full Day)','Absent (Half-Day Weekday)','Total LOP Days','LOP Amount','Gross Pay','Net Pay']
  return [header, ...rows.filter(r => r.payroll.lopDays > 0).map((r,i) => {
    const hdAbs = r.attendance.halfDayWeekdayAbsent || 0
    const full  = r.attendance.absent - hdAbs
    return [
      i+1, r.code, r.name, r.department||'', r.salary||0, r.payroll.dailyRate,
      full, hdAbs, r.payroll.lopDays, +(r.payroll.lopDays * r.payroll.dailyRate).toFixed(2),
      r.payroll.grossPay, r.payroll.netPay,
    ]
  })]
}

function buildBankAdviceSheet(rows) {
  const header = ['#','Employee Code','Employee Name','Bank Name','Account Number','IFSC Code','Account Type','Net Pay','Remarks']
  return [header, ...rows.filter(r => r.bankDetails?.accountNumber).map((r,i) => [
    i+1, r.code, r.name, r.bankDetails.bankName||'', r.bankDetails.accountNumber,
    r.bankDetails.ifscCode||'', r.bankDetails.accountType||'savings', r.payroll.netPay, '',
  ])]
}

// ── Excel download ────────────────────────────────────────────────────────────
function downloadExcel(reportType, period, org, rangeRows, payrollRows) {
  const wb    = XLSX.utils.book_new()
  const dates = getDates(period.startDate, period.endDate)
  const title = REPORT_TYPES.find(r => r.id === reportType)?.label || 'Report'
  const cnt   = (rangeRows || payrollRows || []).length
  const orgInfo = buildOrgInfoRows(org, period, title, cnt)

  const addSheet = (name, aoa) => {
    const ws = XLSX.utils.aoa_to_sheet([...orgInfo, ...aoa])
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    // Bold first row (org name)
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r:0, c })]
      if (cell) cell.s = { font:{ bold:true, sz:14 } }
    }
    // Bold data header row (after orgInfo blank row before data)
    const hdrRow = orgInfo.length
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r:hdrRow, c })]
      if (cell) cell.s = { font:{ bold:true }, fill:{ fgColor:{ rgb:'1A1A2E' } }, font2:{ color:{ rgb:'FFFFFF' } } }
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0,31))
  }

  if (reportType === 'monthly-att') {
    addSheet('Monthly Attendance', buildMonthlyAttSheet(rangeRows, dates))
    addSheet('Attendance Summary', buildAttSummarySheet(rangeRows))
  } else if (reportType === 'att-summary') {
    addSheet('Attendance Summary', buildAttSummarySheet(rangeRows))
  } else if (reportType === 'payroll-register') {
    addSheet('Payroll Register', buildPayrollRegisterSheet(payrollRows, `${period.startDate} to ${period.endDate}`))
  } else if (reportType === 'salary-slip') {
    payrollRows.forEach(r => addSheet((r.code||r.name).slice(0,28), buildPayrollRegisterSheet([r], `${period.startDate} to ${period.endDate}`)))
  } else if (reportType === 'ot-report') {
    addSheet('Overtime Report', buildOTSheet(payrollRows))
  } else if (reportType === 'deductions') {
    addSheet('Deductions', buildDeductionsSheet(payrollRows))
  } else if (reportType === 'lop-report') {
    addSheet('LOP Report', buildLOPSheet(payrollRows))
  } else if (reportType === 'bank-advice') {
    addSheet('Bank Transfer Advice', buildBankAdviceSheet(payrollRows))
  }

  const abbrWs = XLSX.utils.aoa_to_sheet(buildAbbrKeySheet())
  XLSX.utils.book_append_sheet(wb, abbrWs, 'Abbreviation Key')

  XLSX.writeFile(wb, `${(org?.name||'Report').replace(/\s+/g,'_')}_${reportType}_${period.startDate}_${period.endDate}.xlsx`)
}

// ── Print/PDF ─────────────────────────────────────────────────────────────────
function printReport(reportType, period, org, rangeRows, payrollRows) {
  const title    = REPORT_TYPES.find(r => r.id === reportType)?.label || 'Report'
  const dates    = getDates(period.startDate, period.endDate)
  const fmtN     = n => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN',{minimumFractionDigits:0})}`
  const orgName  = org?.name  || 'Organisation'
  const location = [org?.city, org?.state].filter(Boolean).join(', ')
  const logoUrl  = org?.logoUrl || ''
  const isLandscape = reportType === 'monthly-att'
  const rows = reportType.startsWith('att') || reportType === 'monthly-att' ? rangeRows : payrollRows

  // ── Header HTML ─────────────────────────────
  const headerHtml = `
    <div class="header-card">
      <div class="header-logo-col">
        ${logoUrl
          ? `<img src="${logoUrl}" alt="logo" style="width:60px;height:60px;object-fit:contain;border-radius:6px"/>`
          : `<div class="logo-placeholder">${orgName.charAt(0).toUpperCase()}</div>`}
      </div>
      <div class="header-org-col">
        <div class="org-name">${orgName}</div>
        ${org?.industry ? `<div class="org-industry">${org.industry}${location ? ' · ' + location : ''}</div>` : location ? `<div class="org-industry">${location}</div>` : ''}
        <div class="org-details">
          ${org?.address ? `<span>📍 ${org.address}${location && !org.industry ? ', ' + location : ''}</span>` : ''}
          ${org?.phone   ? `<span>📞 ${org.phone}</span>`  : ''}
          ${org?.email   ? `<span>✉ ${org.email}</span>`  : ''}
        </div>
      </div>
      <div class="header-report-col">
        <div class="report-badge">Official Report</div>
        <div class="report-title">${title}</div>
        <div class="report-meta"><strong>Period:</strong> ${period.startDate} → ${period.endDate}</div>
        <div class="report-meta"><strong>Employees:</strong> ${rows?.length || 0}</div>
        <div class="report-meta"><strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}</div>
      </div>
    </div>`

  // ── Table HTML ──────────────────────────────
  let tableHtml = ''
  if (reportType === 'monthly-att') {
    const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']
    tableHtml = `
      <table class="monthly-tbl">
        <thead><tr>
          <th style="width:20px">#</th>
          <th>Code</th>
          <th style="min-width:90px">Name</th>
          <th>Dept</th>
          ${dates.map(d => {
            const dt = new Date(d + 'T00:00:00')
            const dow = DOW[dt.getDay()]
            const isWknd = dt.getDay()===0||dt.getDay()===6
            return `<th class="day-hdr${isWknd?' weekend':''}">${dt.getDate()}<br><span style="font-weight:400;font-size:7px">${dow}</span></th>`
          }).join('')}
          <th>P</th><th>L</th><th>L*</th><th>H</th><th>A</th><th>A½</th><th>WO</th><th>Hol</th><th>Lv</th><th>LOP</th><th>Hrs</th><th>OT</th>
        </tr></thead>
        <tbody>
          ${rangeRows.map((emp, idx) => {
            const dayMap = {}; emp.days.forEach(d => { dayMap[d.date] = d })
            const t = emp.totals
            const pardoned = emp.days.filter(d => d.pardonedLate).length
            const hdAbs    = emp.days.filter(d => d.status === 'absent' && d.lopWeight === 0.5).length
            const lopDays  = (t.absent - hdAbs) + (hdAbs * 0.5)
            return `<tr class="${idx%2===0?'alt':''}">
              <td class="idx">${idx+1}</td>
              <td class="code">${emp.code||''}</td>
              <td class="name">${emp.name}</td>
              <td class="dept">${emp.department||'—'}</td>
              ${dates.map(date => {
                const day = dayMap[date]
                if (!day) return `<td class="day-cell">—</td>`
                const abbr  = dayAbbr(day)
                const color = dayColor(day)
                const dt    = new Date(date + 'T00:00:00')
                const isWknd = dt.getDay()===0||dt.getDay()===6
                const tip   = [day.inTime && `In: ${day.inTime}`, day.outTime && `Out: ${day.outTime}`].filter(Boolean).join(' ')
                return `<td class="day-cell${isWknd?' wknd':''}" title="${tip}">
                  <span style="color:${color};font-weight:700">${abbr}</span>
                  ${day.inTime  ? `<div class="time-row">${day.inTime}</div>`  : ''}
                  ${day.outTime ? `<div class="time-row out">${day.outTime}</div>` : ''}
                </td>`
              }).join('')}
              <td class="sum">${t.present - pardoned}</td>
              <td class="sum lo">${t.late}</td>
              <td class="sum amber">${pardoned}</td>
              <td class="sum">${t.halfDay}</td>
              <td class="sum red">${t.absent - hdAbs}</td>
              <td class="sum red">${hdAbs}</td>
              <td class="sum dim">${t.weekOff}</td>
              <td class="sum pink">${t.holiday}</td>
              <td class="sum blue">${t.onLeave}</td>
              <td class="sum red">${lopDays.toFixed(1)}</td>
              <td class="sum">${Math.floor(t.workedMinutes/60)}h</td>
              <td class="sum pu">${Math.floor(t.overtimeMinutes/60)}h</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>`
  } else if (reportType === 'att-summary') {
    tableHtml = `
      <table><thead><tr>
        <th>#</th><th>Code</th><th>Name</th><th>Dept</th>
        <th>P</th><th>L</th><th>L*</th><th>H</th><th>A</th><th>A½</th>
        <th>WO</th><th>Hol</th><th>Leave</th><th>LOP</th><th>Hours</th><th>OT Hrs</th><th>Att%</th>
      </tr></thead><tbody>
      ${rangeRows.map((emp,i) => {
        const t = emp.totals
        const pardoned = emp.days.filter(d => d.pardonedLate).length
        const hdAbs    = emp.days.filter(d => d.status === 'absent' && d.lopWeight === 0.5).length
        const lopDays  = (t.absent - hdAbs) + (hdAbs * 0.5)
        const totalWD  = t.present + t.late + t.halfDay + t.absent
        const attPct   = totalWD > 0 ? (((t.present + t.late + (t.halfDay * 0.5)) / totalWD) * 100).toFixed(1) : '0.0'
        return `<tr class="${i%2===0?'alt':''}">
          <td>${i+1}</td><td>${emp.code||''}</td><td>${emp.name}</td><td>${emp.department||'—'}</td>
          <td>${t.present-pardoned}</td><td>${t.late}</td><td style="color:#d97706">${pardoned}</td>
          <td>${t.halfDay}</td><td style="color:#c0392b">${t.absent-hdAbs}</td><td style="color:#c0392b">${hdAbs}</td>
          <td>${t.weekOff}</td><td style="color:#be185d">${t.holiday}</td><td style="color:#1d4ed8">${t.onLeave}</td>
          <td style="color:#c0392b;font-weight:700">${lopDays.toFixed(1)}</td>
          <td>${Math.floor(t.workedMinutes/60)}h ${t.workedMinutes%60}m</td>
          <td style="color:#7c3aed">${Math.floor(t.overtimeMinutes/60)}h ${t.overtimeMinutes%60}m</td>
          <td>${attPct}%</td>
        </tr>`
      }).join('')}
      </tbody></table>`
  } else if (reportType === 'payroll-register' || reportType === 'salary-slip') {
    tableHtml = `
      <table><thead><tr>
        <th>#</th><th>Code</th><th>Name</th><th>Dept</th>
        <th>Salary</th><th>LOP</th><th>Gross</th><th>OT</th><th>PF</th><th>ESI</th><th>PT</th><th>Deductions</th><th class="net">Net Pay</th>
      </tr></thead><tbody>
      ${payrollRows.map((r,i) => `<tr class="${i%2===0?'alt':''}">
        <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
        <td>${fmtN(r.salary)}</td><td style="color:#c0392b">${r.payroll.lopDays}d</td>
        <td>${fmtN(r.payroll.grossPay)}</td><td style="color:#7c3aed">${fmtN(r.payroll.otAmount)}</td>
        <td style="color:#ea580c">${fmtN(r.payroll.deductions.pf)}</td>
        <td style="color:#2563eb">${fmtN(r.payroll.deductions.esi)}</td>
        <td style="color:#7c3aed">${fmtN(r.payroll.deductions.pt)}</td>
        <td style="color:#c0392b">−${fmtN(r.payroll.deductions.total)}</td>
        <td class="net"><strong>${fmtN(r.payroll.netPay)}</strong></td>
      </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="6"><strong>TOTAL — ${payrollRows.length} employees</strong></td>
        <td><strong>${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.grossPay,0))}</strong></td>
        <td><strong>${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.otAmount,0))}</strong></td>
        <td><strong>${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.deductions.pf,0))}</strong></td>
        <td><strong>${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.deductions.esi,0))}</strong></td>
        <td><strong>${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.deductions.pt,0))}</strong></td>
        <td><strong>−${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.deductions.total,0))}</strong></td>
        <td class="net"><strong>${fmtN(payrollRows.reduce((s,r)=>s+r.payroll.netPay,0))}</strong></td>
      </tr></tfoot></table>`
  } else if (reportType === 'lop-report') {
    const lopRows = payrollRows.filter(r => r.payroll.lopDays > 0)
    tableHtml = `
      <table><thead><tr><th>#</th><th>Code</th><th>Name</th><th>Dept</th><th>Salary</th><th>Daily Rate</th><th>Absent (Full)</th><th>Absent (Half-Day)</th><th>LOP Days</th><th>LOP Amount</th><th>Net Pay</th></tr></thead>
      <tbody>${lopRows.map((r,i) => {
        const hdAbs = r.attendance.halfDayWeekdayAbsent||0
        return `<tr class="${i%2===0?'alt':''}">
          <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
          <td>${fmtN(r.salary)}</td><td>${fmtN(r.payroll.dailyRate)}</td>
          <td style="color:#c0392b">${r.attendance.absent-hdAbs}</td>
          <td style="color:#c0392b">${hdAbs}×½</td>
          <td style="color:#c0392b;font-weight:700">${r.payroll.lopDays}d</td>
          <td style="color:#c0392b">−${fmtN(r.payroll.lopDays*r.payroll.dailyRate)}</td>
          <td class="net">${fmtN(r.payroll.netPay)}</td>
        </tr>`
      }).join('')}</tbody></table>`
  } else if (reportType === 'ot-report') {
    tableHtml = `
      <table><thead><tr><th>#</th><th>Code</th><th>Name</th><th>Dept</th><th>OT Minutes</th><th>OT Hours</th><th>Daily Rate</th><th class="net">OT Amount</th></tr></thead>
      <tbody>${payrollRows.filter(r=>r.attendance.overtimeMinutes>0).map((r,i) => `<tr class="${i%2===0?'alt':''}">
        <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
        <td>${r.attendance.overtimeMinutes}m</td><td>${(r.attendance.overtimeMinutes/60).toFixed(2)}h</td>
        <td>${fmtN(r.payroll.hourlyRate)}/hr</td>
        <td class="net"><strong>${fmtN(r.payroll.otAmount)}</strong></td>
      </tr>`).join('')}</tbody></table>`
  } else if (reportType === 'deductions') {
    tableHtml = `
      <table><thead><tr><th>#</th><th>Code</th><th>Name</th><th>Dept</th><th>Gross</th><th>PF</th><th>ESI</th><th>PT</th><th>Total</th><th class="net">Net Pay</th></tr></thead>
      <tbody>${payrollRows.map((r,i) => `<tr class="${i%2===0?'alt':''}">
        <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
        <td>${fmtN(r.payroll.grossPay)}</td>
        <td style="color:#ea580c">${fmtN(r.payroll.deductions.pf)}</td>
        <td style="color:#2563eb">${fmtN(r.payroll.deductions.esi)}</td>
        <td style="color:#7c3aed">${fmtN(r.payroll.deductions.pt)}</td>
        <td style="color:#c0392b">−${fmtN(r.payroll.deductions.total)}</td>
        <td class="net"><strong>${fmtN(r.payroll.netPay)}</strong></td>
      </tr>`).join('')}</tbody></table>`
  } else if (reportType === 'bank-advice') {
    const bankRows = payrollRows.filter(r => r.bankDetails?.accountNumber)
    tableHtml = `
      <table><thead><tr><th>#</th><th>Code</th><th>Name</th><th>Bank</th><th>Account No</th><th>IFSC</th><th class="net">Net Pay</th></tr></thead>
      <tbody>${bankRows.map((r,i) => `<tr class="${i%2===0?'alt':''}">
        <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td>
        <td>${r.bankDetails.bankName||''}</td><td>${r.bankDetails.accountNumber}</td><td>${r.bankDetails.ifscCode||''}</td>
        <td class="net"><strong>${fmtN(r.payroll.netPay)}</strong></td>
      </tr>`).join('')}
      </tbody><tfoot><tr>
        <td colspan="6"><strong>Total Transfer Amount</strong></td>
        <td class="net"><strong>${fmtN(bankRows.reduce((s,r)=>s+r.payroll.netPay,0))}</strong></td>
      </tr></tfoot></table>`
  }

  // ── Abbreviation legend ─────────────────────────────────────────────────────
  const abbrHtml = `<div class="abbr-box">
    <strong style="display:block;margin-bottom:5px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Abbreviation Key</strong>
    <div class="abbr-grid">
      ${[
        ['P','Present','#34d399'],['L','Late','#fb923c'],['L*','Late (Pardoned)','#fbbf24'],
        ['H','Half Day','#facc15'],['A','Absent','#f87171'],['A½','Absent (Half-Day Weekday)','#fca5a5'],
        ['WO','Week Off','#8080a8'],['Hol','Holiday','#f472b6'],['PL','Paid Leave','#60a5fa'],
        ['Lv','On Leave','#60a5fa'],['Gross','Salary after LOP','#1a1a2e'],['OT','Overtime (1.5×)','#7c3aed'],
        ['PF','Provident Fund 12%','#ea580c'],['ESI','ESI 0.75%','#2563eb'],['PT','Prof. Tax ₹200/mo','#7c3aed'],
        ['LOP','Loss of Pay','#c0392b'],['Net','Gross + OT − PF − ESI − PT','#16a34a'],
      ].map(([a,l,c]) => `<div class="abbr-item"><span class="abbr-chip" style="color:${c};border-color:${c}20;background:${c}12">${a}</span>${l}</div>`).join('')}
    </div>
    <div class="formula-bar">Net Pay = (Salary − LOP) + OT − PF − ESI − PT &nbsp;|&nbsp; Daily Rate = Monthly Salary ÷ 26 &nbsp;|&nbsp; L* counted as Present for pay</div>
  </div>`

  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>${title} · ${period.startDate} to ${period.endDate}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#1a1a2e; background:#fff;
           padding:${isLandscape ? '14px 16px' : '20px 24px'}; }
    @page { size:${isLandscape ? 'A3 landscape' : 'A4 portrait'}; margin:10mm; }

    /* ── Header card ── */
    .header-card { display:flex; align-items:stretch; border:1.5px solid #1a1a2e; border-radius:10px;
      overflow:hidden; margin-bottom:14px; box-shadow:0 2px 8px rgba(0,0,0,.12); }
    .header-logo-col { width:80px; min-width:80px; background:#1a1a2e;
      display:flex; align-items:center; justify-content:center; padding:12px; }
    .logo-placeholder { width:52px; height:52px; border-radius:7px; background:rgba(255,255,255,.1);
      border:2px solid rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center;
      font-size:20px; font-weight:900; color:rgba(255,255,255,.75); }
    .header-org-col { flex:1; padding:12px 16px; background:#f8f8fc; border-right:1px solid #e0e0ec; }
    .org-name { font-size:15px; font-weight:900; color:#1a1a2e; letter-spacing:-0.3px; }
    .org-industry { font-size:9.5px; font-weight:700; color:#4a5568; text-transform:uppercase;
      letter-spacing:0.05em; margin-top:2px; }
    .org-details { margin-top:8px; display:flex; flex-direction:column; gap:3px; }
    .org-details span { font-size:9.5px; color:#555; }
    .header-report-col { width:190px; min-width:170px; padding:12px 14px; background:#1a1a2e;
      display:flex; flex-direction:column; justify-content:center; gap:3px; }
    .report-badge { display:inline-block; padding:2px 8px; background:rgba(255,255,255,.1);
      border:1px solid rgba(255,255,255,.2); border-radius:20px; font-size:8.5px; font-weight:700;
      color:#a0b0ff; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px; width:fit-content; }
    .report-title { font-size:12px; font-weight:800; color:#fff; line-height:1.3; }
    .report-meta { font-size:9px; color:rgba(255,255,255,.55); margin-top:2px; }
    .report-meta strong { color:rgba(255,255,255,.8); font-weight:600; }

    /* ── Standard table ── */
    table { width:100%; border-collapse:collapse; font-size:${isLandscape ? '8.5px' : '10.5px'}; margin-top:4px; }
    th { background:#1a1a2e; color:#fff; font-weight:700; padding:${isLandscape?'4px 5px':'6px 9px'};
      text-align:center; font-size:${isLandscape?'8px':'9.5px'}; white-space:nowrap; }
    td { padding:${isLandscape?'3px 4px':'5px 9px'}; border-bottom:1px solid #eee; text-align:center; vertical-align:top; }
    tr.alt td { background:#f9f9fc; }
    tfoot td { background:#eef0f8; font-weight:700; border-top:2px solid #1a1a2e; }
    td.name, td.dept { text-align:left; }
    td.idx, td.code { text-align:center; color:#666; }
    .net { color:#16a34a; font-weight:700; }

    /* ── Monthly attendance table ── */
    .monthly-tbl th.day-hdr { width:${Math.max(30, Math.round(500/dates.length))}px; font-size:7.5px; padding:3px 2px; }
    .monthly-tbl th.day-hdr.weekend { background:#2d2d4e; }
    .monthly-tbl td.day-cell { padding:2px 2px; font-size:8px; line-height:1.2; vertical-align:top; min-width:28px; }
    .monthly-tbl td.day-cell.wknd { background:rgba(107,114,128,.06); }
    .time-row { font-size:7px; color:#666; font-family:monospace; white-space:nowrap; }
    .time-row.out { color:#888; }
    td.sum { font-size:9px; font-weight:700; padding:3px 4px; }
    td.lo { color:#ea580c; } td.amber { color:#d97706; } td.red { color:#c0392b; }
    td.dim { color:#6b7280; } td.pink { color:#be185d; } td.blue { color:#1d4ed8; } td.pu { color:#7c3aed; }

    /* ── Abbreviation box ── */
    .abbr-box { margin-top:14px; padding:10px 12px; background:#f5f5fb; border:1px solid #dde;
      border-radius:7px; font-size:9px; color:#444; }
    .abbr-grid { display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:5px; }
    .abbr-item { display:flex; align-items:center; gap:4px; font-size:9px; }
    .abbr-chip { display:inline-block; padding:1px 5px; border-radius:3px; border:1px solid;
      font-family:monospace; font-weight:700; font-size:8.5px; }
    .formula-bar { margin-top:7px; padding:5px 9px; background:#fff; border:1px solid #dde;
      border-radius:5px; font-size:8.5px; color:#555; font-style:italic; }

    /* ── Footer ── */
    .powered-footer { margin-top:16px; padding:8px 14px; border-top:1.5px solid #1a1a2e;
      display:flex; align-items:center; justify-content:space-between; }
    .footer-note { font-size:8.5px; color:#888; }
    .footer-brand { text-align:center; }
    .brand-name { font-size:10px; font-weight:800; color:#1a1a2e; letter-spacing:-0.2px; }
    .brand-name span { color:#4f46e5; }
    .brand-tag { font-size:8px; color:#6b7280; font-style:italic; margin-top:1px; }
    .footer-conf { font-size:8.5px; color:#888; text-align:right; }

    @media print { button { display:none !important; } .header-card { box-shadow:none; } }
  </style></head><body>
  ${headerHtml}
  ${tableHtml}
  ${abbrHtml}
  <div class="powered-footer">
    <div class="footer-note">This report is system-generated and does not require a physical signature.</div>
    <div class="footer-brand">
      <div class="brand-name">Proudly Powered By &nbsp;<span>Insha Technologies</span></div>
      <div class="brand-tag">Attendix — Attendance &amp; Payroll Simplified</div>
    </div>
    <div class="footer-conf">Confidential · For internal use only</div>
  </div>
  <script>setTimeout(()=>window.print(),450)</script>
  </body></html>`)
  win.document.close()
}

// ── UI Components ─────────────────────────────────────────────────────────────
const GENDER_CFG = { male:{symbol:'♂',color:'#60a5fa'}, female:{symbol:'♀',color:'#f472b6'}, other:{symbol:'⚧',color:'#a78bfa'} }
function GI({ gender }) {
  const c = GENDER_CFG[gender]; if (!c) return null
  return <span style={{ fontSize:'0.8rem', color:c.color, flexShrink:0 }}>{c.symbol}</span>
}

function DataStatusBadge({ label, count, icon:Icon, color, loaded }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10,
      background: loaded ? `color-mix(in srgb,${color} 8%,transparent)` : 'var(--bg-surface2)',
      border:`1px solid ${loaded ? `color-mix(in srgb,${color} 22%,transparent)` : 'var(--border)'}`,
      flex:1, minWidth:140 }}>
      <div style={{ width:28, height:28, borderRadius:8, background:`color-mix(in srgb,${color} 12%,transparent)`,
        border:`1px solid color-mix(in srgb,${color} 20%,transparent)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={13} style={{ color: loaded ? color : 'var(--text-dim)' }}/>
      </div>
      <div>
        <p style={{ fontSize:'0.7rem', color:'var(--text-dim)', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</p>
        <p style={{ fontSize:'0.85rem', fontWeight:700, color: loaded ? color : 'var(--text-muted)', fontFamily:'monospace' }}>
          {loaded ? `${count} employees` : 'Not loaded'}
        </p>
      </div>
      {loaded && <CheckCircle2 size={13} style={{ color, marginLeft:'auto', flexShrink:0 }}/>}
    </div>
  )
}

function ReportTypeCard({ rt, selected, onClick, disabled }) {
  const Icon = rt.icon
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={() => !disabled && onClick(rt.id)}
      style={{
        display:'flex', flexDirection:'column', gap:5, padding:'11px 13px', borderRadius:11,
        cursor: disabled ? 'not-allowed' : 'pointer', textAlign:'left', transition:'all .15s',
        background: selected ? 'color-mix(in srgb,var(--accent) 10%,transparent)' : 'var(--bg-surface2)',
        border:`1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        opacity: disabled ? 0.45 : 1, position:'relative',
      }}>
      {rt.featured && (
        <div style={{ position:'absolute', top:6, right:7, display:'flex', alignItems:'center', gap:3,
          padding:'1px 6px', borderRadius:20, background:'rgba(250,204,21,.15)', border:'1px solid rgba(250,204,21,.3)' }}>
          <Star size={8} style={{ color:'#fbbf24', fill:'#fbbf24' }}/>
          <span style={{ fontSize:'0.6rem', color:'#fbbf24', fontWeight:700 }}>NEW</span>
        </div>
      )}
      <Icon size={14} style={{ color: selected ? 'var(--accent)' : 'var(--text-muted)' }}/>
      <p style={{ fontSize:'0.775rem', fontWeight:700, color: selected ? 'var(--accent)' : 'var(--text-secondary)', lineHeight:1.2 }}>{rt.label}</p>
      <p style={{ fontSize:'0.65rem', color:'var(--text-dim)', lineHeight:1.3 }}>{rt.desc}</p>
    </motion.button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Reports() {
  const getOrg  = useOrgContext(s => s.org)
  const orgId   = useOrgContext(s => s.orgId)

  const [startDate, setStart]  = useState(monthStart())
  const [endDate,   setEnd]    = useState(todayStr())
  const [fDept,     setFDept]  = useState('')
  const [depts,     setDepts]  = useState([])
  const [rangeData,   setRange]   = useState(null)
  const [payrollData, setPayroll] = useState(null)
  const [loading,   setLoad]   = useState(false)
  const [error,     setError]  = useState(null)
  const [reportType, setType]  = useState('monthly-att')
  const [scope,     setScope]  = useState('all')   // 'all' | 'selected'
  const [selected,  setSel]    = useState(new Set())

  useEffect(() => {
    if (!orgId) return
    setFDept('')
    api.get(`/organizations/${orgId}/employees/meta/departments`)
      .then(r => setDepts(r.data?.departments || []))
      .catch(() => {})
  }, [orgId])

  async function load() {
    if (!orgId) return
    setLoad(true); setError(null); setRange(null); setPayroll(null)
    try {
      const p = new URLSearchParams({ startDate, endDate })
      if (fDept) p.set('department', fDept)
      const [rng, pay] = await Promise.all([
        api.get(`/organizations/${orgId}/attendance/range?${p}`),
        api.get(`/organizations/${orgId}/attendance/payroll?${p}`),
      ])
      setRange(rng); setPayroll(pay); setSel(new Set())
    } catch(e) { setError(e.message) }
    finally { setLoad(false) }
  }

  const activeRT   = REPORT_TYPES.find(r => r.id === reportType)
  const isAttType  = activeRT?.cat === 'attendance'
  const baseRows   = isAttType ? (rangeData?.data || []) : (payrollData?.data || [])
  const filtered   = fDept ? baseRows.filter(r => r.department === fDept) : baseRows
  const scopedRows = scope === 'selected' && selected.size > 0 ? filtered.filter(r => selected.has(r.employeeId)) : filtered

  const rangeRows   = isAttType ? scopedRows : (scope === 'selected' && selected.size > 0
    ? (rangeData?.data || []).filter(r => selected.has(r.employeeId))
    : (rangeData?.data || []))
  const payrollRows = isAttType ? (scope === 'selected' && selected.size > 0
    ? (payrollData?.data || []).filter(r => selected.has(r.employeeId))
    : (payrollData?.data || []))
    : scopedRows

  function toggleAll() {
    if (selected.size === filtered.length) setSel(new Set())
    else setSel(new Set(filtered.map(r => r.employeeId)))
  }
  function toggleOne(id) {
    const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSel(s)
  }

  const dataLoaded = rangeData || payrollData
  const org = getOrg()

  return (
    <UserPage>
      <UserPageHeader
        title="Reports & Downloads"
        icon={PieChart}
        iconColor="#58a6ff"
        subtitle="Attendance, payroll and statutory reports — Excel & PDF">
        <AbbrLegendButton/>
      </UserPageHeader>

      {/* ── No org guard ── */}
      {!orgId && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4rem 0', gap:14 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'var(--bg-surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <PieChart size={24} style={{ color:'var(--text-dim)' }}/>
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>No organization selected</p>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>Select an organization from the top bar to generate reports.</p>
          </div>
        </div>
      )}

      {orgId && (<div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Controls ── */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14,
        padding:'16px 18px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end',
        boxShadow:'var(--shadow-card)' }}>
        <Input label="From" type="date" value={startDate} onChange={e => setStart(e.target.value)} style={{ width:160 }}/>
        <Input label="To"   type="date" value={endDate}   onChange={e => setEnd(e.target.value)}   style={{ width:160 }}/>
        {depts.length > 0 && (
          <div style={{ paddingBottom:2 }}>
            <label style={{ fontSize:'0.72rem', color:'var(--text-dim)', display:'block', marginBottom:4 }}>Department</label>
            <select value={fDept} onChange={e => setFDept(e.target.value)}
              className="field-input" style={{ width:'auto', fontSize:'0.8125rem' }}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        <div style={{ paddingBottom:2 }}>
          <Button onClick={load} loading={loading}>
            <Filter size={13}/> Load Reports
          </Button>
        </div>
        {dataLoaded && !loading && (
          <div style={{ paddingBottom:2, marginLeft:'auto' }}>
            <Button variant="secondary" onClick={load} loading={loading}>
              <RefreshCw size={13}/> Refresh
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:10,
          background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.2)' }}>
          <AlertTriangle size={15} style={{ color:'#f87171', flexShrink:0 }}/>
          <p style={{ fontSize:'0.875rem', color:'#f87171' }}>{error}</p>
        </div>
      )}

      {/* ── Data status ── */}
      {dataLoaded && !loading && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <DataStatusBadge label="Attendance Data" count={rangeData?.data?.length ?? 0}   icon={CalendarDays} color="#58a6ff" loaded={!!rangeData}/>
          <DataStatusBadge label="Payroll Data"    count={payrollData?.data?.length ?? 0} icon={Wallet}       color="#34d399" loaded={!!payrollData}/>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10,
            background:'var(--bg-surface2)', border:'1px solid var(--border)', flex:1, minWidth:140 }}>
            <Clock3 size={13} style={{ color:'var(--text-dim)' }}/>
            <p style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>
              <strong style={{ color:'var(--text-secondary)' }}>{rangeData?.startDate}</strong>
              {' → '}
              <strong style={{ color:'var(--text-secondary)' }}>{rangeData?.endDate}</strong>
              {' · '}
              <span>{rangeData?.totalDays} calendar days</span>
            </p>
          </div>
        </div>
      )}

      {!dataLoaded && !loading && !error && (
        <Empty icon={PieChart} title="No data loaded" description="Choose a date range and click Load Reports to generate all report types."/>
      )}

      {loading && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, padding:'3rem 0' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'var(--bg-surface2)', border:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <RefreshCw size={20} style={{ color:'var(--accent)', animation:'spin 1s linear infinite' }}/>
          </div>
          <p style={{ color:'var(--text-dim)', fontSize:'0.875rem' }}>Loading attendance & payroll data…</p>
        </div>
      )}

      {dataLoaded && !loading && (<>

        {/* ── Report type selector ── */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14,
          padding:'18px 20px', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Attendance reports */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div style={{ width:4, height:16, borderRadius:2, background:'#58a6ff' }}/>
              <p style={{ fontSize:'0.72rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.08em', color:'var(--text-dim)' }}>Attendance Reports</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:8 }}>
              {REPORT_TYPES.filter(r => r.cat === 'attendance').map(rt => (
                <ReportTypeCard
                  key={rt.id} rt={rt}
                  selected={reportType === rt.id}
                  onClick={setType}
                  disabled={false}/>
              ))}
            </div>
          </div>

          {/* Payroll reports */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div style={{ width:4, height:16, borderRadius:2, background:'#34d399' }}/>
              <p style={{ fontSize:'0.72rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.08em', color:'var(--text-dim)' }}>Payroll Reports</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:8 }}>
              {REPORT_TYPES.filter(r => r.cat === 'payroll').map(rt => (
                <ReportTypeCard
                  key={rt.id} rt={rt}
                  selected={reportType === rt.id}
                  onClick={setType}
                  disabled={false}/>
              ))}
            </div>
          </div>
        </div>

        {/* ── Scope + Employee selector ── */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14,
          padding:'16px 20px', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', gap:14 }}>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            {/* Scope */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-secondary)' }}>Include:</span>
              {[
                { v:'all',      label:`All (${filtered.length})` },
                { v:'selected', label:`Selected (${selected.size})` },
              ].map(s => (
                <button key={s.v} onClick={() => setScope(s.v)}
                  disabled={s.v === 'selected' && selected.size === 0}
                  style={{
                    padding:'5px 14px', borderRadius:8, fontSize:'0.78rem', fontWeight:600,
                    cursor: s.v === 'selected' && selected.size === 0 ? 'not-allowed' : 'pointer', transition:'all .12s',
                    background: scope===s.v ? 'var(--accent)' : 'var(--bg-surface2)',
                    color: scope===s.v ? '#000' : (s.v==='selected'&&selected.size===0) ? 'var(--text-dim)' : 'var(--text-secondary)',
                    border:`1px solid ${scope===s.v ? 'var(--accent)' : 'var(--border)'}`,
                    opacity: s.v==='selected' && selected.size===0 ? 0.5 : 1,
                  }}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Download */}
            <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
              <button
                onClick={() => downloadExcel(reportType, { startDate, endDate }, org, rangeRows, payrollRows)}
                disabled={!scopedRows.length}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:9,
                  cursor: !scopedRows.length ? 'not-allowed' : 'pointer', transition:'all .13s',
                  background:'rgba(52,211,153,.1)', color:'#34d399', border:'1px solid rgba(52,211,153,.25)',
                  fontSize:'0.82rem', fontWeight:700, opacity: !scopedRows.length ? 0.5 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(52,211,153,.18)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(52,211,153,.1)'}>
                <Download size={14}/> Download Excel
              </button>
              <button
                onClick={() => printReport(reportType, { startDate, endDate }, org, rangeRows, payrollRows)}
                disabled={!scopedRows.length}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:9,
                  cursor: !scopedRows.length ? 'not-allowed' : 'pointer', transition:'all .13s',
                  background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.25)',
                  fontSize:'0.82rem', fontWeight:700, opacity: !scopedRows.length ? 0.5 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(248,113,113,.18)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(248,113,113,.1)'}>
                <Printer size={14}/> Print / PDF
              </button>
            </div>
          </div>

          {scope === 'selected' && selected.size === 0 && (
            <p style={{ fontSize:'0.78rem', color:'var(--text-dim)', fontStyle:'italic' }}>
              Select employees from the preview table below using checkboxes.
            </p>
          )}
        </div>

        {/* ── Employee preview table ── */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14,
          overflow:'hidden', boxShadow:'var(--shadow-card)' }}>

          {/* Table header */}
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border-soft)',
            display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <activeRT.icon size={14} style={{ color:'var(--accent)' }}/>
            <span style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-primary)' }}>{activeRT.label}</span>
            <span style={{ fontSize:'0.72rem', color:'var(--text-dim)', fontFamily:'monospace' }}>
              {startDate} → {endDate} · {filtered.length} employees
            </span>
            {selected.size > 0 && (
              <span style={{ fontSize:'0.72rem', color:'var(--accent)', fontFamily:'monospace', marginLeft:'auto' }}>
                {selected.size} selected
              </span>
            )}
          </div>

          {/* Attendance preview */}
          {isAttType && rangeData?.data && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', minWidth:700 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    <th className="tbl-head" style={{ width:36 }}>
                      <div onClick={toggleAll} style={{ width:16, height:16, borderRadius:4, cursor:'pointer',
                        border:`2px solid ${selected.size===filtered.length&&filtered.length>0?'var(--accent)':'var(--border)'}`,
                        background: selected.size===filtered.length&&filtered.length>0 ? 'var(--accent)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {selected.size===filtered.length&&filtered.length>0 && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth={2} strokeLinecap="round"/></svg>}
                      </div>
                    </th>
                    <th className="tbl-head">Employee</th>
                    <th className="tbl-head">Dept / Shift</th>
                    <th className="tbl-head"><span title="Present">P</span></th>
                    <th className="tbl-head"><span title="Late (Charged)">L</span></th>
                    <th className="tbl-head"><span title="Late (Pardoned)">L*</span></th>
                    <th className="tbl-head"><span title="Half Day">H</span></th>
                    <th className="tbl-head"><span title="Absent Full">A</span></th>
                    <th className="tbl-head"><span title="Absent Half-Day Weekday">A½</span></th>
                    <th className="tbl-head"><span title="Week Off">WO</span></th>
                    <th className="tbl-head"><span title="Holiday">Hol</span></th>
                    <th className="tbl-head"><span title="Leave">Lv</span></th>
                    <th className="tbl-head"><span title="Loss of Pay days">LOP</span></th>
                    <th className="tbl-head"><span title="Worked Hours">Hours</span></th>
                    <th className="tbl-head"><span title="Overtime Hours">OT</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp, idx) => {
                    const t       = emp.totals
                    const pardoned  = emp.days.filter(d => d.pardonedLate).length
                    const hdAbsent  = emp.days.filter(d => d.status === 'absent' && d.lopWeight === 0.5).length
                    const lopDays   = (t.absent - hdAbsent) + (hdAbsent * 0.5)
                    const isSel     = selected.has(emp.employeeId)
                    return (
                      <motion.tr key={emp.employeeId} initial={{ opacity:0 }} animate={{ opacity:1 }}
                        className="tbl-row" style={{ cursor:'pointer', background: isSel ? 'color-mix(in srgb,var(--accent) 6%,transparent)' : undefined }}
                        onClick={() => toggleOne(emp.employeeId)}>
                        <td className="tbl-cell" onClick={e => { e.stopPropagation(); toggleOne(emp.employeeId) }} style={{ width:36 }}>
                          <div style={{ width:16, height:16, borderRadius:4,
                            border:`2px solid ${isSel?'var(--accent)':'var(--border)'}`,
                            background: isSel ? 'var(--accent)' : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .12s' }}>
                            {isSel && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth={2} strokeLinecap="round"/></svg>}
                          </div>
                        </td>
                        <td className="tbl-cell">
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <UserAvatar name={emp.name} photo={emp.photo} size={28}/>
                            <div>
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)' }}>{emp.name}</span>
                                <GI gender={emp.gender}/>
                              </div>
                              <span style={{ fontSize:'0.7rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{emp.code}</span>
                            </div>
                          </div>
                        </td>
                        <td className="tbl-cell">
                          <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{emp.department||'—'}</div>
                          <div style={{ fontSize:'0.68rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{emp.shift?.name||'—'}</div>
                        </td>
                        {[
                          [t.present - pardoned, '#34d399'],
                          [t.late,               '#fb923c'],
                          [pardoned,             '#fbbf24'],
                          [t.halfDay,            '#facc15'],
                          [t.absent - hdAbsent,  '#f87171'],
                          [hdAbsent,             '#fca5a5'],
                          [t.weekOff,            'var(--text-muted)'],
                          [t.holiday,            '#f472b6'],
                          [t.onLeave,            '#60a5fa'],
                        ].map(([val, color], ci) => (
                          <td key={ci} className="tbl-cell" style={{ textAlign:'center' }}>
                            <span style={{ fontFamily:'monospace', fontSize:'0.82rem', fontWeight:700,
                              color: val > 0 ? color : 'var(--text-dim)' }}>{val}</span>
                          </td>
                        ))}
                        <td className="tbl-cell" style={{ textAlign:'center' }}>
                          <span style={{ fontFamily:'monospace', fontSize:'0.82rem', fontWeight:700,
                            color: lopDays > 0 ? '#f87171' : 'var(--text-dim)' }}>{lopDays.toFixed(1)}</span>
                        </td>
                        <td className="tbl-cell" style={{ textAlign:'center' }}>
                          <span style={{ fontFamily:'monospace', fontSize:'0.78rem', color:'var(--text-secondary)' }}>{fmtH(t.workedMinutes)}</span>
                        </td>
                        <td className="tbl-cell" style={{ textAlign:'center' }}>
                          <span style={{ fontFamily:'monospace', fontSize:'0.78rem', color: t.overtimeMinutes > 0 ? '#c084fc' : 'var(--text-dim)' }}>{fmtH(t.overtimeMinutes)}</span>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Payroll preview */}
          {!isAttType && payrollData?.data && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', minWidth:860 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    <th className="tbl-head" style={{ width:36 }}>
                      <div onClick={toggleAll} style={{ width:16, height:16, borderRadius:4, cursor:'pointer',
                        border:`2px solid ${selected.size===filtered.length&&filtered.length>0?'var(--accent)':'var(--border)'}`,
                        background: selected.size===filtered.length&&filtered.length>0 ? 'var(--accent)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {selected.size===filtered.length&&filtered.length>0 && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth={2} strokeLinecap="round"/></svg>}
                      </div>
                    </th>
                    <th className="tbl-head">Employee</th>
                    <th className="tbl-head">Dept</th>
                    <th className="tbl-head">Attendance</th>
                    <th className="tbl-head"><span title="Loss of Pay">LOP</span></th>
                    <th className="tbl-head">Gross</th>
                    <th className="tbl-head"><span title="Overtime" style={{ color:'#c084fc' }}>OT</span></th>
                    <th className="tbl-head"><span title="Total deductions" style={{ color:'#f87171' }}>Deduct</span></th>
                    <th className="tbl-head"><span style={{ color:'#34d399' }}>Net Pay</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rec, idx) => {
                    const p   = rec.payroll
                    const at  = rec.attendance
                    const isSel = selected.has(rec.employeeId)
                    return (
                      <motion.tr key={rec.employeeId} initial={{ opacity:0 }} animate={{ opacity:1 }}
                        className="tbl-row" style={{ cursor:'pointer', background: isSel ? 'color-mix(in srgb,var(--accent) 6%,transparent)' : undefined }}
                        onClick={() => toggleOne(rec.employeeId)}>
                        <td className="tbl-cell" onClick={e => { e.stopPropagation(); toggleOne(rec.employeeId) }} style={{ width:36 }}>
                          <div style={{ width:16, height:16, borderRadius:4,
                            border:`2px solid ${isSel?'var(--accent)':'var(--border)'}`,
                            background: isSel ? 'var(--accent)' : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .12s' }}>
                            {isSel && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth={2} strokeLinecap="round"/></svg>}
                          </div>
                        </td>
                        <td className="tbl-cell">
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <UserAvatar name={rec.name} photo={rec.photo} size={28}/>
                            <div>
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)' }}>{rec.name}</span>
                                <GI gender={rec.gender}/>
                              </div>
                              <span style={{ fontSize:'0.7rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{rec.code}</span>
                            </div>
                          </div>
                        </td>
                        <td className="tbl-cell" style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{rec.department||'—'}</td>
                        <td className="tbl-cell">
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {[
                              ['P',  at.present,    '#34d399'],
                              ['L',  at.late,        '#fb923c'],
                              ['H',  at.halfDay,     '#facc15'],
                              ['A',  at.absent,      '#f87171'],
                            ].filter(([,v]) => v > 0).map(([k,v,c]) => (
                              <span key={k} style={{ fontSize:'0.65rem', fontFamily:'monospace', fontWeight:700,
                                padding:'1px 5px', borderRadius:4, background:`color-mix(in srgb,${c} 12%,transparent)`,
                                border:`1px solid color-mix(in srgb,${c} 22%,transparent)`, color:c }}>
                                {k}:{v}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="tbl-cell" style={{ textAlign:'center' }}>
                          <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'0.82rem',
                            color: p.lopDays > 0 ? '#f87171' : 'var(--text-dim)' }}>{p.lopDays}d</span>
                        </td>
                        <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.82rem', color:'var(--text-primary)' }}>{fmt(p.grossPay)}</td>
                        <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.82rem', color: p.otAmount > 0 ? '#c084fc' : 'var(--text-dim)' }}>{fmt(p.otAmount)}</td>
                        <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.82rem', color:'#f87171' }}>−{fmt(p.deductions.total)}</td>
                        <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.88rem', fontWeight:800,
                          color: p.netPay > 0 ? '#34d399' : '#f87171' }}>{fmt(p.netPay)}</td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length === 0 && (
            <Empty icon={Users} title="No employees found" description="No data for the selected period and filters."/>
          )}
        </div>

        {/* ── Hint for monthly att ── */}
        {reportType === 'monthly-att' && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:10,
            background:'rgba(88,166,255,.05)', border:'1px solid rgba(88,166,255,.15)' }}>
            <Activity size={14} style={{ color:'#58a6ff', flexShrink:0, marginTop:2 }}/>
            <div>
              <p style={{ fontSize:'0.8rem', fontWeight:600, color:'#58a6ff', marginBottom:2 }}>Monthly Attendance — Excel layout</p>
              <p style={{ fontSize:'0.75rem', color:'var(--text-dim)', lineHeight:1.5 }}>
                The Excel file includes one column per calendar day with <strong>status abbreviation</strong> (P / L / L* / H / A / A½ / WO / Hol),
                plus <strong>IN and OUT timestamps</strong> in each cell.
                A summary <em>Attendance Summary</em> sheet is automatically appended.
                The PDF uses A3 Landscape for readability.
              </p>
            </div>
          </div>
        )}

      </>)}

      </div>)}
    </UserPage>
  )
}
