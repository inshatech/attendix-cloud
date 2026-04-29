import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Clock, XCircle, Calendar, CalendarDays,
  ChevronDown, ChevronRight, RefreshCw, Plus, Edit3, Trash2,
  CheckCircle2, Filter, TrendingUp, Activity, Coffee,
  Fingerprint, AlarmClock, Zap, BarChart3, Info, Clock3,
} from 'lucide-react'
import { Button }       from '../components/ui/Button'
import { SearchBox }    from '../components/ui/SearchBox'
import { Input }        from '../components/ui/Input'
import { Modal }        from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { Empty }        from '../components/ui/Empty'
import { useAuth }      from '../store/auth'
import { useOrgContext } from '../store/context'
import {
  UserPage, UserStatCard, UserAvatar, UserPageHeader,
} from '../components/ui/UserUI'
import { useToast }          from '../components/ui/Toast'
import Pagination            from '../components/ui/Pagination'
import PayrollTab            from './PayrollTab'
import { AbbrLegendButton }  from './AbbrLegend'
import api                   from '../lib/api'

const ATT_PAGE_SIZE = 25

// ── Gender icon ───────────────────────────────────────────────────────────────
const GENDER_CFG = {
  male:   { symbol:'♂', color:'#60a5fa', label:'Male'   },
  female: { symbol:'♀', color:'#f472b6', label:'Female' },
  other:  { symbol:'⚧', color:'#a78bfa', label:'Other'  },
}
function GenderIcon({ gender }) {
  const cfg = GENDER_CFG[gender]
  if (!cfg) return null
  return <span title={cfg.label} style={{ fontSize:'0.82rem', lineHeight:1, color:cfg.color, flexShrink:0 }}>{cfg.symbol}</span>
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PUNCH_SHORT = { 0:'IN', 1:'OUT', 2:'BRK↑', 3:'BRK↓', 4:'OT↑', 5:'OT↓' }
const PUNCH_FULL  = { 0:'Check-In', 1:'Check-Out', 2:'Break Start', 3:'Break End', 4:'Overtime In', 5:'Overtime Out' }
const PUNCH_COLORS = { 0:'#34d399', 1:'#f87171', 2:'#fb923c', 3:'#60a5fa', 4:'#c084fc', 5:'#f472b6' }

const STATUS_CFG = {
  present:     { label:'Present',    short:'P',   desc:'Employee was on time',                  accent:'#34d399', bg:'rgba(52,211,153,.1)',  border:'rgba(52,211,153,.25)'  },
  late:        { label:'Late',       short:'L',   desc:'Arrived after grace period',            accent:'#fb923c', bg:'rgba(251,146,60,.1)',  border:'rgba(251,146,60,.25)'  },
  'half-day':  { label:'Half Day',   short:'H',   desc:'Worked less than half-day threshold',   accent:'#facc15', bg:'rgba(250,204,21,.1)',  border:'rgba(250,204,21,.25)'  },
  absent:      { label:'Absent',     short:'A',   desc:'No punch recorded',                     accent:'#f87171', bg:'rgba(248,113,113,.1)', border:'rgba(248,113,113,.25)' },
  'week-off':  { label:'Week Off',   short:'WO',  desc:'Scheduled day off',                     accent:'var(--text-muted)', bg:'var(--bg-surface2)', border:'var(--border)' },
  'on-leave':  { label:'On Leave',   short:'Lv',  desc:'Approved leave',                        accent:'#60a5fa', bg:'rgba(96,165,250,.1)',  border:'rgba(96,165,250,.25)'  },
  'paid-leave':{ label:'Paid Leave', short:'PL',  desc:'Paid leave — counts toward pay',        accent:'#60a5fa', bg:'rgba(96,165,250,.1)',  border:'rgba(96,165,250,.25)'  },
  'sick-leave':{ label:'Sick Leave', short:'SL',  desc:'Medical / sick leave',                  accent:'#c084fc', bg:'rgba(192,132,252,.1)', border:'rgba(192,132,252,.25)' },
  'comp-off':  { label:'Comp Off',   short:'CO',  desc:'Compensatory off for extra day worked', accent:'#22d3ee', bg:'rgba(34,211,238,.1)',  border:'rgba(34,211,238,.25)'  },
  holiday:     { label:'Holiday',    short:'Hol', desc:'Public / organisation holiday',         accent:'#f472b6', bg:'rgba(244,114,182,.1)', border:'rgba(244,114,182,.25)' },
  'on-duty':   { label:'On Duty',    short:'OD',  desc:'Employee on duty (field / outstation)',  accent:'#818cf8', bg:'rgba(129,140,248,.1)', border:'rgba(129,140,248,.25)' },
}

// Range report column definitions with full labels for tooltip
const RANGE_COLS = [
  { key:'present',  abbr:'P',   label:'Present',   color:'#34d399', desc:'On-time attendance days'        },
  { key:'late',     abbr:'L',   label:'Late',       color:'#fb923c', desc:'Days arrived after grace period'},
  { key:'halfDay',  abbr:'H',   label:'Half Day',   color:'#facc15', desc:'Worked less than half threshold'},
  { key:'absent',   abbr:'A',   label:'Absent',     color:'#f87171', desc:'No punch recorded'             },
  { key:'onLeave',  abbr:'Lv',  label:'On Leave',   color:'#60a5fa', desc:'Any approved leave type'       },
  { key:'holiday',  abbr:'Hol', label:'Holiday',    color:'#f472b6', desc:'Public / org holidays'         },
]

const MANUAL_STATUSES = [
  'present','on-duty','late','half-day','absent',
  'on-leave','paid-leave','sick-leave','comp-off','holiday','week-off',
]

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const fmtMins  = m => m > 0 ? `${Math.floor(m/60)}h ${m%60}m` : '—'

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ children, tip, sub, pos = 'top', delay = 120 }) {
  const [vis, setVis] = useState(false)
  const ref = useState(() => ({ t: null }))[0]
  const show = () => { ref.t = setTimeout(() => setVis(true), delay) }
  const hide = () => { clearTimeout(ref.t); setVis(false) }
  const isTop = pos !== 'bottom'
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      <AnimatePresence>
        {vis && (
          <motion.div
            initial={{ opacity:0, y: isTop ? 4 : -4, scale:.96 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y: isTop ? 4 : -4, scale:.96 }}
            transition={{ duration:.12 }}
            style={{
              position:'absolute',
              [isTop ? 'bottom' : 'top']: 'calc(100% + 7px)',
              left:'50%', transform:'translateX(-50%)',
              background:'var(--bg-elevated, #18181b)',
              border:'1px solid var(--border)',
              borderRadius:8,
              padding:'6px 10px',
              zIndex:9999,
              pointerEvents:'none',
              boxShadow:'0 8px 24px rgba(0,0,0,.35)',
              minWidth:80,
              maxWidth:220,
              textAlign:'center',
            }}>
            {/* arrow */}
            <span style={{
              position:'absolute',
              [isTop ? 'bottom' : 'top']: -5,
              left:'50%', transform:'translateX(-50%)',
              width:8, height:8,
              background:'var(--bg-elevated, #18181b)',
              border: isTop
                ? '0 solid transparent border-right: 1px solid var(--border) border-bottom: 1px solid var(--border)'
                : '',
              borderLeft:'1px solid var(--border)',
              borderBottom: isTop ? '1px solid var(--border)' : 'none',
              borderTop: isTop ? 'none' : '1px solid var(--border)',
              borderRight: isTop ? '1px solid var(--border)' : 'none',
              transform: isTop ? 'translateX(-50%) rotate(45deg)' : 'translateX(-50%) rotate(225deg)',
            }}/>
            <p style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap' }}>{tip}</p>
            {sub && <p style={{ fontSize:'0.67rem', color:'var(--text-muted)', marginTop:2, whiteSpace:'pre-wrap', lineHeight:1.4 }}>{sub}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || { label:status, accent:'var(--text-muted)', bg:'var(--bg-surface2)', border:'var(--border)' }
  const badge = (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:99,
      fontSize:'0.7rem', fontWeight:700, fontFamily:'monospace', whiteSpace:'nowrap',
      background:c.bg, color:c.accent, border:`1px solid ${c.border}`, cursor:'default',
    }}>{c.label}</span>
  )
  return c.desc
    ? <Tooltip tip={c.label} sub={c.desc}>{badge}</Tooltip>
    : badge
}

function PunchBadge({ type }) {
  const color = PUNCH_COLORS[type] ?? 'var(--text-muted)'
  const label = PUNCH_SHORT[type] ?? `P${type}`
  const full  = PUNCH_FULL[type]
  const badge = (
    <span style={{
      fontSize:'0.7rem', fontFamily:'monospace', fontWeight:700, color,
      padding:'2px 7px', borderRadius:5, cursor:'default',
      background:`color-mix(in srgb, ${color} 12%, transparent)`,
      border:`1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    }}>{label}</span>
  )
  return full ? <Tooltip tip={full}>{badge}</Tooltip> : badge
}

// ── Punch timeline (horizontal) ───────────────────────────────────────────────
function PunchTimeline({ punches }) {
  if (!punches?.length) return (
    <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-dim)', fontStyle:'italic' }}>No punches recorded</span>
  )
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
      {punches.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
          {i > 0 && <ChevronRight size={10} style={{ color:'var(--text-dim)', flexShrink:0 }}/>}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <PunchBadge type={p.punchType}/>
            <span style={{ fontSize:'0.6rem', fontFamily:'monospace', color:'var(--text-dim)' }}>{p.time}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Shift rules detail card ───────────────────────────────────────────────────
function ShiftRulesCard({ shift }) {
  if (!shift) return (
    <span style={{ fontSize:'0.75rem', color:'var(--text-dim)', fontStyle:'italic' }}>No shift assigned</span>
  )
  const ar = shift.attendanceRules || {}
  const ot = shift.overtimeRules   || {}
  const chips = [
    shift.defaultInTime  && { icon:AlarmClock, label:`In ${shift.defaultInTime}`,   color:'#34d399' },
    shift.defaultOutTime && { icon:Clock3,     label:`Out ${shift.defaultOutTime}`,  color:'#60a5fa' },
    shift.durationMinutes && { icon:Clock,     label:`${Math.floor(shift.durationMinutes/60)}h shift`, color:'var(--text-muted)' },
    ar.graceLateMinutes  && { icon:Info,       label:`Grace ${ar.graceLateMinutes}m`, color:'#fb923c' },
    ar.halfDayAfterMinutes && { icon:Coffee,   label:`Half-day <${ar.halfDayAfterMinutes}m`, color:'#facc15' },
    ot.enabled           && { icon:Zap,        label:`OT after ${ot.afterMinutes || 0}m`, color:'#c084fc' },
    shift.isNightShift   && { icon:CalendarDays, label:'Night Shift', color:'#f472b6' },
  ].filter(Boolean)

  const breaks = shift.breaks || []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
        {chips.map((c, i) => {
          const Icon = c.icon
          return (
            <span key={i} style={{
              display:'inline-flex', alignItems:'center', gap:4,
              fontSize:'0.68rem', fontFamily:'monospace', padding:'3px 8px',
              borderRadius:6, color:c.color,
              background:`color-mix(in srgb, ${c.color} 10%, transparent)`,
              border:`1px solid color-mix(in srgb, ${c.color} 22%, transparent)`,
            }}>
              <Icon size={9}/>{c.label}
            </span>
          )
        })}
      </div>
      {breaks.length > 0 && (
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Breaks:</span>
          {breaks.map((b, i) => (
            <span key={i} style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'#fb923c', padding:'1px 6px', borderRadius:4, background:'rgba(251,146,60,.08)', border:'1px solid rgba(251,146,60,.2)' }}>
              {b.name || `Break ${i+1}`}{b.startTime ? ` ${b.startTime}–${b.endTime||'?'}` : ''}{b.durationMinutes ? ` (${b.durationMinutes}m)` : ''}
            </span>
          ))}
        </div>
      )}
      {ar.autoDeductBreak && (
        <span style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', fontStyle:'italic' }}>Auto-deduct break time from worked hours</span>
      )}
    </div>
  )
}

function LiveFeed({ punches }) {
  if (!punches?.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'2rem 0', gap:10 }}>
      <motion.div animate={{ opacity:[0.3,1,0.3] }} transition={{ repeat:Infinity, duration:2 }}>
        <Activity size={20} style={{ color:'var(--text-dim)' }}/>
      </motion.div>
      <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--text-dim)', textAlign:'center' }}>Waiting for punches…</p>
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:300, overflowY:'auto' }}>
      <AnimatePresence>
        {punches.slice(0,20).map((p, i) => {
          const isIn = p.punchType === 0 || p.punchType === 3 || p.punchType === 4
          const emp  = p.employee
          const time = new Date(p.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
          return (
            <motion.div key={p._id || i}
              initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{
                display:'flex', alignItems:'center', gap:9, padding:'9px 11px', borderRadius:9,
                background: isIn ? 'rgba(52,211,153,.05)' : 'rgba(248,113,113,.05)',
                border:`1px solid ${isIn ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)'}`,
              }}>
              <UserAvatar name={emp?.name || p.userId || '?'} photoUrl={emp?.photo} size={28}/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {emp?.name || `UID ${p.userId}`}
                </p>
                <p style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-muted)' }}>
                  {emp?.code}{emp?.code && p.deviceId ? ' · ' : ''}{p.deviceId?.slice(-8)}
                </p>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                <PunchBadge type={p.punchType}/>
                <span style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)' }}>{time}</span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ── Today row — expandable with punch timeline + shift rules ──────────────────
function TodayRow({ rec, onEdit }) {
  const [open, setOpen] = useState(false)
  const hasDetail = rec.punches?.length > 0 || rec.shift
  return (
    <>
      <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }} className="tbl-row"
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setOpen(v => !v)}>
        <td className="tbl-cell">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <UserAvatar name={rec.name || '?'} photoUrl={rec.photo} size={32}/>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.name}</p>
                <GenderIcon gender={rec.gender}/>
              </div>
              <p style={{ fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{rec.code}</p>
            </div>
          </div>
        </td>
        <td className="tbl-cell">
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.department || '—'}</p>
        </td>
        <td className="tbl-cell">
          {rec.shift
            ? <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem', color:'var(--text-secondary)' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:rec.shift.color||'var(--accent)', flexShrink:0 }}/>
                {rec.shift.name}
              </span>
            : <span style={{ color:'var(--text-dim)', fontSize:'0.8rem' }}>—</span>}
        </td>
        <td className="tbl-cell">
          <p style={{ fontSize:'0.875rem', fontFamily:'monospace', color: rec.inTime ? 'var(--text-primary)' : 'var(--text-dim)' }}>
            {rec.inTime || '—'}
          </p>
        </td>
        <td className="tbl-cell">
          <p style={{ fontSize:'0.875rem', fontFamily:'monospace', color: rec.outTime ? 'var(--text-primary)' : 'var(--text-dim)' }}>
            {rec.outTime || '—'}
          </p>
        </td>
        <td className="tbl-cell">
          {rec.workedMinutes > 0
            ? <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--accent)', fontWeight:600 }}>
                {fmtMins(rec.workedMinutes)}
              </p>
            : <p style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>—</p>}
        </td>
        <td className="tbl-cell">
          {rec.lateMinutes > 0
            ? <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'#fb923c', fontWeight:600 }}>+{rec.lateMinutes}m</p>
            : <p style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>—</p>}
        </td>
        <td className="tbl-cell">
          {rec.overtimeMinutes > 0
            ? <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'#c084fc', fontWeight:600 }}>{rec.overtimeMinutes}m</p>
            : <p style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>—</p>}
        </td>
        <td className="tbl-cell">
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <StatusBadge status={rec.status}/>
            {rec.isManual && (
              <span style={{ fontSize:'0.6rem', fontFamily:'monospace', color:'#a855f7', border:'1px solid rgba(168,85,247,.25)', padding:'1px 5px', borderRadius:4, flexShrink:0 }}>manual</span>
            )}
          </div>
        </td>
        <td className="tbl-cell">
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            {hasDetail && (
              <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration:.2 }}>
                <ChevronRight size={12} style={{ color:'var(--text-dim)' }}/>
              </motion.div>
            )}
            <button onClick={e => { e.stopPropagation(); onEdit(rec) }} title="Manual Entry"
              style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg-surface2)', cursor:'pointer', color:'var(--text-muted)', transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#fb923c'; e.currentTarget.style.color='#fb923c'; e.currentTarget.style.background='rgba(251,146,60,.08)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='var(--bg-surface2)' }}>
              <Edit3 size={12}/>
            </button>
          </div>
        </td>
      </motion.tr>
      <AnimatePresence>
        {open && (
          <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <td colSpan={10} style={{ padding:'0 0 2px 0', background:'var(--bg-surface2)' }}>
              <div style={{ padding:'12px 20px 14px', display:'flex', flexDirection:'column', gap:12, borderTop:'1px solid var(--border-soft)', borderBottom:'1px solid var(--border-soft)' }}>
                {/* Punch timeline */}
                <div>
                  <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Punch Timeline</p>
                  <PunchTimeline punches={rec.punches || []}/>
                </div>
                {/* Shift rules */}
                {rec.shift && (
                  <div>
                    <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Shift Rules — {rec.shift.name}</p>
                    <ShiftRulesCard shift={rec.shift}/>
                  </div>
                )}
                {/* Reason if manual */}
                {rec.isManual && rec.reason && (
                  <div>
                    <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Note</p>
                    <p style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{rec.reason}</p>
                  </div>
                )}
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

function DayCell({ d }) {
  const s     = STATUS_CFG[d.status] || { accent:'var(--text-muted)', bg:'var(--bg-surface2)', border:'var(--border)' }
  const label = STATUS_CFG[d.status]?.label || d.status
  const dt    = new Date(d.date + 'T12:00:00')
  const day   = dt.getDate()
  const dow   = dt.toLocaleDateString('en-IN', { weekday:'short' })

  const tipLines = [
    `${dow} ${d.date}`,
    d.holidayName ? `🎉 ${d.holidayName}` : null,
    d.inTime  ? `In: ${d.inTime}   Out: ${d.outTime || '—'}` : null,
    d.workedMinutes > 0  ? `Worked: ${fmtMins(d.workedMinutes)}`  : null,
    d.lateMinutes > 0    ? `Late: +${d.lateMinutes}m`             : null,
    d.overtimeMinutes > 0 ? `OT: ${d.overtimeMinutes}m`           : null,
    d.isManual ? `✏ Manual entry${d.reason ? ': ' + d.reason : ''}` : null,
  ].filter(Boolean).join('\n')

  return (
    <Tooltip tip={label} sub={tipLines} pos="top">
      <div style={{
        display:'flex', flexDirection:'column', alignItems:'center', width:32, padding:'3px 2px',
        borderRadius:6, cursor:'default', background:s.bg, color:s.accent, border:`1px solid ${s.border}`,
        position:'relative', transition:'transform .1s, box-shadow .1s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform='scale(1.15)'; e.currentTarget.style.zIndex='10'; e.currentTarget.style.boxShadow=`0 4px 12px color-mix(in srgb, ${s.accent} 30%, transparent)` }}
        onMouseLeave={e => { e.currentTarget.style.transform='scale(1)';    e.currentTarget.style.zIndex='';  e.currentTarget.style.boxShadow='none' }}>
        <span style={{ fontWeight:700, fontSize:'0.7rem' }}>{day}</span>
        <span style={{ fontSize:'0.55rem', opacity:0.85, marginTop:1 }}>{label.slice(0,3)}</span>
        {d.isManual && (
          <span style={{ position:'absolute', top:-3, right:-3, width:6, height:6, borderRadius:'50%', background:'#a855f7', border:'1px solid var(--bg-surface2)' }}/>
        )}
      </div>
    </Tooltip>
  )
}

// ── Range row — expandable with day cells + shift + totals breakdown ───────────
function RangeRow({ rec }) {
  const [open, setOpen] = useState(false)
  const { present=0, late=0, halfDay=0, absent=0, weekOff=0, holiday=0, onLeave=0,
          workedMinutes=0, lateMinutes=0, overtimeMinutes=0 } = rec.totals || {}
  return (
    <>
      <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }} className="tbl-row"
        style={{ cursor:'pointer' }} onClick={() => setOpen(v => !v)}>
        <td className="tbl-cell">
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <UserAvatar name={rec.name||'?'} photoUrl={rec.photo} size={28}/>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.name}</p>
                <GenderIcon gender={rec.gender}/>
              </div>
              <p style={{ fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{rec.code}</p>
            </div>
          </div>
        </td>
        {RANGE_COLS.map(c => {
          const val = rec.totals?.[c.key] ?? 0
          return (
            <td key={c.key} className="tbl-cell">
              <Tooltip tip={`${val} day${val!==1?'s':''} ${c.label}`} sub={c.desc}>
                <span style={{
                  fontSize:'0.85rem', fontFamily:'monospace', fontWeight:700,
                  color: val > 0 ? c.color : 'var(--text-dim)',
                  cursor:'default',
                }}>{val}</span>
              </Tooltip>
            </td>
          )
        })}
        <td className="tbl-cell">
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            <span style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--accent)', fontWeight:600 }}>
              {Math.floor(workedMinutes/60)}h {workedMinutes%60}m
            </span>
            {overtimeMinutes > 0 && (
              <span style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'#c084fc' }}>+{overtimeMinutes}m OT</span>
            )}
          </div>
        </td>
        <td className="tbl-cell">
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration:.2 }}>
            <ChevronDown size={13} style={{ color:'var(--text-dim)' }}/>
          </motion.div>
        </td>
      </motion.tr>
      <AnimatePresence>
        {open && (
          <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <td colSpan={9} style={{ padding:'0', background:'var(--bg-surface2)', borderTop:'1px solid var(--border-soft)' }}>
              <div style={{ padding:'12px 16px 16px', display:'flex', flexDirection:'column', gap:12 }}>
                {/* Day cells */}
                <div>
                  <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Day-by-day</p>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {(rec.days||[]).map(d => <DayCell key={d.date} d={d}/>)}
                  </div>
                </div>
                {/* Summary stats */}
                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                  {[
                    { l:'Total Hours',   v: fmtMins(workedMinutes),   c:'var(--accent)' },
                    lateMinutes > 0 && { l:'Total Late',    v: `${lateMinutes}m`,             c:'#fb923c' },
                    overtimeMinutes > 0 && { l:'Overtime',  v: `${overtimeMinutes}m`,          c:'#c084fc' },
                  ].filter(Boolean).map(m => (
                    <div key={m.l}>
                      <p style={{ fontSize:'0.62rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{m.l}</p>
                      <p style={{ fontSize:'0.875rem', fontWeight:700, fontFamily:'monospace', color:m.c }}>{m.v}</p>
                    </div>
                  ))}
                </div>
                {/* Shift rules */}
                {rec.shift && (
                  <div>
                    <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Shift — {rec.shift.name}</p>
                    <ShiftRulesCard shift={rec.shift}/>
                  </div>
                )}
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Punch logs grouped by employee + date ─────────────────────────────────────
function LogsGrouped({ logs, loading, search, total }) {
  const groups = useMemo(() => {
    if (!logs.length) return []
    // logs are already sorted timestamp ASC by server
    const map = new Map()
    for (const l of logs) {
      // use server-provided localDate for correct timezone grouping
      const date = l.localDate || new Date(l.timestamp).toLocaleDateString('en-CA')
      const uid  = l.employee?.code || l.userId || 'unknown'
      const key  = `${uid}__${date}`
      if (!map.has(key)) map.set(key, { employee: l.employee, userId: l.userId, date, punches: [] })
      map.get(key).punches.push({
        punchType: l.punchType,
        time: new Date(l.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false }),
        deviceId: l.deviceId,
      })
    }
    const all = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || (a.employee?.name || '').localeCompare(b.employee?.name || ''))
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(g =>
      (g.employee?.name  || '').toLowerCase().includes(q) ||
      (g.employee?.code  || '').toLowerCase().includes(q) ||
      (g.userId          || '').toLowerCase().includes(q)
    )
  }, [logs, search])

  if (loading) return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
      {Array.from({ length:5 }).map((_, i) => (
        <div key={i} style={{ height:72, borderRadius:10, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
      ))}
    </div>
  )

  if (!logs.length && !loading) return (
    <Empty icon={Fingerprint} title="No punch logs" description="Select a date range and click Load Logs."/>
  )
  if (!groups.length && search) return (
    <Empty icon={Fingerprint} title="No results" description={`No punch records match "${search}".`}/>
  )

  // Group groups by date for date headers
  let lastDate = null
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, padding:'12px 14px' }}>
      {groups.map((g, i) => {
        const showDate = g.date !== lastDate
        lastDate = g.date
        const dateLabel = new Date(g.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
        return (
          <div key={i}>
            {showDate && (
              <div style={{ padding:'6px 2px 4px', display:'flex', alignItems:'center', gap:8, marginTop: i > 0 ? 10 : 0 }}>
                <span style={{ fontSize:'0.7rem', fontFamily:'monospace', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{dateLabel}</span>
                <div style={{ flex:1, height:1, background:'var(--border-soft)' }}/>
              </div>
            )}
            <div style={{
              display:'flex', alignItems:'flex-start', gap:12, padding:'10px 12px',
              borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border-soft)',
            }}>
              <UserAvatar name={g.employee?.name || g.userId || '?'} photoUrl={g.employee?.photoUrl} size={34}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
                  <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)' }}>
                    {g.employee?.name || `UID ${g.userId}`}
                  </p>
                  <GenderIcon gender={g.employee?.gender}/>
                  {g.employee?.code && (
                    <span style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{g.employee.code}</span>
                  )}
                  <span style={{ marginLeft:'auto', fontSize:'0.68rem', fontFamily:'monospace', color:'var(--text-dim)' }}>
                    {g.punches.length} punch{g.punches.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <PunchTimeline punches={g.punches}/>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_SHORT   = ['Su','Mo','Tu','We','Th','Fr','Sa']

function ManualModal({ open, onClose, initial, orgId, employees, onSaved }) {
  const [form,            setForm]           = useState({})
  const [busy,            setBusy]           = useState(false)
  const [dateMode,        setDateMode]       = useState('single') // 'single' | 'range' | 'month'
  const [rangeFrom,       setRangeFrom]      = useState(todayStr())
  const [rangeTo,         setRangeTo]        = useState(todayStr())
  const [excludeWeekends, setExcludeWknd]    = useState(true)
  const [calYear,         setCalYear]        = useState(new Date().getFullYear())
  const [calMonth,        setCalMonth]       = useState(new Date().getMonth())
  const [selectedDays,    setSelectedDays]   = useState(new Set())
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    const now = new Date()
    setDateMode('single')
    setRangeFrom(todayStr()); setRangeTo(todayStr()); setExcludeWknd(true)
    setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); setSelectedDays(new Set())
    setForm({
      employeeId:    initial?.employeeId    || '',
      date:          initial?.date          || todayStr(),
      status:        initial?.status        || 'present',
      inTime:        initial?.inTime        || '',
      outTime:       initial?.outTime       || '',
      workedMinutes: initial?.workedMinutes != null ? String(initial.workedMinutes) : '',
      leaveType:     initial?.leaveType     || '',
      leaveHalf:     initial?.leaveHalf     || '',
      reason:        initial?.reason        || '',
    })
  }, [open, initial])

  const sf = k => e => setForm(f => ({...f, [k]: e.target.value}))

  function calcWorked(inT, outT) {
    if (!inT || !outT) return ''
    const [ih, im] = inT.split(':').map(Number)
    const [oh, om] = outT.split(':').map(Number)
    let mins = (oh * 60 + om) - (ih * 60 + im)
    if (mins < 0) mins += 1440
    return String(mins)
  }
  function onInTime(e)  { const v = e.target.value; setForm(f => ({ ...f, inTime:  v, workedMinutes: calcWorked(v, f.outTime) })) }
  function onOutTime(e) { const v = e.target.value; setForm(f => ({ ...f, outTime: v, workedMinutes: calcWorked(f.inTime, v) })) }

  // ── Derive the final list of dates to save ──────────────────────────────────
  function getDateList() {
    if (dateMode === 'single') return form.date ? [form.date] : []
    if (dateMode === 'range') {
      if (!rangeFrom || !rangeTo) return []
      const list = []; let d = new Date(rangeFrom + 'T12:00:00')
      const end  = new Date(rangeTo  + 'T12:00:00')
      while (d <= end) {
        const dow = d.getDay()
        if (!excludeWeekends || (dow !== 0 && dow !== 6))
          list.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
        d.setDate(d.getDate() + 1)
      }
      return list
    }
    if (dateMode === 'month') return [...selectedDays].sort()
    return []
  }

  async function save() {
    if (!form.employeeId) return toast('Select an employee', 'error')
    const dateList = getDateList()
    if (!dateList.length) return toast('Select at least one date', 'error')
    setBusy(true)
    try {
      if (initial?.manualId) {
        await api.patch(`/organizations/${orgId}/attendance/manual/${initial.manualId}`, form)
        toast('Entry updated', 'success')
      } else if (dateList.length === 1) {
        await api.post(`/organizations/${orgId}/attendance/manual`, { ...form, date: dateList[0] })
        toast('Manual entry saved', 'success')
      } else {
        let ok = 0, fail = 0
        for (const date of dateList) {
          try { await api.post(`/organizations/${orgId}/attendance/manual`, { ...form, date }); ok++ }
          catch { fail++ }
        }
        toast(fail === 0 ? `${ok} entries saved` : `${ok} saved, ${fail} failed`, fail ? 'error' : 'success')
      }
      onSaved(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── Calendar helpers ────────────────────────────────────────────────────────
  function calDateStr(day) {
    return `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  function toggleDay(ds) {
    setSelectedDays(prev => { const n = new Set(prev); n.has(ds) ? n.delete(ds) : n.add(ds); return n })
  }
  function selectWeekdays() {
    const days = new Set()
    const dim = new Date(calYear, calMonth + 1, 0).getDate()
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(calYear, calMonth, d).getDay()
      if (dow !== 0 && dow !== 6) days.add(calDateStr(d))
    }
    setSelectedDays(days)
  }
  function selectAll() {
    const days = new Set()
    const dim = new Date(calYear, calMonth + 1, 0).getDate()
    for (let d = 1; d <= dim; d++) days.add(calDateStr(d))
    setSelectedDays(days)
  }

  const isLeave    = ['on-leave','paid-leave','sick-leave','comp-off'].includes(form.status)
  const hasTime    = !['absent','week-off','holiday'].includes(form.status)
  const selEmp     = employees.find(e => e.employeeId === form.employeeId)
  const statusCfg  = s => STATUS_CFG[s] || { label: s, accent: 'var(--text-muted)', bg: 'var(--bg-surface2)' }
  const dateList   = getDateList()
  const dateCount  = dateList.length
  const isEdit     = !!initial?.manualId

  // Calendar grid data
  const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDowOfMonth = new Date(calYear, calMonth, 1).getDay()

  const LSEC = { fontSize:'0.65rem', fontFamily:'monospace', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:7 }

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? 'Edit Manual Entry' : 'Add Manual Attendance'}
      description={isEdit ? 'Edit attendance override for this entry'
        : dateCount > 0 ? `${dateCount} date${dateCount > 1 ? 's' : ''} selected — same settings applied to all`
        : 'Select employee, dates and attendance details below'}
      size="lg" noScroll>
      <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      <div style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column', gap:14, paddingBottom:4 }}>

        {/* ── Employee ── */}
        <div style={{ background:'var(--bg-surface2)', borderRadius:12, padding:'11px 14px', border:'1px solid var(--border)' }}>
          <label style={LSEC}>Employee *</label>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0, border:'1px solid var(--border)',
              background: selEmp ? 'color-mix(in srgb,var(--accent) 15%,var(--bg-surface))' : 'var(--bg-surface)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.875rem', fontWeight:800, color:'var(--accent)' }}>
              {selEmp ? selEmp.name[0].toUpperCase() : '?'}
            </div>
            <select className="field-input" value={form.employeeId} onChange={sf('employeeId')} style={{ flex:1 }}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.name}{e.code ? ` · ${e.code}` : ''}</option>)}
            </select>
          </div>
        </div>

        {/* ── Date section ── */}
        <div style={{ background:'var(--bg-surface2)', borderRadius:12, border:'1px solid var(--border)' }}>
          {/* Mode tabs — hidden in edit mode */}
          {!isEdit && (
            <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
              {[['single','Single'],['range','Range'],['month','Month']].map(([m, lbl]) => (
                <button key={m} type="button" onClick={() => setDateMode(m)}
                  style={{ flex:1, padding:'9px 4px', fontSize:'0.8125rem', fontWeight:600, cursor:'pointer',
                    background: dateMode === m ? 'var(--bg-surface)' : 'transparent',
                    color: dateMode === m ? 'var(--accent)' : 'var(--text-muted)',
                    borderBottom: `2px solid ${dateMode === m ? 'var(--accent)' : 'transparent'}`,
                    transition:'all .15s' }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          <div style={{ padding:'12px 14px' }}>

            {/* Single */}
            {(isEdit || dateMode === 'single') && (
              <div>
                <label style={LSEC}>Date *</label>
                <input type="date" value={form.date} onChange={sf('date')}
                  className="field-input" style={{ fontFamily:'monospace' }}/>
              </div>
            )}

            {/* Range */}
            {!isEdit && dateMode === 'range' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={LSEC}>From</label>
                    <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                      className="field-input" style={{ fontFamily:'monospace' }}/>
                  </div>
                  <div>
                    <label style={LSEC}>To</label>
                    <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                      className="field-input" style={{ fontFamily:'monospace' }}/>
                  </div>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer', userSelect:'none',
                  padding:'9px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg-surface)' }}>
                  <input type="checkbox" checked={excludeWeekends} onChange={e => setExcludeWknd(e.target.checked)}/>
                  <span style={{ fontSize:'0.875rem', color:'var(--text-secondary)', fontWeight:500 }}>Exclude weekends</span>
                </label>
                {dateCount > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:9,
                    background:'var(--accent-muted)', border:'1px solid var(--accent-border)' }}>
                    <span style={{ fontSize:'0.875rem', fontWeight:800, color:'var(--accent)', fontFamily:'monospace' }}>{dateCount}</span>
                    <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>working days selected</span>
                  </div>
                )}
              </div>
            )}

            {/* Month calendar */}
            {!isEdit && dateMode === 'month' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* Month navigator */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <button type="button"
                    onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y-- } setCalMonth(m); setCalYear(y); setSelectedDays(new Set()) }}
                    style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <ChevronDown size={13} style={{ transform:'rotate(90deg)' }}/>
                  </button>
                  <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)' }}>
                    {MONTH_NAMES[calMonth]} {calYear}
                  </span>
                  <button type="button"
                    onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++ } setCalMonth(m); setCalYear(y); setSelectedDays(new Set()) }}
                    style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <ChevronDown size={13} style={{ transform:'rotate(-90deg)' }}/>
                  </button>
                </div>

                {/* Quick-select buttons */}
                <div style={{ display:'flex', gap:6 }}>
                  {[
                    { lbl:'Weekdays', fn: selectWeekdays },
                    { lbl:'All days', fn: selectAll },
                    { lbl:'Clear',    fn: () => setSelectedDays(new Set()) },
                  ].map(b => (
                    <button key={b.lbl} type="button" onClick={b.fn}
                      style={{ flex:1, padding:'6px 0', fontSize:'0.78rem', fontWeight:600, borderRadius:8,
                        border:'1px solid var(--border)', background:'var(--bg-surface)',
                        color:'var(--text-secondary)', cursor:'pointer', transition:'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-secondary)' }}>
                      {b.lbl}
                    </button>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
                  {DOW_SHORT.map(d => (
                    <div key={d} style={{ textAlign:'center', fontSize:'0.6rem', fontFamily:'monospace',
                      fontWeight:700, color: d==='Su'||d==='Sa' ? '#f87171' : 'var(--text-dim)', padding:'2px 0' }}>{d}</div>
                  ))}
                  {Array.from({ length: firstDowOfMonth }).map((_, i) => <div key={'e'+i}/>)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const ds  = calDateStr(day)
                    const dow = new Date(calYear, calMonth, day).getDay()
                    const isWknd = dow === 0 || dow === 6
                    const isSel  = selectedDays.has(ds)
                    return (
                      <button key={day} type="button" onClick={() => toggleDay(ds)}
                        style={{
                          aspectRatio:'1', borderRadius:8, border:`1.5px solid ${isSel ? 'var(--accent)' : isWknd ? 'transparent' : 'var(--border)'}`,
                          background: isSel ? 'var(--accent-muted)' : isWknd ? 'var(--bg-surface)' : 'var(--bg-surface2)',
                          color: isSel ? 'var(--accent)' : isWknd ? 'var(--text-dim)' : 'var(--text-secondary)',
                          fontSize:'0.8rem', fontWeight: isSel ? 800 : 400,
                          cursor:'pointer', transition:'all .1s',
                          boxShadow: isSel ? `0 0 0 2px color-mix(in srgb,var(--accent) 15%,transparent)` : 'none',
                        }}>
                        {day}
                      </button>
                    )
                  })}
                </div>

                {/* Count badge */}
                {selectedDays.size > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:9,
                    background:'var(--accent-muted)', border:'1px solid var(--accent-border)' }}>
                    <span style={{ fontSize:'0.875rem', fontWeight:800, color:'var(--accent)', fontFamily:'monospace' }}>{selectedDays.size}</span>
                    <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>day{selectedDays.size !== 1 ? 's' : ''} selected</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Status ── */}
        <div style={{ background:'var(--bg-surface2)', borderRadius:12, padding:'11px 14px', border:'1px solid var(--border)' }}>
          <label style={LSEC}>Status *</label>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Active status badge */}
            <div style={{
              width:38, height:38, borderRadius:10, flexShrink:0,
              background: statusCfg(form.status).bg || 'var(--bg-surface)',
              border: `1.5px solid ${statusCfg(form.status).accent || 'var(--border)'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'0.6rem', fontWeight:800, fontFamily:'monospace', letterSpacing:'0.03em',
              color: statusCfg(form.status).accent || 'var(--text-muted)',
              boxShadow: `0 0 0 3px color-mix(in srgb, ${statusCfg(form.status).accent || 'transparent'} 10%, transparent)`,
              transition:'all .2s',
            }}>
              {statusCfg(form.status).short || form.status.substring(0,2).toUpperCase()}
            </div>
            <select className="field-input" value={form.status} onChange={sf('status')}
              style={{ flex:1, fontWeight:600, color: statusCfg(form.status).accent || 'var(--text-primary)' }}>
              {MANUAL_STATUSES.map(s => {
                const cfg = statusCfg(s)
                return <option key={s} value={s}>{cfg.short} — {cfg.label || s}</option>
              })}
            </select>
          </div>
        </div>

        {/* ── Time ── */}
        {hasTime && (
          <div style={{ background:'var(--bg-surface2)', borderRadius:12, padding:'11px 14px', border:'1px solid var(--border)' }}>
            <label style={LSEC}>Time</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr 1fr', alignItems:'end', gap:8 }}>
              <div>
                <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>In</label>
                <input type="time" value={form.inTime} onChange={onInTime} className="field-input" style={{ fontFamily:'monospace', color:'#34d399' }}/>
              </div>
              <div style={{ paddingBottom:8, color:'var(--text-dim)', fontSize:'0.9rem' }}>→</div>
              <div>
                <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>Out</label>
                <input type="time" value={form.outTime} onChange={onOutTime} className="field-input" style={{ fontFamily:'monospace', color:'#f87171' }}/>
              </div>
              <div>
                <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                  Worked (min)
                  {form.inTime && form.outTime && (
                    <span style={{ fontSize:'0.55rem', fontWeight:700, color:'var(--accent)', background:'var(--accent-muted)', border:'1px solid var(--accent-border)', borderRadius:4, padding:'1px 5px' }}>AUTO</span>
                  )}
                </label>
                <input type="number" className="field-input" style={{ fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}
                  value={form.workedMinutes} onChange={sf('workedMinutes')} placeholder="480" min="0"/>
              </div>
            </div>
          </div>
        )}

        {/* ── Leave details ── */}
        {isLeave && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'11px 14px', borderRadius:12,
            background:'rgba(96,165,250,.05)', border:'1px solid rgba(96,165,250,.2)' }}>
            <div>
              <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>Leave Type</label>
              <select className="field-input" value={form.leaveType} onChange={sf('leaveType')}>
                <option value="">—</option>
                {['casual','sick','earned','maternity','paternity','other'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>Duration</label>
              <select className="field-input" value={form.leaveHalf} onChange={sf('leaveHalf')}>
                <option value="">Full day</option>
                <option value="first">First half</option>
                <option value="second">Second half</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Note ── */}
        <div>
          <label style={LSEC}>Reason / Note</label>
          <Input value={form.reason} onChange={sf('reason')} placeholder="Forgot to punch, machine offline, on leave…"/>
        </div>

      </div>{/* end scrollable */}

      {/* Footer */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:14, borderTop:'1px solid var(--border)', marginTop:6, flexShrink:0 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy} disabled={dateCount === 0 && !isEdit}>
          {isEdit ? 'Update Entry' : dateCount > 1 ? `Save ${dateCount} Entries` : 'Save Entry'}
        </Button>
      </div>
      </div>
    </Modal>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
const Card = ({ children, style: s }) => (
  <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow-card)', ...s }}>
    {children}
  </div>
)

// ─────────────────────────────────────────────────────────────────────────────
export default function Attendance() {
  const { ready }             = useAuth()
  const { orgId, deviceId }   = useOrgContext()
  const { toast }             = useToast()

  const [view,      setView]    = useState('today')
  const [today,     setToday]   = useState(null)
  const [range,     setRange]   = useState(null)
  const [logs,      setLogs]    = useState([])
  const [manuals,   setManuals] = useState([])
  const [employees, setEmps]    = useState([])
  const [loading,   setLoad]    = useState(false)

  const [startDate, setStart]     = useState(todayStr())
  const [endDate,   setEnd]       = useState(todayStr())
  const [fStatus,   setFStatus]   = useState('')
  const [fDept,     setFDept]     = useState('')
  const [depts,     setDepts]     = useState([])

  const [logSearch,     setLogSearch]     = useState('')
  const [logTotal,      setLogTotal]      = useState(null)
  const [todayQ,        setTodayQ]        = useState('')
  const [rangeQ,        setRangeQ]        = useState('')
  const [manualQ,       setManualQ]       = useState('')

  const [manualOpen,    setManualOpen]    = useState(false)
  const [manualInitial, setManualInitial] = useState(null)
  const [delTarget,     setDelTarget]     = useState(null)
  const [delBusy,       setDelBusy]       = useState(false)

  const [todayPage,  setTodayPage]  = useState(1)
  const [rangePage,  setRangePage]  = useState(1)
  const [manualPage, setManualPage] = useState(1)
  const [attLimit,   setAttLimit]   = useState(5)

  async function loadEmps(oid) {
    try {
      const r = await api.get(`/organizations/${oid}/employees?status=active&limit=500`)
      setEmps((r.data||[]).map(e => ({
        employeeId: e.employeeId,
        name: e.displayName || `${e.firstName} ${e.lastName||''}`.trim(),
        code: e.employeeCode,
      })))
    } catch {}
  }

  async function loadToday(oid) {
    if (!oid) return
    setLoad(true)
    try {
      const p = new URLSearchParams()
      if (deviceId) p.set('deviceId', deviceId)
      const r = await api.get(`/organizations/${oid}/attendance/today?${p}`)
      setToday(r)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  async function loadRange(oid) {
    if (!oid) return
    setLoad(true)
    try {
      const p = new URLSearchParams({ startDate, endDate })
      if (deviceId) p.set('deviceId', deviceId)
      if (fDept)    p.set('department', fDept)
      const r = await api.get(`/organizations/${oid}/attendance/range?${p}`)
      setRange(r); setRangePage(1)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  async function loadLogs(oid) {
    if (!oid) return
    setLoad(true)
    setLogSearch('')
    try {
      const p = new URLSearchParams({ startDate, endDate })
      if (deviceId) p.set('deviceId', deviceId)
      const r = await api.get(`/organizations/${oid}/attendance/logs?${p}`)
      setLogs(r.data || [])
      setLogTotal(r.total ?? null)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  async function loadManuals(oid) {
    if (!oid) return
    setLoad(true)
    try {
      const r = await api.get(`/organizations/${oid}/attendance/manual?startDate=${startDate}&endDate=${endDate}`)
      setManuals(r.data || []); setManualPage(1)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  function refresh() {
    if (!orgId) return
    if (view === 'today')  loadToday(orgId)
    if (view === 'range')  loadRange(orgId)
    if (view === 'logs')   loadLogs(orgId)
    if (view === 'manual') { loadManuals(orgId); loadEmps(orgId) }
  }

  useEffect(() => {
    if (ready && orgId) {
      loadEmps(orgId)
      loadToday(orgId)
      api.get(`/organizations/${orgId}/employees/meta/departments`)
        .then(r => setDepts(r.data?.departments || []))
        .catch(() => {})
    }
  }, [ready, orgId])

  useEffect(() => {
    if (orgId) refresh()
  }, [view, orgId, deviceId]) // eslint-disable-line

  // Auto-refresh Today tab every 30 seconds
  useEffect(() => {
    if (!orgId || view !== 'today') return
    const t = setInterval(() => loadToday(orgId), 30000)
    return () => clearInterval(t)
  }, [orgId, view]) // eslint-disable-line

  async function deleteManual() {
    if (!delTarget) return
    setDelBusy(true)
    try {
      await api.delete(`/organizations/${orgId}/attendance/manual/${delTarget.manualId}`)
      toast('Deleted', 'success')
      setDelTarget(null)
      loadManuals(orgId)
    } catch(e) { toast(e.message, 'error') }
    finally { setDelBusy(false) }
  }

  const todayRecs   = (today?.records || []).filter(r => {
    if (fStatus && r.status !== fStatus) return false
    if (fDept   && r.department !== fDept) return false
    if (todayQ) {
      const s = todayQ.toLowerCase()
      if (!(r.name||'').toLowerCase().includes(s) && !(r.code||'').toLowerCase().includes(s)) return false
    }
    return true
  })
  const todayPages  = Math.ceil(todayRecs.length / attLimit)
  const todayPaged  = todayRecs.slice((todayPage - 1) * attLimit, todayPage * attLimit)

  const rangeFiltered = (range?.data || []).filter(r => {
    if (!rangeQ) return true
    const s = rangeQ.toLowerCase()
    return (r.name||'').toLowerCase().includes(s) || (r.code||'').toLowerCase().includes(s)
  })
  const rangePages  = Math.ceil(rangeFiltered.length / attLimit)
  const rangePaged  = rangeFiltered.slice((rangePage - 1) * attLimit, rangePage * attLimit)

  const manualFiltered = manuals.filter(m => {
    if (!manualQ) return true
    const s = manualQ.toLowerCase()
    return (m.employee?.name||'').toLowerCase().includes(s) || (m.employee?.code||'').toLowerCase().includes(s)
  })
  const manualPages = Math.ceil(manualFiltered.length / attLimit)
  const manualPaged = manualFiltered.slice((manualPage - 1) * attLimit, manualPage * attLimit)

  const TABS = [
    { id:'today',   label:"Today's Attendance", icon:Calendar    },
    { id:'range',   label:'Date Range Report',  icon:TrendingUp  },
    { id:'logs',    label:'Punch Logs',         icon:Fingerprint },
    { id:'manual',  label:'Manual Entries',     icon:Edit3       },
    { id:'payroll', label:'Payroll',            icon:BarChart3   },
  ]

  return (
    <UserPage>
      {/* Header */}
      <UserPageHeader
        title="Attendance"
        icon={Fingerprint}
        iconColor="var(--accent)"
        subtitle="Daily summary · range reports · manual entries">
        <Button variant="secondary" size="sm" onClick={refresh} disabled={!orgId} title={view === 'today' ? 'Auto-refreshes every 30s' : 'Refresh'}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
          {view === 'today' && !loading && (
            <span style={{ width:5, height:5, borderRadius:'50%', background:'#34d399', animation:'pulse 2s infinite', flexShrink:0 }}/>
          )}
        </Button>
        <AbbrLegendButton/>
        <Button size="sm" onClick={() => { setManualInitial(null); setManualOpen(true) }} disabled={!orgId}>
          <Plus size={13}/> Manual Entry
        </Button>
      </UserPageHeader>

      {/* No org */}
      {!orgId && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4rem 0', gap:14 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'var(--bg-surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Fingerprint size={24} style={{ color:'var(--text-dim)' }}/>
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>No organization selected</p>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>Select an organization from the top bar to view attendance.</p>
          </div>
        </div>
      )}

      {orgId && (<>
        {/* Tab bar */}
        <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              style={{
                display:'flex', alignItems:'center', gap:7, padding:'10px 18px',
                fontSize:'0.875rem', fontWeight:600, whiteSpace:'nowrap', cursor:'pointer',
                background:'transparent',
                borderBottom: view===t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: view===t.id ? 'var(--accent)' : 'var(--text-muted)',
                transition:'color .15s',
              }}>
              <t.icon size={13}/>{t.label}
            </button>
          ))}
        </div>

        {/* ═══ TODAY ═══ */}
        {view === 'today' && (<>
          {today?.holidayName && (
            <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderRadius:12, background:'rgba(244,114,182,.06)', border:'1px solid rgba(244,114,182,.2)' }}>
              <CalendarDays size={17} style={{ color:'#f472b6', flexShrink:0 }}/>
              <div>
                <p style={{ fontSize:'0.875rem', fontWeight:700, color:'#f472b6' }}>Today is a Holiday — {today.holidayName}</p>
                <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:2 }}>Employees are not marked absent on public holidays.</p>
              </div>
            </motion.div>
          )}

          {/* Stat cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:12 }}>
            <UserStatCard label="Total"    value={loading?'…':today?.total    ??0} icon={Users}        accent="#58a6ff" index={0}/>
            <UserStatCard label="Present"  value={loading?'…':today?.present  ??0} icon={CheckCircle2} accent="#34d399" index={1}/>
            <UserStatCard label="Late"     value={loading?'…':today?.late     ??0} icon={Clock}        accent="#fb923c" index={2}/>
            <UserStatCard label="Half Day" value={loading?'…':today?.halfDay  ??0} icon={Coffee}       accent="#facc15" index={3}/>
            <UserStatCard label="Absent"   value={loading?'…':today?.absent   ??0} icon={XCircle}      accent="#f87171" index={4}/>
            <UserStatCard label="On Leave" value={loading?'…':today?.onLeave  ??0} icon={Calendar}     accent="#60a5fa" index={5}/>
          </div>

          {/* Main 2-col grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 290px', gap:'1.25rem', alignItems:'start' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Filters */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <select value={fStatus} onChange={e => { setFStatus(e.target.value); setTodayPage(1) }}
                  className="field-input" style={{ width:'auto', fontSize:'0.8125rem' }}>
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {depts.length > 0 && (
                  <select value={fDept} onChange={e => { setFDept(e.target.value); setTodayPage(1) }}
                    className="field-input" style={{ width:'auto', fontSize:'0.8125rem' }}>
                    <option value="">All Departments</option>
                    {depts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
                <SearchBox value={todayQ} onChange={e => { setTodayQ(e.target.value); setTodayPage(1) }} placeholder="Search employee…" style={{ minWidth:180, maxWidth:260 }}/>
                <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-dim)', marginLeft:'auto' }}>{todayRecs.length} records · click row to expand</span>
              </div>

              <Card>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', minWidth:760 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        <th className="tbl-head">Employee</th>
                        <th className="tbl-head">
                          <Tooltip tip="Department" sub="Employee's department" pos="bottom">
                            <span style={{ cursor:'default', borderBottom:'1px dashed var(--border)', paddingBottom:1 }}>Dept</span>
                          </Tooltip>
                        </th>
                        <th className="tbl-head">Shift</th>
                        <th className="tbl-head">
                          <Tooltip tip="Check-In Time" sub="First punch of the day" pos="bottom">
                            <span style={{ cursor:'default', borderBottom:'1px dashed var(--border)', paddingBottom:1 }}>In</span>
                          </Tooltip>
                        </th>
                        <th className="tbl-head">
                          <Tooltip tip="Check-Out Time" sub="Last punch of the day" pos="bottom">
                            <span style={{ cursor:'default', borderBottom:'1px dashed var(--border)', paddingBottom:1 }}>Out</span>
                          </Tooltip>
                        </th>
                        <th className="tbl-head">
                          <Tooltip tip="Hours Worked" sub="Duration from first IN to last OUT" pos="bottom">
                            <span style={{ cursor:'default', borderBottom:'1px dashed var(--border)', paddingBottom:1 }}>Hrs</span>
                          </Tooltip>
                        </th>
                        <th className="tbl-head">
                          <Tooltip tip="Late Minutes" sub="Minutes arrived after shift start + grace" pos="bottom">
                            <span style={{ cursor:'default', color:'#fb923c', borderBottom:'1px dashed rgba(251,146,60,.4)', paddingBottom:1 }}>Late</span>
                          </Tooltip>
                        </th>
                        <th className="tbl-head">
                          <Tooltip tip="Overtime" sub="Extra minutes beyond shift duration + OT threshold" pos="bottom">
                            <span style={{ cursor:'default', color:'#c084fc', borderBottom:'1px dashed rgba(192,132,252,.4)', paddingBottom:1 }}>OT</span>
                          </Tooltip>
                        </th>
                        <th className="tbl-head">Status</th>
                        <th className="tbl-head"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading
                        ? Array.from({ length:6 }).map((_,i) => (
                            <tr key={i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                              {Array.from({ length:10 }).map((_,j) => (
                                <td key={j} className="tbl-cell">
                                  <div style={{ height:13, borderRadius:4, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
                                </td>
                              ))}
                            </tr>
                          ))
                        : todayPaged.map(rec => (
                            <TodayRow key={rec.employeeId} rec={rec}
                              onEdit={r => { setManualInitial(r); setManualOpen(true) }}/>
                          ))}
                    </tbody>
                  </table>
                </div>
                {!loading && todayRecs.length === 0 && (
                  <Empty icon={Users} title="No records" description="No employees match this filter, or no punches recorded today."/>
                )}
              </Card>
              <Pagination page={todayPage} pages={todayPages} onPage={setTodayPage} total={todayRecs.length} limit={attLimit}
                onLimit={n => { setAttLimit(n); setTodayPage(1) }}/>
            </div>

            {/* Live feed */}
            <Card style={{ position:'sticky', top:24 }}>
              <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', gap:9 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:'rgba(52,211,153,.12)', border:'1px solid rgba(52,211,153,.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Activity size={12} style={{ color:'#34d399' }}/>
                </div>
                <span style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Live Feed</span>
                {today?.recentPunches?.length > 0 && (
                  <span style={{ marginLeft:'auto', width:7, height:7, borderRadius:'50%', background:'#34d399', animation:'pulse 2s infinite' }}/>
                )}
              </div>
              <div style={{ padding:'10px' }}>
                <LiveFeed punches={today?.recentPunches || []}/>
              </div>
            </Card>
          </div>
        </>)}

        {/* ═══ RANGE ═══ */}
        {view === 'range' && (<>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
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
              <Button onClick={() => loadRange(orgId)} loading={loading}><Filter size={13}/> Generate Report</Button>
            </div>
            {range && (
              <SearchBox value={rangeQ} onChange={e => { setRangeQ(e.target.value); setRangePage(1) }} placeholder="Search employee…" style={{ minWidth:200, maxWidth:300, alignSelf:'flex-end', marginBottom:2 }}/>
            )}
          </div>

          {!range && !loading && (
            <Empty icon={TrendingUp} title="Select a date range" description="Choose start and end dates, then click Generate Report."/>
          )}

          {range && (<>
            <Card>
              <div style={{ padding:'13px 20px', borderBottom:'1px solid var(--border-soft)', display:'flex', gap:20, flexWrap:'wrap' }}>
                {[
                  { l:'Employees', v:rangeFiltered.length,  c:'var(--accent)' },
                  { l:'Days',      v:range.totalDays??0,     c:'var(--text-secondary)' },
                  { l:'Period',    v:`${range.startDate} → ${range.endDate}`, c:'var(--text-muted)' },
                ].map(m => (
                  <div key={m.l}>
                    <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{m.l}</p>
                    <p style={{ fontSize:'0.875rem', fontWeight:700, fontFamily:'monospace', color:m.c }}>{m.v}</p>
                  </div>
                ))}
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', minWidth:580 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      <th className="tbl-head">Employee</th>
                      {RANGE_COLS.map(c => (
                        <th key={c.key} className="tbl-head">
                          <Tooltip tip={c.label} sub={c.desc} pos="bottom">
                            <span style={{ color:c.color, cursor:'default',
                              borderBottom:`1px dashed color-mix(in srgb,${c.color} 40%,transparent)`,
                              paddingBottom:1 }}>
                              {c.abbr}
                            </span>
                          </Tooltip>
                        </th>
                      ))}
                      <th className="tbl-head">
                        <Tooltip tip="Hours Worked" sub="Total worked hours · Overtime shown in purple" pos="bottom">
                          <span style={{ cursor:'default', borderBottom:'1px dashed var(--border)', paddingBottom:1 }}>Hrs / OT</span>
                        </Tooltip>
                      </th>
                      <th className="tbl-head"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length:5 }).map((_,i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                            {Array.from({ length:9 }).map((_,j) => (
                              <td key={j} className="tbl-cell">
                                <div style={{ height:13, borderRadius:4, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
                              </td>
                            ))}
                          </tr>
                        ))
                      : rangePaged.map(rec => (
                          <RangeRow key={rec.employeeId} rec={rec}/>
                        ))}
                  </tbody>
                </table>
              </div>
              {!loading && !rangeFiltered.length && (
                <Empty icon={Calendar} title="No data" description="No records found for this period."/>
              )}
            </Card>
            <Pagination page={rangePage} pages={rangePages} onPage={setRangePage} total={rangeFiltered.length} limit={attLimit}
              onLimit={n => { setAttLimit(n); setRangePage(1) }}/>
          </>)}
        </>)}

        {/* ═══ LOGS ═══ */}
        {view === 'logs' && (<>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
            <Input label="From" type="date" value={startDate} onChange={e => setStart(e.target.value)} style={{ width:160 }}/>
            <Input label="To"   type="date" value={endDate}   onChange={e => setEnd(e.target.value)}   style={{ width:160 }}/>
            <div style={{ paddingBottom:2 }}>
              <Button onClick={() => loadLogs(orgId)} loading={loading}><Filter size={13}/> Load Logs</Button>
            </div>
          </div>

          <Card>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <BarChart3 size={14} style={{ color:'var(--accent)', flexShrink:0 }}/>
              <div style={{ flexShrink:0 }}>
                <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--text-muted)' }}>
                  {logs.length} punch records
                  {logTotal != null && logTotal > logs.length && (
                    <span style={{ color:'#fb923c' }}> · showing {logs.length} of {logTotal}</span>
                  )}
                </p>
              </div>
              <SearchBox
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Search employee name or code…"
                style={{ flex:1, minWidth:160, maxWidth:300 }}
              />
            </div>
            <LogsGrouped logs={logs} loading={loading} search={logSearch} total={logTotal}/>
          </Card>
        </>)}

        {/* ═══ PAYROLL ═══ */}
        {view === 'payroll' && <PayrollTab orgId={orgId}/>}

        {/* ═══ MANUAL ═══ */}
        {view === 'manual' && (<>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
              <Input label="From" type="date" value={startDate} onChange={e => setStart(e.target.value)} style={{ width:160 }}/>
              <Input label="To"   type="date" value={endDate}   onChange={e => setEnd(e.target.value)}   style={{ width:160 }}/>
              <div style={{ paddingBottom:2 }}>
                <Button variant="secondary" onClick={() => loadManuals(orgId)} loading={loading}><Filter size={13}/> Filter</Button>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
              <SearchBox value={manualQ} onChange={e => { setManualQ(e.target.value); setManualPage(1) }} placeholder="Search employee…" style={{ minWidth:200, maxWidth:300, marginBottom:2 }}/>
              <Button onClick={() => { setManualInitial(null); setManualOpen(true) }}>
                <Plus size={13}/> New Entry
              </Button>
            </div>
          </div>

          <Card>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', minWidth:620 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    <th className="tbl-head">Employee</th>
                    <th className="tbl-head">Date</th>
                    <th className="tbl-head">Status</th>
                    <th className="tbl-head">In</th>
                    <th className="tbl-head">Out</th>
                    <th className="tbl-head">Hours</th>
                    <th className="tbl-head">Note</th>
                    <th className="tbl-head"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length:5 }).map((_,i) => (
                        <tr key={i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                          {Array.from({ length:8 }).map((_,j) => (
                            <td key={j} className="tbl-cell">
                              <div style={{ height:13, borderRadius:4, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
                            </td>
                          ))}
                        </tr>
                      ))
                    : manualPaged.map((m, i) => (
                        <motion.tr key={m.manualId||i} initial={{ opacity:0 }} animate={{ opacity:1 }} className="tbl-row">
                          <td className="tbl-cell">
                            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                              <UserAvatar name={m.employee?.name || m.employeeId || '?'} size={28}/>
                              <div style={{ minWidth:0 }}>
                                <p style={{ fontSize:'0.875rem', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {m.employee?.name || m.employeeId}
                                </p>
                                <p style={{ fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{m.employee?.code||''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="tbl-cell">
                            <p style={{ fontSize:'0.875rem', fontFamily:'monospace', color:'var(--text-primary)' }}>{m.date}</p>
                          </td>
                          <td className="tbl-cell"><StatusBadge status={m.status}/></td>
                          <td className="tbl-cell">
                            <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{m.inTime||'—'}</p>
                          </td>
                          <td className="tbl-cell">
                            <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{m.outTime||'—'}</p>
                          </td>
                          <td className="tbl-cell">
                            {m.workedMinutes > 0
                              ? <p style={{ fontSize:'0.8rem', fontFamily:'monospace', color:'var(--accent)', fontWeight:600 }}>{fmtMins(m.workedMinutes)}</p>
                              : <p style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>—</p>}
                          </td>
                          <td className="tbl-cell">
                            {m.reason
                              ? <p title={m.reason} style={{ fontSize:'0.8rem', color:'var(--text-muted)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {m.reason}
                                </p>
                              : <span style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>—</span>}
                          </td>
                          <td className="tbl-cell">
                            <div style={{ display:'flex', gap:5 }}>
                              {[
                                { icon:Edit3,  col:'var(--accent)',  fn:() => { setManualInitial(m); setManualOpen(true) } },
                                { icon:Trash2, col:'#f87171', danger:true, fn:() => setDelTarget(m) },
                              ].map((btn, bi) => {
                                const BtnIcon = btn.icon
                                return (
                                  <button key={bi} onClick={btn.fn}
                                    style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg-surface2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', transition:'all .15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor=btn.col; e.currentTarget.style.color=btn.col; if(btn.danger) e.currentTarget.style.background='rgba(248,113,113,.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='var(--bg-surface2)' }}>
                                    <BtnIcon size={12}/>
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!loading && manualFiltered.length === 0 && (
              <Empty icon={Edit3} title="No manual entries" description="Click New Entry to manually override attendance for any employee and date."/>
            )}
          </Card>
          <Pagination page={manualPage} pages={manualPages} onPage={setManualPage} total={manualFiltered.length} limit={attLimit}
            onLimit={n => { setAttLimit(n); setManualPage(1) }}/>
        </>)}
      </>)}

      {/* Modals */}
      <ManualModal
        open={manualOpen} onClose={() => setManualOpen(false)}
        initial={manualInitial} orgId={orgId} employees={employees}
        onSaved={() => { loadToday(orgId); if (view==='manual') loadManuals(orgId) }}/>

      <ConfirmModal
        open={!!delTarget} onClose={() => setDelTarget(null)}
        onConfirm={deleteManual} loading={delBusy} danger
        title="Delete Manual Entry"
        message={`Remove manual attendance for ${delTarget?.employee?.name||delTarget?.employeeId} on ${delTarget?.date}?`}/>

      <style>{`
        @keyframes spin           { to { transform:rotate(360deg) } }
        @keyframes pulse          { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes shimmer-pulse  { 0%,100%{opacity:.4} 50%{opacity:.9} }
      `}</style>
    </UserPage>
  )
}
