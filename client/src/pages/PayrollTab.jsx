import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, TrendingUp, Users, ChevronDown, ChevronRight,
  Filter, Download, FileText, BarChart3, Clock, XCircle,
  CheckCircle2, Wallet, Receipt, PieChart, AlertTriangle,
  CreditCard, Shield, Minus, Plus, Printer, Fingerprint,
} from 'lucide-react'
import { Button }              from '../components/ui/Button'
import { Input }               from '../components/ui/Input'
import { Empty }               from '../components/ui/Empty'
import { UserAvatar }          from '../components/ui/UserUI'
import { SearchBox }           from '../components/ui/SearchBox'
import { AbbrLegendButton, buildAbbrKeySheet } from './AbbrLegend'
import { useOrgContext }       from '../store/context'
import Pagination              from '../components/ui/Pagination'
import * as XLSX               from 'xlsx'
import api                     from '../lib/api'

const PAYROLL_PAGE_SIZE = 25

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = n => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits:0, maximumFractionDigits:0 })}`
const fmtD = n => n == null ? '—' : Number(n).toFixed(1)
const fmtH = m => !m ? '—' : `${Math.floor(m/60)}h ${m%60}m`
const pct  = (a, b) => b > 0 ? `${((a/b)*100).toFixed(1)}%` : '—'
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const GENDER_CFG = { male:{ symbol:'♂', color:'#60a5fa' }, female:{ symbol:'♀', color:'#f472b6' }, other:{ symbol:'⚧', color:'#a78bfa' } }
function GI({ gender }) {
  const c = GENDER_CFG[gender]; if (!c) return null
  return <span style={{ fontSize:'0.8rem', color:c.color, flexShrink:0 }}>{c.symbol}</span>
}

// ── Report type definitions ───────────────────────────────────────────────────
const REPORT_TYPES = [
  { id:'payroll-register', label:'Payroll Register',     icon:Receipt,     desc:'Full salary breakdown for all employees',       group:'payroll'     },
  { id:'salary-slip',      label:'Salary Slip',          icon:FileText,    desc:'Individual pay slip per employee',               group:'payroll'     },
  { id:'att-summary',      label:'Attendance Summary',   icon:BarChart3,   desc:'Days present, absent, OT per employee',          group:'payroll'     },
  { id:'ot-report',        label:'Overtime Report',      icon:Clock,       desc:'OT hours and earnings analysis',                 group:'payroll'     },
  { id:'deductions',       label:'Deductions Report',    icon:Shield,      desc:'PF, ESI, PT breakdown',                          group:'payroll'     },
  { id:'lop-report',       label:'LOP Report',           icon:Minus,       desc:'Loss of Pay analysis per employee',              group:'payroll'     },
  { id:'bank-advice',      label:'Bank Transfer Advice', icon:CreditCard,  desc:'Net salary per account for bank upload',         group:'payroll'     },
  { id:'multi-punch',      label:'Punch Detail Report',  icon:Fingerprint, desc:'Raw punch timeline per employee with anomaly detection', group:'attendance' },
]

const PUNCH_TYPE_LABEL = { 0:'Check-In', 1:'Check-Out', 2:'Break Out', 3:'Break In', 4:'OT In', 5:'OT Out' }
const PUNCH_TYPE_COLOR = { 0:'#34d399', 1:'#f87171', 2:'#fb923c', 3:'#60a5fa', 4:'#c084fc', 5:'#f472b6' }
const FLAG_CFG = {
  'no-out':    { label:'No checkout',   color:'#fb923c', bg:'rgba(251,146,60,.12)'  },
  'odd-count': { label:'Odd punches',   color:'#facc15', bg:'rgba(250,204,21,.12)'  },
  'duplicate': { label:'Duplicate',     color:'#f87171', bg:'rgba(248,113,113,.12)' },
  'excess':    { label:'>6 punches',    color:'#c084fc', bg:'rgba(192,132,252,.12)' },
}

// ── Summary stat card ─────────────────────────────────────────────────────────
function PayStatCard({ label, value, sub, icon: Icon, accent, index }) {
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: index * 0.04 }}
      style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 18px',
        boxShadow:'0 4px 20px rgba(0,0,0,.2)', display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'0.7rem', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-dim)' }}>{label}</span>
        <div style={{ width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
          background:`color-mix(in srgb, ${accent} 12%, transparent)`, border:`1px solid color-mix(in srgb, ${accent} 20%, transparent)` }}>
          <Icon size={13} style={{ color:accent }}/>
        </div>
      </div>
      <p style={{ fontSize:'1.15rem', fontWeight:800, fontFamily:'monospace', color:accent }}>{value}</p>
      {sub && <p style={{ fontSize:'0.68rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{sub}</p>}
    </motion.div>
  )
}

// ── Expandable payroll row ─────────────────────────────────────────────────────
function PayrollRow({ rec, selected, onToggle }) {
  const [open, setOpen] = useState(false)
  const p  = rec.payroll
  const at = rec.attendance

  const netColor = p.netPay > 0 ? '#34d399' : '#f87171'

  return (
    <>
      <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }}
        className="tbl-row" style={{ cursor:'pointer' }}
        onClick={() => setOpen(v => !v)}>
        {/* Select */}
        <td className="tbl-cell" onClick={e => { e.stopPropagation(); onToggle() }} style={{ width:36 }}>
          <div style={{
            width:16, height:16, borderRadius:4, border:`2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            background: selected ? 'var(--accent)' : 'transparent',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', transition:'all .12s',
          }}>
            {selected && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth={2} strokeLinecap="round"/></svg>}
          </div>
        </td>
        {/* Employee */}
        <td className="tbl-cell">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <UserAvatar name={rec.name||'?'} photoUrl={rec.photo} size={32}/>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.name}</p>
                <GI gender={rec.gender}/>
              </div>
              <p style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{rec.code}</p>
            </div>
          </div>
        </td>
        {/* Dept */}
        <td className="tbl-cell">
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{rec.department || '—'}</p>
          <p style={{ fontSize:'0.68rem', color:'var(--text-dim)' }}>{rec.designation || ''}</p>
        </td>
        {/* Attendance summary */}
        <td className="tbl-cell">
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {[
              { v:at.present - (at.pardonedLate||0), color:'#34d399', label:'P',  tip:'Present (on-time)'                    },
              { v:at.late,                          color:'#fb923c', label:'L',  tip:'Late (charged)'                        },
              { v:at.pardonedLate,                  color:'#fbbf24', label:'L*', tip:'Late but pardoned (monthly allowance)' },
              { v:at.halfDay,      color:'#facc15', label:'H',  tip:'Half Day'                              },
              { v:(at.absent||0) - (at.halfDayWeekdayAbsent||0), color:'#f87171', label:'A',   tip:'Absent — full day LOP'                  },
              { v:at.halfDayWeekdayAbsent, color:'#fca5a5', label:'A½', tip:'Absent on half-day weekday — 0.5 LOP' },
              { v:at.paidLeave,    color:'#60a5fa', label:'PL', tip:'Paid Leave'                            },
            ].filter(x => x.v > 0).map(x => (
              <span key={x.label} title={x.tip} style={{ fontSize:'0.72rem', fontFamily:'monospace', fontWeight:700,
                color:x.color, padding:'1px 6px', borderRadius:4,
                background:`color-mix(in srgb,${x.color} 12%,transparent)`,
                border:`1px solid color-mix(in srgb,${x.color} 22%,transparent)` }}>
                {x.v}{x.label}
              </span>
            ))}
          </div>
        </td>
        {/* Working days */}
        <td className="tbl-cell">
          <p style={{ fontSize:'0.85rem', fontFamily:'monospace', color:'var(--text-secondary)', fontWeight:600 }}>{fmtD(p.effectiveDays)}</p>
          <p style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-dim)' }}>/ {p.workingDays} days</p>
        </td>
        {/* LOP */}
        <td className="tbl-cell">
          {p.lopDays > 0
            ? <span style={{ fontSize:'0.85rem', fontFamily:'monospace', fontWeight:700, color:'#f87171' }}>-{fmtD(p.lopDays)}d</span>
            : <span style={{ fontSize:'0.85rem', color:'var(--text-dim)' }}>—</span>}
        </td>
        {/* Gross */}
        <td className="tbl-cell">
          <p style={{ fontSize:'0.85rem', fontFamily:'monospace', fontWeight:700, color:'var(--text-primary)' }}>{fmt(p.grossPay)}</p>
        </td>
        {/* OT */}
        <td className="tbl-cell">
          {p.otAmount > 0
            ? <div>
                <p style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:700, color:'#c084fc' }}>{fmt(p.otAmount)}</p>
                <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)' }}>{fmtH(p.otMinutes)}</p>
              </div>
            : <span style={{ color:'var(--text-dim)', fontSize:'0.8rem' }}>—</span>}
        </td>
        {/* Deductions */}
        <td className="tbl-cell">
          {p.deductions.total > 0
            ? <p style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:700, color:'#f87171' }}>-{fmt(p.deductions.total)}</p>
            : <span style={{ color:'var(--text-dim)', fontSize:'0.8rem' }}>—</span>}
        </td>
        {/* Net */}
        <td className="tbl-cell">
          <p style={{ fontSize:'0.92rem', fontFamily:'monospace', fontWeight:800, color:netColor }}>{fmt(p.netPay)}</p>
        </td>
        {/* Expand toggle */}
        <td className="tbl-cell" style={{ width:32 }}>
          <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration:.15 }}>
            <ChevronRight size={14} style={{ color:'var(--text-dim)' }}/>
          </motion.div>
        </td>
      </motion.tr>

      {/* ── Expanded detail panel ── */}
      <AnimatePresence>
        {open && (
          <motion.tr key="detail" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <td colSpan={11} style={{ padding:0, border:'none', background:'var(--bg-surface2)' }}>
              <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                style={{ overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>

                  {/* Attendance breakdown */}
                  <div>
                    <p style={{ fontSize:'0.7rem', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-dim)', fontWeight:700, marginBottom:10 }}>Attendance Detail</p>
                    {[
                      { label:'Present (on-time)',        value:at.present - (at.pardonedLate||0), color:'#34d399' },
                      { label:'Late (charged)',          value:at.late,          color:'#fb923c' },
                      { label:'Late* (pardoned)',        value:at.pardonedLate,  color:'#fbbf24', note:'Monthly allowance applied — counted as Present' },
                      { label:'Half Day',                value:at.halfDay,       color:'#facc15' },
                      { label:'Absent — full LOP',        value:at.absent - (at.halfDayWeekdayAbsent||0), color:'#f87171' },
              { label:'Absent — half-day weekday (½ LOP)', value:at.halfDayWeekdayAbsent, color:'#fca5a5', note:'Scheduled half-day — counts as 0.5 LOP' },
                      { label:'Paid Leave',              value:at.paidLeave,     color:'#60a5fa' },
                      { label:'Unpaid Leave',            value:at.unpaidLeave,   color:'#a1a1aa' },
                      { label:'Holiday',                 value:at.holiday,       color:'#f472b6' },
                      { label:'Week Off',                value:at.weekOff,       color:'var(--text-muted)' },
                    ].filter(x => x.value > 0).map(x => (
                      <div key={x.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'3px 0', borderBottom:'1px solid var(--border-soft)' }}>
                        <div>
                          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{x.label}</span>
                          {x.note && <p style={{ fontSize:'0.62rem', color:'var(--text-dim)', fontStyle:'italic' }}>{x.note}</p>}
                        </div>
                        <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:600, color:x.color }}>{x.value}</span>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid var(--border-soft)' }}>
                      <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Hours Worked</span>
                      <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:600, color:'var(--text-secondary)' }}>{fmtH(at.workedMinutes)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}>
                      <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Overtime Hours</span>
                      <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:600, color:'#c084fc' }}>{fmtH(at.overtimeMinutes)}</span>
                    </div>
                  </div>

                  {/* Salary calculation */}
                  <div>
                    <p style={{ fontSize:'0.7rem', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-dim)', fontWeight:700, marginBottom:10 }}>Salary Calculation</p>
                    {(() => {
                      const rangeFullPay = +(p.workingDays * p.dailyRate).toFixed(2)
                      const lopAmt       = +(p.lopDays * p.dailyRate).toFixed(2)
                      const rows = [
                        { label:'Salary',         value:fmt(rec.salary),   note:`(${rec.salaryType})`,                                         color:'var(--text-secondary)' },
                        { label:'Daily Rate',     value:fmt(p.dailyRate),  note: p.fullMonthWorkingDays ? `(÷ ${p.fullMonthWorkingDays} working days in month)` : '', color:'var(--text-muted)' },
                        { label:'Working Days',   value:`${p.workingDays} days`, note:'(excl. week-off & holidays)',                           color:'var(--text-muted)' },
                        { label:`${p.workingDays}d × ₹${p.dailyRate}`, value:fmt(rangeFullPay), note:'range pay before LOP',                   color:'var(--text-secondary)' },
                        ...(p.lopDays > 0 ? [{ label:'LOP Deduction', value:`−${fmt(lopAmt)}`, note:`(${fmtD(p.lopDays)}d × ₹${p.dailyRate})`, color:'#f87171' }] : []),
                        { label:'Gross Pay',      value:fmt(p.grossPay),   note:'',                                                            color:'var(--text-primary)', bold:true },
                        { label:'Overtime',       value:p.otAmount > 0 ? `+${fmt(p.otAmount)}` : '—', note:'',                                color:'#c084fc' },
                      ]
                      return rows.map(x => (
                        <div key={x.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0', borderBottom:'1px solid var(--border-soft)' }}>
                          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{x.label} {x.note && <span style={{ color:'var(--text-dim)', fontSize:'0.68rem' }}>{x.note}</span>}</span>
                          <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight: x.bold ? 800 : 600, color:x.color }}>{x.value}</span>
                        </div>
                      ))
                    })()}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', marginTop:4,
                      borderTop:'2px solid var(--border)', background:`color-mix(in srgb,#34d399 5%,transparent)`, padding:'5px 8px', borderRadius:6 }}>
                      <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-primary)' }}>Net Pay</span>
                      <span style={{ fontSize:'0.92rem', fontFamily:'monospace', fontWeight:800, color:'#34d399' }}>{fmt(p.netPay)}</span>
                    </div>
                  </div>

                  {/* Deductions + bank */}
                  <div>
                    <p style={{ fontSize:'0.7rem', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-dim)', fontWeight:700, marginBottom:10 }}>Deductions & Info</p>
                    {[
                      { label:'PF (12%)',        value:fmt(p.deductions.pf),  color:'#fb923c', note: rec.pfNumber ? `UAN: ${rec.uanNumber||'—'}` : '(not enrolled)' },
                      { label:'ESI (0.75%)',     value:fmt(p.deductions.esi), color:'#60a5fa', note: rec.esiNumber || '(not enrolled)' },
                      { label:'Prof. Tax',       value:fmt(p.deductions.pt),  color:'#a78bfa' },
                      { label:'Total Deductions',value:`-${fmt(p.deductions.total)}`, color:'#f87171', bold:true },
                    ].map(x => (
                      <div key={x.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'3px 0', borderBottom:'1px solid var(--border-soft)' }}>
                        <div>
                          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{x.label}</span>
                          {x.note && <p style={{ fontSize:'0.62rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{x.note}</p>}
                        </div>
                        <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight: x.bold ? 800 : 600, color:x.color }}>{x.value}</span>
                      </div>
                    ))}
                    {rec.bankDetails?.bankName && (
                      <div style={{ marginTop:10, padding:'8px', borderRadius:8, background:'var(--bg-surface)', border:'1px solid var(--border)' }}>
                        <p style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Bank</p>
                        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{rec.bankDetails.bankName}</p>
                        <p style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{rec.bankDetails.accountNumber}</p>
                        <p style={{ fontSize:'0.68rem', color:'var(--text-dim)' }}>{rec.bankDetails.ifscCode}</p>
                      </div>
                    )}
                    {rec.panNumber && (
                      <p style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-dim)', marginTop:6 }}>PAN: {rec.panNumber}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Excel export functions ────────────────────────────────────────────────────
function buildPayrollRegisterSheet(rows, period) {
  const header = [
    '#','Code','Name','Dept','Designation','Salary Type','Monthly Salary',
    'Month Working Days','Range Working Days','Effective Days (Paid)','LOP Days','Daily Rate',
    'Range Full Pay','LOP Amount','Gross Pay','OT Amount',
    'Present (On-time)','Late (Charged)','Late* (Pardoned)','Half Day','Absent','Paid Leave','Holiday','Week Off',
    'Worked Hours','OT Hours',
    'PF (12%)','ESI (0.75%)','Prof Tax','Total Deductions','Net Pay',
    'PF/UAN','Bank Name','Account No','IFSC',
  ]
  const data = rows.map((r,i) => {
    const p = r.payroll, at = r.attendance
    const rangeFullPay = +(p.workingDays * p.dailyRate).toFixed(2)
    const lopAmt       = +(p.lopDays * p.dailyRate).toFixed(2)
    return [
      i+1, r.code, r.name, r.department||'', r.designation||'', r.salaryType, r.salary||0,
      p.fullMonthWorkingDays || p.workingDays, p.workingDays, p.effectiveDays, p.lopDays, p.dailyRate,
      rangeFullPay, lopAmt, p.grossPay, p.otAmount,
      at.present - (at.pardonedLate||0), at.late, at.pardonedLate||0, at.halfDay, at.absent,
      at.paidLeave, at.holiday, at.weekOff,
      +(at.workedMinutes/60).toFixed(2), +(at.overtimeMinutes/60).toFixed(2),
      p.deductions.pf, p.deductions.esi, p.deductions.pt, p.deductions.total, p.netPay,
      r.uanNumber||'', r.bankDetails?.bankName||'', r.bankDetails?.accountNumber||'', r.bankDetails?.ifscCode||'',
    ]
  })
  return [header, ...data]
}

function buildAttSummarySheet(rows) {
  const header = ['#','Code','Name','Department','Working Days','Present','Late (Charged)','Late* (Pardoned)','Half Day','Absent (Full)','Absent (Half-Day Weekday)','Paid Leave','Unpaid Leave','Holiday','Week Off','Worked Hours','OT Hours','Attendance %']
  return [header, ...rows.map((r,i) => {
    const at = r.attendance
    const hdAbs = at.halfDayWeekdayAbsent || 0
    const worked = r.payroll.workingDays > 0 ? +(((at.present+at.late+(at.halfDay*.5)+at.paidLeave) / r.payroll.workingDays)*100).toFixed(1) : 0
    return [i+1, r.code, r.name, r.department||'',
      r.payroll.workingDays, at.present - (at.pardonedLate||0), at.late, at.pardonedLate||0, at.halfDay,
      at.absent - hdAbs, hdAbs, at.paidLeave, at.unpaidLeave, at.holiday, at.weekOff,
      +(at.workedMinutes/60).toFixed(2), +(at.overtimeMinutes/60).toFixed(2), worked]
  })]
}

function buildOTSheet(rows) {
  const header = ['#','Code','Name','Department','OT Minutes','OT Hours','Hourly Rate','OT Amount']
  return [header, ...rows.filter(r => r.attendance.overtimeMinutes > 0).map((r,i) => [
    i+1, r.code, r.name, r.department||'',
    r.attendance.overtimeMinutes, +(r.attendance.overtimeMinutes/60).toFixed(2),
    r.payroll.hourlyRate, r.payroll.otAmount,
  ])]
}

function buildDeductionsSheet(rows) {
  const header = ['#','Code','Name','Department','Gross Pay','PF (12%)','UAN','ESI (0.75%)','ESI No','Prof Tax','Total Deductions','Net Pay','PAN']
  return [header, ...rows.map((r,i) => [
    i+1, r.code, r.name, r.department||'', r.payroll.grossPay,
    r.payroll.deductions.pf, r.uanNumber||'',
    r.payroll.deductions.esi, r.esiNumber||'',
    r.payroll.deductions.pt, r.payroll.deductions.total, r.payroll.netPay, r.panNumber||'',
  ])]
}

function buildLOPSheet(rows) {
  const header = ['#','Code','Name','Department','Monthly Salary','Month Working Days','Daily Rate','Absent (Full Day)','Absent (Half-Day Weekday)','Half Day Worked','Total LOP Days','Range Full Pay','LOP Amount','Gross Pay','Net Pay']
  return [header, ...rows.filter(r => r.payroll.lopDays > 0).map((r,i) => {
    const p = r.payroll, at = r.attendance
    const hdAbs = at.halfDayWeekdayAbsent || 0
    const fullAbs = at.absent - hdAbs
    const rangeFullPay = +(p.workingDays * p.dailyRate).toFixed(2)
    const lopAmt       = +(p.lopDays * p.dailyRate).toFixed(2)
    return [
      i+1, r.code, r.name, r.department||'', r.salary||0,
      p.fullMonthWorkingDays || p.workingDays, p.dailyRate,
      fullAbs, hdAbs, at.halfDay,
      p.lopDays, rangeFullPay, lopAmt, p.grossPay, p.netPay,
    ]
  })]
}

function buildMultiPunchSheet(punchRows, startDate, endDate) {
  const DOW   = ['Su','Mo','Tu','We','Th','Fr','Sa']
  const dates = []
  const _cur  = new Date(startDate + 'T00:00:00')
  const _end  = new Date(endDate   + 'T00:00:00')
  const _lds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  while (_cur <= _end) { dates.push(_lds(_cur)); _cur.setDate(_cur.getDate()+1) }

  const dateHdrs = dates.map(d => {
    const dt = new Date(d + 'T00:00:00')
    return `${String(dt.getDate()).padStart(2,'0')}\n${DOW[dt.getDay()]}`
  })
  const header = ['#','Code','Name','Department','Shift', ...dateHdrs, 'Total Punches','Flagged Days']
  const rows = punchRows.map((emp, i) => {
    const dayMap = {}
    emp.days.forEach(d => { dayMap[d.date] = d })
    const dayCells = dates.map(date => {
      const day = dayMap[date]
      if (!day || day.punchCount === 0) return ''
      const PTLBL = { 0:'IN', 1:'OUT', 2:'BRK↑', 3:'BRK↓', 4:'OT↑', 5:'OT↓' }
      const parts = [`${day.punchCount} punch${day.punchCount !== 1 ? 'es' : ''}`]
      ;(day.punches || []).forEach(p => parts.push(`${p.time} ${PTLBL[p.punchType] || '?'}`))
      if (day.workedMinutes) parts.push(`${Math.floor(day.workedMinutes/60)}h ${day.workedMinutes%60}m`)
      if (day.flags?.length) parts.push(day.flags.join(', '))
      return parts.join('\n')
    })
    return [
      i+1, emp.code||'', emp.name, emp.department||'', emp.shiftName||'',
      ...dayCells,
      emp.totalPunches || 0,
      emp.flaggedDays  || 0,
    ]
  })
  return [header, ...rows]
}

function buildBankAdviceSheet(rows) {
  const header = ['#','Employee Code','Name','Bank Name','Account Number','IFSC Code','Account Type','Net Pay','Remarks']
  return [header, ...rows.filter(r => r.bankDetails?.accountNumber).map((r,i) => [
    i+1, r.code, r.name, r.bankDetails.bankName||'', r.bankDetails.accountNumber,
    r.bankDetails.ifscCode||'', r.bankDetails.accountType||'savings',
    r.payroll.netPay, '',
  ])]
}

function buildOrgInfoRows(org, period, reportLabel, rowCount) {
  const now = new Date().toLocaleString('en-IN')
  const location = [org?.city, org?.state].filter(Boolean).join(', ')
  const rows = [
    [`${org?.name || 'Organisation'}`],
    ...(org?.industry ? [[`Industry: ${org.industry}${location ? '  |  ' + location : ''}`]] : location ? [[location]] : []),
    ...(org?.address  ? [[`Address: ${org.address}`]] : []),
    ...([org?.phone, org?.email].some(Boolean) ? [[`${[org?.phone && `Ph: ${org.phone}`, org?.email && `Email: ${org.email}`].filter(Boolean).join('  |  ')}`]] : []),
    [],
    [`Report: ${reportLabel}`],
    [`Period: ${period.startDate}  to  ${period.endDate}   |   Employees: ${rowCount}`],
    [`Generated: ${now}`],
    [`Proudly Powered by: Insha Technologies — Attendix (Attendance & Payroll Simplified)`],
    [], // blank row before data
  ]
  return rows
}

function downloadExcel(rows, reportType, period, org) {
  const wb   = XLSX.utils.book_new()
  const title = `${period.startDate} to ${period.endDate}`
  const orgInfo = buildOrgInfoRows(org, period, REPORT_TYPES.find(r=>r.id===reportType)?.label || reportType, rows.length)

  const addSheet = (name, aoa) => {
    // Prepend org info rows
    const full = [...orgInfo, ...aoa]
    const ws = XLSX.utils.aoa_to_sheet(full)
    // Bold the org header rows and the data header row
    const headerRow = orgInfo.length // 0-indexed row of data header
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let r = 0; r <= Math.min(orgInfo.length, range.e.r); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell) {
          if (r === 0) cell.s = { font:{ bold:true, sz:13 } }
          else if (r === headerRow) cell.s = { font:{ bold:true }, fill:{ fgColor:{ rgb:'1A1A2E' } } }
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  if (reportType === 'payroll-register') {
    addSheet('Payroll Register', buildPayrollRegisterSheet(rows, title))
  } else if (reportType === 'att-summary') {
    addSheet('Attendance Summary', buildAttSummarySheet(rows))
  } else if (reportType === 'ot-report') {
    addSheet('Overtime Report', buildOTSheet(rows))
  } else if (reportType === 'deductions') {
    addSheet('Deductions', buildDeductionsSheet(rows))
  } else if (reportType === 'lop-report') {
    addSheet('LOP Report', buildLOPSheet(rows))
  } else if (reportType === 'bank-advice') {
    addSheet('Bank Advice', buildBankAdviceSheet(rows))
  } else if (reportType === 'salary-slip') {
    rows.forEach(r => addSheet(r.code || r.name.slice(0,15), buildPayrollRegisterSheet([r], title)))
  } else {
    addSheet('Payroll Register',   buildPayrollRegisterSheet(rows, title))
    addSheet('Attendance Summary', buildAttSummarySheet(rows))
    addSheet('OT Report',          buildOTSheet(rows))
    addSheet('Deductions',         buildDeductionsSheet(rows))
    addSheet('LOP Report',         buildLOPSheet(rows))
    addSheet('Bank Advice',        buildBankAdviceSheet(rows))
  }

  // Always append abbreviation key sheet
  const abbrWs = XLSX.utils.aoa_to_sheet(buildAbbrKeySheet())
  XLSX.utils.book_append_sheet(wb, abbrWs, 'Abbreviation Key')

  XLSX.writeFile(wb, `${(org?.name||'payroll').replace(/\s+/g,'_')}_${reportType}_${period.startDate}_${period.endDate}.xlsx`)
}

// ── PDF print window ──────────────────────────────────────────────────────────
function printReport(rows, reportType, period, org) {
  const fmtN = n => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN',{minimumFractionDigits:0})}`
  const title    = REPORT_TYPES.find(r => r.id === reportType)?.label || 'Payroll Report'
  const orgName  = org?.name     || 'Organisation'
  const location = [org?.city, org?.state].filter(Boolean).join(', ')
  const logoUrl  = org?.logoUrl  || ''

  let tableHtml = ''
  if (reportType === 'payroll-register' || reportType === 'salary-slip') {
    tableHtml = `
      <table><thead><tr>
        <th>#</th><th>Code</th><th>Name</th><th>Dept</th>
        <th>Salary</th><th>Daily Rate</th><th>Work Days</th><th>Effective Days</th><th>LOP Days</th>
        <th>Range Pay</th><th>LOP Amt</th><th>Gross</th><th>OT</th>
        <th>PF</th><th>ESI</th><th>PT</th><th>Deductions</th><th>Net Pay</th>
      </tr></thead><tbody>
      ${rows.map((r,i) => {
        const p = r.payroll
        const rangeFullPay = +(p.workingDays * p.dailyRate).toFixed(2)
        const lopAmt = +(p.lopDays * p.dailyRate).toFixed(2)
        return `<tr ${i%2===0?'class="alt"':''}>
          <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
          <td>${fmtN(r.salary)}</td>
          <td title="Monthly salary ÷ ${p.fullMonthWorkingDays||p.workingDays} month working days">${fmtN(p.dailyRate)}</td>
          <td>${p.workingDays}d</td>
          <td style="color:#16a34a">${p.effectiveDays}d</td>
          <td style="color:#c0392b">${p.lopDays > 0 ? p.lopDays+'d' : '—'}</td>
          <td>${fmtN(rangeFullPay)}</td>
          <td style="color:#c0392b">${p.lopDays > 0 ? '−'+fmtN(lopAmt) : '—'}</td>
          <td><strong>${fmtN(p.grossPay)}</strong></td>
          <td>${p.otAmount > 0 ? '+'+fmtN(p.otAmount) : '—'}</td>
          <td>${fmtN(p.deductions.pf)}</td><td>${fmtN(p.deductions.esi)}</td><td>${fmtN(p.deductions.pt)}</td>
          <td style="color:#c0392b">${fmtN(p.deductions.total)}</td>
          <td class="net"><strong>${fmtN(p.netPay)}</strong></td>
        </tr>`
      }).join('')}
      </tbody><tfoot><tr>
        <td colspan="4"><strong>TOTAL (${rows.length} employees)</strong></td>
        <td></td><td></td><td></td><td></td><td></td>
        <td><strong>${fmtN(rows.reduce((s,r)=>s+(r.payroll.workingDays*r.payroll.dailyRate),0))}</strong></td>
        <td style="color:#c0392b"><strong>−${fmtN(rows.reduce((s,r)=>s+(r.payroll.lopDays*r.payroll.dailyRate),0))}</strong></td>
        <td><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.grossPay,0))}</strong></td>
        <td><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.otAmount,0))}</strong></td>
        <td><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.deductions.pf,0))}</strong></td>
        <td><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.deductions.esi,0))}</strong></td>
        <td><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.deductions.pt,0))}</strong></td>
        <td style="color:#c0392b"><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.deductions.total,0))}</strong></td>
        <td class="net"><strong>${fmtN(rows.reduce((s,r)=>s+r.payroll.netPay,0))}</strong></td>
      </tr></tfoot></table>`
  } else if (reportType === 'att-summary') {
    tableHtml = `<table><thead><tr>
      <th>#</th><th>Code</th><th>Name</th><th>Dept</th><th>Work Days</th><th>P</th><th>L</th><th>H</th><th>A</th><th>PL</th><th>Hol</th><th>WO</th><th>Hrs</th><th>OT Hrs</th><th>Att%</th>
    </tr></thead><tbody>
    ${rows.map((r,i) => {
      const att = r.attendance, wp = r.payroll
      const attPct = wp.workingDays > 0 ? +((( att.present+att.late+(att.halfDay*.5)+att.paidLeave) / wp.workingDays)*100).toFixed(1) : 0
      return `<tr ${i%2===0?'class="alt"':''}><td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
        <td>${wp.workingDays}</td><td>${att.present-(att.pardonedLate||0)}</td><td>${att.late}</td><td>${att.halfDay}</td>
        <td style="color:#c0392b">${att.absent}</td><td>${att.paidLeave}</td><td>${att.holiday}</td><td>${att.weekOff}</td>
        <td>${(att.workedMinutes/60).toFixed(1)}</td><td>${(att.overtimeMinutes/60).toFixed(1)}</td>
        <td>${attPct}%</td></tr>`
    }).join('')}</tbody></table>`
  } else if (reportType === 'lop-report') {
    const lopRows = rows.filter(r => r.payroll.lopDays > 0)
    tableHtml = `<table><thead><tr>
      <th>#</th><th>Code</th><th>Name</th><th>Dept</th><th>Salary</th>
      <th>Month Days</th><th>Daily Rate</th><th>Work Days</th>
      <th>Range Pay</th><th>LOP Days</th><th>LOP Amount</th><th>Gross</th><th>Net Pay</th>
    </tr></thead><tbody>
    ${lopRows.map((r,i) => {
      const p = r.payroll
      const rangeFullPay = +(p.workingDays * p.dailyRate).toFixed(2)
      const lopAmt = +(p.lopDays * p.dailyRate).toFixed(2)
      return `<tr ${i%2===0?'class="alt"':''}>
        <td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td><td>${r.department||'—'}</td>
        <td>${fmtN(r.salary)}</td>
        <td>${p.fullMonthWorkingDays||p.workingDays}d</td>
        <td>${fmtN(p.dailyRate)}</td>
        <td>${p.workingDays}d</td>
        <td>${fmtN(rangeFullPay)}</td>
        <td style="color:#c0392b">${p.lopDays}d</td>
        <td style="color:#c0392b">−${fmtN(lopAmt)}</td>
        <td><strong>${fmtN(p.grossPay)}</strong></td>
        <td class="net"><strong>${fmtN(p.netPay)}</strong></td>
      </tr>`
    }).join('')}
    </tbody><tfoot><tr>
      <td colspan="8"><strong>TOTAL (${lopRows.length} employees with LOP)</strong></td>
      <td><strong>${fmtN(lopRows.reduce((s,r)=>s+(r.payroll.workingDays*r.payroll.dailyRate),0))}</strong></td>
      <td></td>
      <td style="color:#c0392b"><strong>−${fmtN(lopRows.reduce((s,r)=>s+(r.payroll.lopDays*r.payroll.dailyRate),0))}</strong></td>
      <td><strong>${fmtN(lopRows.reduce((s,r)=>s+r.payroll.grossPay,0))}</strong></td>
      <td class="net"><strong>${fmtN(lopRows.reduce((s,r)=>s+r.payroll.netPay,0))}</strong></td>
    </tr></tfoot></table>`
  } else if (reportType === 'bank-advice') {
    const bankRows = rows.filter(r => r.bankDetails?.accountNumber)
    tableHtml = `<table><thead><tr><th>#</th><th>Code</th><th>Name</th><th>Bank</th><th>Account No</th><th>IFSC</th><th>Net Pay</th></tr></thead><tbody>
    ${bankRows.map((r,i) => `<tr ${i%2===0?'class="alt"':''}><td>${i+1}</td><td>${r.code||''}</td><td>${r.name}</td>
      <td>${r.bankDetails.bankName||''}</td><td>${r.bankDetails.accountNumber}</td><td>${r.bankDetails.ifscCode||''}</td>
      <td class="net"><strong>${fmtN(r.payroll.netPay)}</strong></td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="6"><strong>Total Transfer</strong></td><td class="net"><strong>${fmtN(bankRows.reduce((s,r)=>s+r.payroll.netPay,0))}</strong></td></tr></tfoot></table>`
  } else if (reportType === 'multi-punch') {
    const DOW_P     = ['Su','Mo','Tu','We','Th','Fr','Sa']
    const flagAbbr  = { 'no-out':'NO', 'odd-count':'OD', 'duplicate':'DU', 'excess':'EX' }
    const flagColor = { 'no-out':'#fb923c', 'odd-count':'#e6b800', 'duplicate':'#f87171', 'excess':'#c084fc' }
    const cntColor  = c => c === 1 ? '#fb923c' : c % 2 !== 0 ? '#e6b800' : c > 6 ? '#c084fc' : '#34d399'
    const pDates    = []
    const _pc = new Date(period.startDate + 'T00:00:00')
    const _pe = new Date(period.endDate   + 'T00:00:00')
    const _ldsp = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    while (_pc <= _pe) { pDates.push(_ldsp(_pc)); _pc.setDate(_pc.getDate()+1) }
    tableHtml = `
      <table class="punch-tbl">
        <thead><tr>
          <th>#</th>
          <th>Code</th>
          <th>Name</th>
          <th>Dept</th>
          ${pDates.map(d => {
            const dt = new Date(d + 'T00:00:00')
            const isWknd = dt.getDay()===0||dt.getDay()===6
            return `<th class="day-hdr${isWknd?' weekend':''}">${String(dt.getDate()).padStart(2,'0')}<br><span style="font-weight:400;font-size:7px">${DOW_P[dt.getDay()]}</span></th>`
          }).join('')}
          <th title="Total Punches">Total</th>
          <th title="Flagged Days">Flag</th>
        </tr></thead>
        <tbody>
          ${rows.map((emp, idx) => {
            const dayMap = {}; emp.days.forEach(d => { dayMap[d.date] = d })
            return `<tr class="${idx%2===0?'alt':''}">
              <td class="idx">${idx+1}</td>
              <td class="code">${emp.code||''}</td>
              <td class="name">${emp.name}</td>
              <td class="dept">${emp.department||'—'}</td>
              ${pDates.map(date => {
                const day = dayMap[date]
                const dt  = new Date(date + 'T00:00:00')
                const isWknd = dt.getDay()===0||dt.getDay()===6
                if (!day || day.punchCount === 0) return `<td class="day-cell${isWknd?' wknd':''}">—</td>`
                const PTCOLOR_P = { 0:'#34d399', 1:'#f87171', 2:'#fb923c', 3:'#60a5fa', 4:'#c084fc', 5:'#f472b6' }
                const cc = cntColor(day.punchCount)
                return `<td class="day-cell${isWknd?' wknd':''}">
                  <span class="p-cnt" style="color:${cc};display:block;text-align:center">${day.punchCount}</span>
                  ${(day.punches||[]).map(p => {
                    const pc = PTCOLOR_P[p.punchType] || '#888'
                    return `<div style="display:flex;align-items:center;gap:2px;justify-content:center">
                      <span style="width:3px;height:3px;border-radius:50%;background:${pc};flex-shrink:0"></span>
                      <span class="p-time" style="color:${pc}">${p.time}</span>
                    </div>`
                  }).join('')}
                  ${(day.flags||[]).length ? `<div style="display:flex;gap:1px;flex-wrap:wrap;justify-content:center;margin-top:2px">${(day.flags||[]).map(f=>`<span class="p-flag" style="background:${flagColor[f]||'#888'}22;color:${flagColor[f]||'#888'}">${flagAbbr[f]||f}</span>`).join('')}</div>` : ''}
                </td>`
              }).join('')}
              <td class="sum" style="color:#58a6ff">${emp.totalPunches||0}</td>
              <td class="sum" style="color:${(emp.flaggedDays||0)>0?'#f87171':'#6b7280'}">${emp.flaggedDays||0}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
      <div style="margin-top:10px;padding:8px 12px;background:#f5f5fb;border:1px solid #dde;border-radius:6px;font-size:8.5px;color:#555;display:flex;gap:16px;flex-wrap:wrap">
        <span><strong>Count color:</strong></span>
        <span style="color:#34d399;font-weight:700">■</span> Even — normal &nbsp;
        <span style="color:#fb923c;font-weight:700">■</span> 1 punch (no check-out) &nbsp;
        <span style="color:#e6b800;font-weight:700">■</span> Odd count &nbsp;
        <span style="color:#c084fc;font-weight:700">■</span> &gt;6 punches &nbsp;|&nbsp;
        <strong>Flag codes:</strong> &nbsp;
        <strong>NO</strong>=No checkout &nbsp;<strong>OD</strong>=Odd count &nbsp;<strong>DU</strong>=Duplicate (&lt;2 min) &nbsp;<strong>EX</strong>=Excess (&gt;6)
      </div>`
  } else {
    tableHtml = `<p>Preview not available for this report type. Use Excel download.</p>`
  }

  // Abbreviation legend for PDF footer
  const abbrSections = [
    { title:'Status', items:[
      {abbr:'P','label':'Present'},{abbr:'L','label':'Late'},{abbr:'L*','label':'Late(Pardoned)'},
      {abbr:'H','label':'Half Day'},{abbr:'A','label':'Absent'},{abbr:'A½','label':'Absent(Half-day)'},
      {abbr:'WO','label':'Week Off'},{abbr:'PL','label':'Paid Leave'},{abbr:'Lv','label':'On Leave'},{abbr:'Hol','label':'Holiday'},
    ]},
    { title:'Payroll', items:[
      {abbr:'Gross','label':'Salary after LOP'},{abbr:'OT','label':'Overtime (1.5×)'},{abbr:'PF','label':'Provident Fund 12%'},
      {abbr:'ESI','label':'ESI 0.75%'},{abbr:'PT','label':'Prof. Tax'},{abbr:'LOP','label':'Loss of Pay'},
      {abbr:'Net','label':'Gross+OT−PF−ESI−PT'},
    ]},
  ]
  const abbrHtml = `<div class="abbr-box"><strong>Abbreviation Key</strong><br>${
    abbrSections.map(s => `<span class="abbr-sec">${s.title}:</span> ${
      s.items.map(i => `<span class="abbr-chip">${i.abbr}</span> ${i.label}`).join(' &nbsp; ')
    }`).join('<br>')
  }<br>
  <div class="abbr-formula">
    <strong>Daily Rate</strong> = Monthly Salary ÷ Full-Month Working Days (actual calendar month, excl. week-offs &amp; holidays) &nbsp;|&nbsp;
    <strong>Range Pay</strong> = Working Days in Range × Daily Rate &nbsp;|&nbsp;
    <strong>LOP Amount</strong> = LOP Days × Daily Rate &nbsp;|&nbsp;
    <strong>Gross Pay</strong> = Range Pay − LOP Amount &nbsp;|&nbsp;
    <strong>Net Pay</strong> = Gross + OT − PF − ESI − PT
  </div></div>`

  const isPunchGrid  = reportType === 'multi-punch'
  const _pdc         = isPunchGrid ? pDates.length : 0
  const _fixMm       = 115
  const _perDMm      = _pdc <= 15 ? 16 : _pdc <= 20 ? 14 : _pdc <= 25 ? 12 : 11
  const _pgWmm       = _pdc > 0 ? Math.max(257, _fixMm + _pdc * _perDMm) : 420
  const _pgHmm       = 190
  const _pFs         = _pdc <= 15 ? 8.5 : _pdc <= 20 ? 8 : _pdc <= 25 ? 7.5 : 7
  const _pTFs        = _pdc <= 15 ? 7   : _pdc <= 20 ? 6.5 : 6
  const _pageSize    = isPunchGrid ? `${_pgWmm}mm ${_pgHmm}mm` : 'A4 portrait'

  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ${period.startDate} to ${period.endDate}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:${isPunchGrid?`${_pFs}px`:'11px'}; color:#1a1a2e; background:#fff; padding:${isPunchGrid?'12px 14px':'24px 28px'}; }

    /* ── Header card ── */
    .header-card {
      display:flex; align-items:stretch; gap:0;
      border:1.5px solid #1a1a2e; border-radius:10px; overflow:hidden; margin-bottom:16px;
      box-shadow:0 2px 8px rgba(0,0,0,.12);
    }
    .header-logo-col {
      width:90px; min-width:90px; background:#1a1a2e;
      display:flex; align-items:center; justify-content:center; padding:14px;
    }
    .header-logo-col img { width:60px; height:60px; object-fit:contain; border-radius:6px; }
    .header-logo-placeholder {
      width:60px; height:60px; border-radius:8px; background:rgba(255,255,255,.1);
      border:2px solid rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center;
      font-size:22px; font-weight:900; color:rgba(255,255,255,.7); letter-spacing:-1px;
    }
    .header-org-col {
      flex:1; padding:14px 18px; background:#f9f9fc; border-right:1px solid #e0e0ec;
    }
    .org-name { font-size:17px; font-weight:900; color:#1a1a2e; line-height:1.2; letter-spacing:-0.3px; }
    .org-industry { font-size:10px; font-weight:700; color:#4a5568; text-transform:uppercase; letter-spacing:0.06em; margin-top:2px; }
    .org-detail-row { display:flex; flex-wrap:wrap; gap:12px; margin-top:8px; }
    .org-detail-item { display:flex; align-items:center; gap:4px; font-size:10px; color:#555; }
    .org-detail-icon { width:14px; height:14px; opacity:0.6; }
    .header-report-col {
      width:200px; min-width:180px; padding:14px 16px; background:#1a1a2e;
      display:flex; flex-direction:column; justify-content:center; gap:4px;
    }
    .report-badge { display:inline-block; padding:3px 9px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2);
      border-radius:20px; font-size:9px; font-weight:700; color:#a0b0ff; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; width:fit-content; }
    .report-title-text { font-size:13px; font-weight:800; color:#fff; line-height:1.3; }
    .report-meta-item { font-size:9.5px; color:rgba(255,255,255,.55); margin-top:3px; line-height:1.5; }
    .report-meta-item strong { color:rgba(255,255,255,.8); font-weight:600; }

    /* ── Table ── */
    table { width:100%; border-collapse:collapse; font-size:10.5px; margin-top:4px; }
    th { background:#1a1a2e; color:#fff; font-weight:700; padding:7px 10px; text-align:left; font-size:10px; }
    td { padding:5px 10px; border-bottom:1px solid #eee; }
    tr.alt td { background:#f9f9fc; }
    tfoot td { background:#eef0f8; font-weight:700; border-top:2px solid #1a1a2e; color:#1a1a2e; }
    .net { color:#16a34a; font-weight:700; }
    .deduct { color:#c0392b; }

    /* ── Abbreviation box ── */
    .abbr-box { margin-top:16px; padding:10px 14px; background:#f5f5fb; border:1px solid #dde; border-radius:7px; font-size:9.5px; color:#444; line-height:1.9; }
    .abbr-sec { font-weight:800; color:#1a1a2e; margin-right:4px; }
    .abbr-chip { display:inline-block; background:#e4e4f4; border:1px solid #c8c8e0; border-radius:3px; padding:0 5px; font-family:monospace; font-weight:700; font-size:9px; color:#1a1a2e; }
    .abbr-formula { margin-top:6px; padding:5px 10px; background:#fff; border:1px solid #dde; border-radius:5px; font-size:9px; color:#555; font-style:italic; }

    /* ── Footer ── */
    .powered-footer {
      margin-top:20px; padding:10px 16px;
      border-top:1.5px solid #1a1a2e;
      display:flex; align-items:center; justify-content:space-between;
    }
    .powered-left { font-size:9px; color:#888; }
    .powered-brand { font-size:10px; font-weight:800; color:#1a1a2e; letter-spacing:-0.2px; }
    .powered-brand span { color:#4f46e5; }
    .powered-tagline { font-size:8.5px; color:#6b7280; margin-top:1px; font-style:italic; }
    .powered-right { font-size:9px; color:#888; text-align:right; }

    /* ── Punch detail table ── */
    .punch-tbl { table-layout:auto; width:auto; border-collapse:collapse; font-size:${_pFs}px; margin-top:4px; }
    .punch-tbl th { background:#1a1a2e; color:#fff; font-weight:700; padding:4px 6px;
      text-align:center; font-size:${_pFs}px; white-space:nowrap; }
    .punch-tbl th.day-hdr { padding:3px 4px; }
    .punch-tbl th.day-hdr.weekend { background:#2d2d4e; }
    .punch-tbl td { padding:3px 5px; border-bottom:1px solid #eee; vertical-align:top; white-space:nowrap; font-size:${_pFs}px; }
    .punch-tbl tr.alt td { background:#f9f9fc; }
    .punch-tbl td.idx  { text-align:center; color:#666; }
    .punch-tbl td.code { text-align:center; font-family:monospace; color:#555; }
    .punch-tbl td.name { text-align:left; font-weight:600; }
    .punch-tbl td.dept { text-align:left; color:#555; }
    .punch-tbl td.day-cell { text-align:center; padding:3px 4px; }
    .punch-tbl td.day-cell.wknd { background:rgba(107,114,128,.06); }
    .punch-tbl td.sum { text-align:center; font-weight:700; padding:3px 6px; }
    .punch-tbl .p-time { font-size:${_pTFs}px; font-family:monospace; font-weight:600; line-height:1.3; }
    .punch-tbl .p-cnt  { font-size:${Math.round(_pFs * 1.2)}px; font-weight:800; line-height:1; margin-bottom:2px; }
    .punch-tbl .p-flag { font-size:${Math.max(5, _pTFs - 1)}px; font-weight:700; padding:0 2px; border-radius:2px; }

    @media print {
      body { padding:10px 14px; }
      .header-card { box-shadow:none; }
      button { display:none !important; }
      @page { size:${_pageSize}; margin:8mm; }
    }
  </style></head><body>

  <!-- ── Organisation header card ── -->
  <div class="header-card">
    <!-- Logo -->
    <div class="header-logo-col">
      ${logoUrl
        ? `<img src="${logoUrl}" alt="logo"/>`
        : `<div class="header-logo-placeholder">${orgName.charAt(0).toUpperCase()}</div>`}
    </div>

    <!-- Org info -->
    <div class="header-org-col">
      <div class="org-name">${orgName}</div>
      ${org?.industry ? `<div class="org-industry">${org.industry}</div>` : ''}
      <div class="org-detail-row">
        ${org?.address ? `
          <div class="org-detail-item">
            <svg class="org-detail-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 1.5A4.5 4.5 0 0 1 12.5 6c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 0 1 8 1.5z"/>
              <circle cx="8" cy="6" r="1.5"/>
            </svg>
            ${org.address}${location ? ', ' + location : ''}
          </div>` : location ? `<div class="org-detail-item">${location}</div>` : ''}
        ${org?.phone ? `
          <div class="org-detail-item">
            <svg class="org-detail-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 2h3l1.5 3.5-1.5 1a8 8 0 0 0 3.5 3.5l1-1.5L14 10v3a1 1 0 0 1-1 1A11 11 0 0 1 2 3a1 1 0 0 1 1-1z"/>
            </svg>
            ${org.phone}
          </div>` : ''}
        ${org?.email ? `
          <div class="org-detail-item">
            <svg class="org-detail-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/>
              <path d="M1.5 5l6.5 4 6.5-4"/>
            </svg>
            ${org.email}
          </div>` : ''}
      </div>
    </div>

    <!-- Report info -->
    <div class="header-report-col">
      <div class="report-badge">Official Report</div>
      <div class="report-title-text">${title}</div>
      <div class="report-meta-item"><strong>Period:</strong> ${period.startDate} → ${period.endDate}</div>
      <div class="report-meta-item"><strong>Employees:</strong> ${rows.length}</div>
      <div class="report-meta-item"><strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}</div>
    </div>
  </div>

  ${tableHtml}
  ${abbrHtml}

  <!-- ── Powered-by footer ── -->
  <div class="powered-footer">
    <div class="powered-left">This report is system-generated and does not require a signature.</div>
    <div style="text-align:center">
      <div class="powered-brand">Proudly Powered By&nbsp; <span>Insha Technologies</span></div>
      <div class="powered-tagline">Attendix — Attendance &amp; Payroll Simplified</div>
    </div>
    <div class="powered-right">Confidential · For internal use only</div>
  </div>

  <script>setTimeout(()=>window.print(),450)</script>
  </body></html>`)
  win.document.close()
}

// ── Reports panel ─────────────────────────────────────────────────────────────
function ReportsPanel({ data, selectedIds, period, org, orgId }) {
  const [reportType, setReportType] = useState('payroll-register')
  const [scope, setScope]           = useState('all')
  // Punch report own state
  const [punchData,    setPunchData]    = useState(null)
  const [punchLoading, setPunchLoading] = useState(false)
  const [punchError,   setPunchError]   = useState(null)
  const [punchMinP,    setPunchMinP]    = useState(1)
  const [punchFlagged, setPunchFlagged] = useState(false)
  const [punchEmpQ,    setPunchEmpQ]    = useState('')

  const isPunch = reportType === 'multi-punch'

  async function loadPunchReport() {
    if (!orgId) return
    setPunchLoading(true); setPunchError(null); setPunchData(null)
    try {
      const p = new URLSearchParams({ startDate: period.startDate, endDate: period.endDate, minPunches: punchMinP, flaggedOnly: punchFlagged })
      const r = await api.get(`/organizations/${orgId}/attendance/punch-report?${p}`)
      setPunchData(r)
    } catch(e) { setPunchError(e.message) }
    finally { setPunchLoading(false) }
  }

  // Payroll-report rows (scope filter)
  const rows = scope === 'selected' && selectedIds.size > 0
    ? data.filter(r => selectedIds.has(r.employeeId))
    : data
  const selCount = selectedIds.size

  // Punch report display rows (employee search filter)
  const punchRows = (punchData?.data || []).filter(e =>
    !punchEmpQ || e.name.toLowerCase().includes(punchEmpQ.toLowerCase()) || e.code.toLowerCase().includes(punchEmpQ.toLowerCase())
  )
  const ps = punchData?.summary || {}

  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16,
      padding:'20px', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:'rgba(88,166,255,.12)', border:'1px solid rgba(88,166,255,.2)',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <PieChart size={15} style={{ color:'#58a6ff' }}/>
        </div>
        <div>
          <p style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Reports & Downloads</p>
          <p style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>Generate and export payroll &amp; attendance reports</p>
        </div>
      </div>

      {/* Report type grid — grouped */}
      {['payroll','attendance'].map(grp => (
        <div key={grp}>
          <p style={{ fontSize:'0.6rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-dim)', marginBottom:6 }}>
            {grp === 'payroll' ? 'Payroll Reports' : 'Attendance Reports'}
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
            {REPORT_TYPES.filter(rt => rt.group === grp).map(rt => {
              const Icon = rt.icon
              const sel = reportType === rt.id
              return (
                <button key={rt.id} onClick={() => setReportType(rt.id)}
                  style={{
                    display:'flex', flexDirection:'column', gap:5, padding:'10px 12px', borderRadius:10, cursor:'pointer', textAlign:'left', transition:'all .15s',
                    background: sel ? 'color-mix(in srgb,var(--accent) 10%,transparent)' : 'var(--bg-surface2)',
                    border:`1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                  <Icon size={14} style={{ color: sel ? 'var(--accent)' : 'var(--text-muted)' }}/>
                  <p style={{ fontSize:'0.775rem', fontWeight:700, color: sel ? 'var(--accent)' : 'var(--text-secondary)' }}>{rt.label}</p>
                  <p style={{ fontSize:'0.65rem', color:'var(--text-dim)', lineHeight:1.3 }}>{rt.desc}</p>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── Punch Report controls + table ── */}
      {isPunch && (
        <div style={{ display:'flex', flexDirection:'column', gap:12, paddingTop:8, borderTop:'1px solid var(--border-soft)' }}>
          {/* Filters row */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:10, flexWrap:'wrap' }}>
            <div>
              <label style={{ fontSize:'0.68rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase', color:'var(--text-dim)', display:'block', marginBottom:4 }}>Min Punches</label>
              <input type="number" min="1" max="20" value={punchMinP} onChange={e => setPunchMinP(Math.max(1, +e.target.value))}
                className="field-input" style={{ width:80, fontFamily:'monospace', fontWeight:700 }}/>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', userSelect:'none', padding:'7px 12px', borderRadius:9,
              border:`1px solid ${punchFlagged ? '#f87171' : 'var(--border)'}`, background: punchFlagged ? 'rgba(248,113,113,.06)' : 'var(--bg-surface2)', marginBottom:1 }}>
              <input type="checkbox" checked={punchFlagged} onChange={e => setPunchFlagged(e.target.checked)} style={{ accentColor:'#f87171' }}/>
              <span style={{ fontSize:'0.8rem', color: punchFlagged ? '#f87171' : 'var(--text-secondary)', fontWeight:600 }}>Anomalies only</span>
            </label>
            <button onClick={loadPunchReport} disabled={punchLoading}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:9, cursor:'pointer',
                background:'var(--accent)', color:'#000', border:'none', fontWeight:700, fontSize:'0.82rem', opacity: punchLoading ? 0.6 : 1 }}>
              <Fingerprint size={13}/> {punchLoading ? 'Loading…' : 'Generate Report'}
            </button>
            {punchData && (
              <>
                <SearchBox value={punchEmpQ} onChange={e => setPunchEmpQ(e.target.value)} placeholder="Search employee…" style={{ minWidth:180 }}/>
                <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                  <button onClick={() => { const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet([...buildOrgInfoRows(org, period,'Punch Detail Report', punchRows.length), ...buildMultiPunchSheet(punchRows, period.startDate, period.endDate)]); XLSX.utils.book_append_sheet(wb, ws,'Punch Detail'); XLSX.writeFile(wb, `punch_report_${period.startDate}_${period.endDate}.xlsx`) }}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, cursor:'pointer', background:'rgba(52,211,153,.1)', color:'#34d399', border:'1px solid rgba(52,211,153,.25)', fontSize:'0.8rem', fontWeight:700 }}>
                    <Download size={13}/> Excel
                  </button>
                  <button onClick={() => printReport(punchRows, 'multi-punch', period, org)}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, cursor:'pointer', background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.25)', fontSize:'0.8rem', fontWeight:700 }}>
                    <Printer size={13}/> PDF
                  </button>
                </div>
              </>
            )}
          </div>

          {punchError && <p style={{ fontSize:'0.82rem', color:'#f87171' }}>{punchError}</p>}

          {/* Summary chips */}
          {punchData && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[
                { label:'Employees', v: ps.employees, color:'#58a6ff' },
                { label:'Total Days', v: ps.totalDays, color:'var(--text-secondary)' },
                { label:'Total Punches', v: ps.totalPunches, color:'var(--accent)' },
                { label:'Flagged Days', v: ps.totalFlagged, color:'#f87171' },
                { label:'No-checkout', v: ps.noOut, color:'#fb923c' },
                { label:'Odd Count', v: ps.oddCount, color:'#facc15' },
                { label:'Duplicates', v: ps.duplicate, color:'#f87171' },
                { label:'>6 Punches', v: ps.excess, color:'#c084fc' },
              ].map(c => (
                <div key={c.label} style={{ padding:'5px 12px', borderRadius:8, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>{c.label}: </span>
                  <span style={{ fontSize:'0.82rem', fontWeight:800, fontFamily:'monospace', color: c.v > 0 ? c.color : 'var(--text-dim)' }}>{c.v ?? 0}</span>
                </div>
              ))}
            </div>
          )}

          {/* Punch table */}
          {punchData && punchRows.length === 0 && <p style={{ fontSize:'0.82rem', color:'var(--text-dim)', fontStyle:'italic' }}>No records found.</p>}
          {punchRows.length > 0 && (
            <div style={{ overflowX:'auto' }}>
              <table className="tbl" style={{ minWidth:900 }}>
                <thead>
                  <tr>
                    {['Employee','Date','Punches','Resolved In','Resolved Out','Worked','Flags'].map(h => (
                      <th key={h} className="tbl-head">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {punchRows.flatMap(emp => emp.days.map((day, di) => (
                    <tr key={emp.employeeId+day.date} className="tbl-row">
                      {di === 0
                        ? <td className="tbl-cell" rowSpan={emp.days.length} style={{ verticalAlign:'top', borderRight:'1px solid var(--border-soft)' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <UserAvatar name={emp.name} photoUrl={emp.photo} size={26}/>
                              <div>
                                <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-primary)' }}>{emp.name}</p>
                                <p style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{emp.code}</p>
                                {emp.shiftName && <p style={{ fontSize:'0.65rem', color:'var(--text-dim)' }}>{emp.shiftName}</p>}
                              </div>
                            </div>
                          </td>
                        : null}
                      <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.8rem', color:'var(--text-muted)' }}>{day.date}</td>
                      <td className="tbl-cell">
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {day.punches.map((p, pi) => (
                            <div key={pi} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                              padding:'3px 6px', borderRadius:6, border:`1px solid ${PUNCH_TYPE_COLOR[p.punchType] || 'var(--border)'}44`,
                              background:`${PUNCH_TYPE_COLOR[p.punchType] || 'transparent'}11` }}>
                              <span style={{ fontSize:'0.72rem', fontFamily:'monospace', fontWeight:700, color: PUNCH_TYPE_COLOR[p.punchType] || 'var(--text-muted)' }}>{p.time}</span>
                              <span style={{ fontSize:'0.6rem', color: PUNCH_TYPE_COLOR[p.punchType] || 'var(--text-dim)' }}>{p.punchType != null ? (PUNCH_TYPE_LABEL[p.punchType] || p.punchType) : '?'}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.82rem', color:'#34d399', fontWeight:600 }}>{day.resolvedIn || '—'}</td>
                      <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.82rem', color:'#f87171', fontWeight:600 }}>{day.resolvedOut || '—'}</td>
                      <td className="tbl-cell" style={{ fontFamily:'monospace', fontSize:'0.82rem', color:'var(--accent)', fontWeight:600 }}>
                        {day.workedMinutes ? `${Math.floor(day.workedMinutes/60)}h ${day.workedMinutes%60}m` : '—'}
                      </td>
                      <td className="tbl-cell">
                        {day.flags.length === 0
                          ? <span style={{ fontSize:'0.72rem', color:'#34d399', fontWeight:600 }}>✓ OK</span>
                          : <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              {day.flags.map(f => (
                                <span key={f} style={{ fontSize:'0.68rem', padding:'2px 7px', borderRadius:99, fontWeight:700,
                                  background: FLAG_CFG[f]?.bg || 'var(--bg-surface2)',
                                  color: FLAG_CFG[f]?.color || 'var(--text-muted)',
                                  border:`1px solid ${FLAG_CFG[f]?.color || 'var(--border)'}44` }}>
                                  {FLAG_CFG[f]?.label || f}
                                </span>
                              ))}
                            </div>
                        }
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Payroll report controls ── */}
      {!isPunch && (
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', paddingTop:8, borderTop:'1px solid var(--border-soft)' }}>
          <div style={{ display:'flex', gap:8 }}>
            {[{v:'all',label:`All (${data.length})`},{v:'selected',label:`Selected (${selCount})`}].map(s => (
              <button key={s.v} onClick={() => setScope(s.v)}
                disabled={s.v === 'selected' && selCount === 0}
                style={{
                  padding:'5px 12px', borderRadius:8, fontSize:'0.78rem', fontWeight:600, cursor:'pointer', transition:'all .12s',
                  background: scope===s.v ? 'var(--accent)' : 'var(--bg-surface2)',
                  color: scope===s.v ? '#000' : selCount===0&&s.v==='selected' ? 'var(--text-dim)' : 'var(--text-secondary)',
                  border:`1px solid ${scope===s.v ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: s.v==='selected' && selCount===0 ? 0.45 : 1,
                }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button onClick={() => downloadExcel(rows, reportType, period, org)}
              disabled={!rows.length}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, cursor:'pointer', transition:'all .13s',
                background:'rgba(52,211,153,.1)', color:'#34d399', border:'1px solid rgba(52,211,153,.25)',
                fontSize:'0.8rem', fontWeight:700, opacity: !rows.length ? 0.5 : 1 }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(52,211,153,.18)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(52,211,153,.1)'}>
              <Download size={13}/> Excel
            </button>
            <button onClick={() => printReport(rows, reportType, period, org)}
              disabled={!rows.length}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, cursor:'pointer', transition:'all .13s',
                background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.25)',
                fontSize:'0.8rem', fontWeight:700, opacity: !rows.length ? 0.5 : 1 }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(248,113,113,.18)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(248,113,113,.1)'}>
              <Printer size={13}/> PDF
            </button>
          </div>
        </div>
      )}

      {!isPunch && rows.length === 0 && scope === 'selected' && (
        <p style={{ fontSize:'0.78rem', color:'var(--text-dim)', fontStyle:'italic' }}>No employees selected. Use checkboxes in the table above, or switch scope to All.</p>
      )}
    </div>
  )
}

// ── Main PayrollTab component ─────────────────────────────────────────────────
export default function PayrollTab({ orgId }) {
  const getOrg = useOrgContext(s => s.org)
  const [startDate, setStart]   = useState(monthStart())
  const [endDate,   setEnd]     = useState(todayStr())
  const [fDept,     setFDept]   = useState('')
  const [depts,     setDepts]   = useState([])
  const [data,      setData]    = useState(null)
  const [loading,   setLoad]    = useState(false)
  const [error,     setError]   = useState(null)
  const [selected,  setSelected]= useState(new Set())
  const [page,      setPage]    = useState(1)
  const [limit,     setLimit]   = useState(5)
  const [q,         setQ]       = useState('')

  useEffect(() => {
    if (!orgId) return
    setFDept('')
    api.get(`/organizations/${orgId}/employees/meta/departments`)
      .then(r => setDepts(r.data?.departments || []))
      .catch(() => {})
  }, [orgId])

  async function load() {
    if (!orgId) return
    setLoad(true); setError(null)
    try {
      const p = new URLSearchParams({ startDate, endDate })
      if (fDept) p.set('department', fDept)
      const r = await api.get(`/organizations/${orgId}/attendance/payroll?${p}`)
      setData(r)
      setSelected(new Set())
    } catch(e) { setError(e.message) }
    finally { setLoad(false) }
  }

  const filtered = useMemo(() => {
    if (!data?.data) return []
    let rows = fDept ? data.data.filter(r => r.department === fDept) : data.data
    if (q) {
      const s = q.toLowerCase()
      rows = rows.filter(r =>
        (r.name||'').toLowerCase().includes(s) ||
        (r.employeeCode||'').toLowerCase().includes(s) ||
        (r.department||'').toLowerCase().includes(s)
      )
    }
    return rows
  }, [data, fDept, q])

  const payrollPages = Math.ceil(filtered.length / limit)
  const paginated    = filtered.slice((page - 1) * limit, page * limit)

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(r => r.employeeId)))
  }
  function toggleOne(id) {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const sum = data?.summary || {}

  const noSalaryCount = filtered.filter(r => !r.salary).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {/* Controls */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
        <Input label="From" type="date" value={startDate} onChange={e => setStart(e.target.value)} style={{ width:160 }}/>
        <Input label="To"   type="date" value={endDate}   onChange={e => setEnd(e.target.value)}   style={{ width:160 }}/>
        {depts.length > 0 && (
          <div style={{ paddingBottom:2 }}>
            <select value={fDept} onChange={e => { setFDept(e.target.value); setPage(1) }}
              className="field-input" style={{ width:'auto', fontSize:'0.8125rem' }}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        <div style={{ paddingBottom:2 }}>
          <Button onClick={load} loading={loading}><Filter size={13}/> Calculate Payroll</Button>
        </div>
        <SearchBox value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search employee…" style={{ minWidth:200, maxWidth:300, alignSelf:'flex-end', marginBottom:2 }}/>
      </div>

      {error && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:10,
          background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.2)' }}>
          <AlertTriangle size={15} style={{ color:'#f87171', flexShrink:0 }}/>
          <p style={{ fontSize:'0.875rem', color:'#f87171' }}>{error}</p>
        </div>
      )}

      {!data && !loading && !error && (
        <Empty icon={Wallet} title="Select a period" description="Choose a date range and click Calculate Payroll to generate the payroll report."/>
      )}

      {(data || loading) && (<>
        {/* Summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
          <PayStatCard label="Headcount"    value={loading?'…':sum.headcount??0}   sub="active employees"                      icon={Users}        accent="#58a6ff" index={0}/>
          <PayStatCard label="Total Gross"  value={loading?'…':fmt(sum.totalGross)} sub={`Avg ${fmt((sum.totalGross||0)/(sum.headcount||1))}`}  icon={DollarSign}   accent="#34d399" index={1}/>
          <PayStatCard label="Total Net"    value={loading?'…':fmt(sum.totalNet)}   sub="after all deductions"                  icon={Wallet}       accent="#60a5fa" index={2}/>
          <PayStatCard label="Total OT"     value={loading?'…':fmt(sum.totalOT)}    sub={`${loading?'…':filtered.filter(r=>r.payroll?.otMinutes>0).length} employees`} icon={TrendingUp} accent="#c084fc" index={3}/>
          <PayStatCard label="Total PF"     value={loading?'…':fmt(sum.totalPF)}    sub="employer + employee"                   icon={Shield}       accent="#fb923c" index={4}/>
          <PayStatCard label="Total ESI"    value={loading?'…':fmt(sum.totalESI)}   sub="0.75% employee share"                  icon={CheckCircle2} accent="#f472b6" index={5}/>
          <PayStatCard label="LOP Days"     value={loading?'…':fmtD(sum.totalLopDays)} sub="total loss-of-pay days"             icon={XCircle}      accent="#f87171" index={6}/>
        </div>

        {noSalaryCount > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:9,
            background:'rgba(251,146,60,.07)', border:'1px solid rgba(251,146,60,.2)' }}>
            <AlertTriangle size={13} style={{ color:'#fb923c', flexShrink:0 }}/>
            <p style={{ fontSize:'0.8rem', color:'#fb923c' }}>
              <strong>{noSalaryCount}</strong> employee{noSalaryCount > 1 ? 's have' : ' has'} no salary defined — their payroll shows ₹0. Set salary in the Employees module.
            </p>
          </div>
        )}

        {/* Main table */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16,
          overflow:'hidden', boxShadow:'var(--shadow-card)' }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <BarChart3 size={14} style={{ color:'var(--accent)' }}/>
            <span style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-primary)' }}>
              Payroll Register
            </span>
            <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-dim)' }}>
              {data?.startDate} → {data?.endDate} · {filtered.length} employees
            </span>
            {selected.size > 0 && (
              <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--accent)', marginLeft:'auto' }}>
                {selected.size} selected
              </span>
            )}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', minWidth:860 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  <th className="tbl-head" style={{ width:36 }}>
                    <div onClick={toggleAll}
                      style={{ width:16, height:16, borderRadius:4, cursor:'pointer', transition:'all .12s',
                        border:`2px solid ${selected.size === filtered.length && filtered.length > 0 ? 'var(--accent)' : 'var(--border)'}`,
                        background: selected.size === filtered.length && filtered.length > 0 ? 'var(--accent)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {selected.size === filtered.length && filtered.length > 0 && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth={2} strokeLinecap="round"/></svg>}
                    </div>
                  </th>
                  <th className="tbl-head">Employee</th>
                  <th className="tbl-head">Dept / Role</th>
                  <th className="tbl-head">
                    <span style={{ borderBottom:'1px dashed var(--border)', cursor:'default' }} title="Attendance summary: P=Present L=Late H=Half A=Absent PL=Paid Leave">Attendance</span>
                  </th>
                  <th className="tbl-head">
                    <span style={{ borderBottom:'1px dashed var(--border)', cursor:'default' }} title="Effective paid days / Total working days in period">Paid / Work</span>
                  </th>
                  <th className="tbl-head">
                    <span style={{ borderBottom:'1px dashed rgba(248,113,113,.5)', color:'#f87171', cursor:'default' }} title="Loss of Pay days deducted from salary">LOP</span>
                  </th>
                  <th className="tbl-head">Gross</th>
                  <th className="tbl-head">
                    <span style={{ borderBottom:'1px dashed rgba(192,132,252,.4)', color:'#c084fc', cursor:'default' }} title="Overtime earnings">OT</span>
                  </th>
                  <th className="tbl-head">
                    <span style={{ borderBottom:'1px dashed rgba(248,113,113,.4)', color:'#f87171', cursor:'default' }} title="Total deductions: PF + ESI + PT">Deduct</span>
                  </th>
                  <th className="tbl-head">
                    <span style={{ borderBottom:'1px dashed rgba(52,211,153,.4)', color:'#34d399', cursor:'default' }} title="Net pay = Gross + OT − Deductions">Net Pay</span>
                  </th>
                  <th className="tbl-head" style={{ width:32 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length:6 }).map((_,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                        {Array.from({ length:11 }).map((_,j) => (
                          <td key={j} className="tbl-cell">
                            <div style={{ height:13, borderRadius:4, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
                          </td>
                        ))}
                      </tr>
                    ))
                  : paginated.map(rec => (
                      <PayrollRow
                        key={rec.employeeId}
                        rec={rec}
                        selected={selected.has(rec.employeeId)}
                        onToggle={() => toggleOne(rec.employeeId)}/>
                    ))}
              </tbody>
              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop:'2px solid var(--border)', background:'var(--bg-surface2)' }}>
                    <td colSpan={4} className="tbl-cell">
                      <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-secondary)', fontFamily:'monospace' }}>
                        TOTAL — {filtered.length} employees
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <span style={{ fontSize:'0.82rem', fontFamily:'monospace', color:'var(--text-secondary)' }}>
                        {(filtered.reduce((s,r)=>s+r.payroll.effectiveDays,0)/filtered.length).toFixed(1)} avg
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:700, color:'#f87171' }}>
                        {fmtD(filtered.reduce((s,r)=>s+r.payroll.lopDays,0))}d
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <span style={{ fontSize:'0.85rem', fontFamily:'monospace', fontWeight:800, color:'var(--text-primary)' }}>
                        {fmt(filtered.reduce((s,r)=>s+r.payroll.grossPay,0))}
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:700, color:'#c084fc' }}>
                        {fmt(filtered.reduce((s,r)=>s+r.payroll.otAmount,0))}
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <span style={{ fontSize:'0.82rem', fontFamily:'monospace', fontWeight:700, color:'#f87171' }}>
                        -{fmt(filtered.reduce((s,r)=>s+r.payroll.deductions.total,0))}
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <span style={{ fontSize:'0.92rem', fontFamily:'monospace', fontWeight:800, color:'#34d399' }}>
                        {fmt(filtered.reduce((s,r)=>s+r.payroll.netPay,0))}
                      </span>
                    </td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!loading && filtered.length === 0 && (
            <Empty icon={Users} title="No payroll data" description="No active employees found for this period."/>
          )}
        </div>
        <Pagination page={page} pages={payrollPages} onPage={setPage} total={filtered.length} limit={limit}
          onLimit={n => { setLimit(n); setPage(1) }}/>

        {/* Reports panel */}
        {!loading && filtered.length > 0 && (
          <ReportsPanel
            data={filtered}
            selectedIds={selected}
            period={{ startDate, endDate }}
            org={getOrg()}/>
        )}
      </>)}
    </div>
  )
}
