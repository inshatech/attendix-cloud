import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Plus, Edit3, Trash2, Users, RefreshCw, Star, CheckCircle2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { Empty } from '../components/ui/Empty'
import { useAuth } from '../store/auth'
import { useOrgContext } from '../store/context'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import { UserPage, UserPageHeader, UserStatCard, UserCard, UserActionBtn } from '../components/ui/UserUI'
import api from '../lib/api'

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const PUNCH_MODES = [
  { value:'2-punch',    label:'2-Punch (Recommended)', desc:'First punch = In, Last punch = Out — works with any device' },
  { value:'4-punch',    label:'4-Punch (Break tracking)', desc:'P1=In P2=BreakOut P3=BreakIn P4=Out — net time excludes break. Falls back to 2-punch if <4 punches' },
  { value:'type-based', label:'Type-Based (Device punch type)', desc:'Trusts device punch-type field (In/Out). Only use if device is correctly configured' },
]

const EMPTY = {
  name:'', code:'', color:'#58a6ff', description:'', isActive:true, isDefault:false, isNightShift:false,
  defaultInTime:'09:00', defaultOutTime:'18:00',
  weeklyOffDays:[0],
  halfDayWeekDays:[],   // [{ day, inTime, outTime }]
  breaks:[{ label:'Lunch Break', startTime:'13:00', endTime:'14:00', isPaid:false }],
  punchMode:'2-punch',
  attendanceRules:{
    graceLateMinutes:5, graceEarlyMinutes:5,
    halfDayAfterMinutes:120,
    minMinutesForPresent:240, minMinutesForFullDay:420,
    autoDeductBreak:true, countHalfDays:true,
    monthlyLateAllowance:0,
  },
  overtimeRules:{ enabled:false, afterMinutes:0, maxMinutesPerDay:240, roundToMinutes:30 },
}

function CB({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer" style={{ userSelect:'none' }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={onChange}
        style={{ width:16, height:16, accentColor:'var(--accent)', cursor:'pointer', flexShrink:0 }}
      />
      <span style={{ fontSize:'0.875rem', color:'var(--text-secondary)' }}>{label}</span>
    </label>
  )
}

function TimeInput({ label, value, onChange }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type="time" value={value||''} onChange={e=>onChange(e.target.value)}
        className="field-input font-mono"/>
    </div>
  )
}

// ── Shift card ─────────────────────────────────────────────────────────────────
function ShiftCard({ shift, onEdit, onDelete }) {
  const mins = shift.durationMinutes || 0
  const h = Math.floor(mins/60), m = mins%60
  const breakMins = (shift.breaks||[]).filter(b=>!b.isPaid).reduce((s,b)=>{
    const [bsh,bsm]=b.startTime?.split(':').map(Number)||[0,0]
    const [beh,bem]=b.endTime?.split(':').map(Number)||[0,0]
    return s+(beh*60+bem)-(bsh*60+bsm)
  },0)

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      style={{ background:'var(--bg-surface)', borderRadius:16, padding:'1.25rem', border:'1px solid var(--border)', boxShadow:'0 4px 20px rgba(0,0,0,.25)', display:'flex', flexDirection:'column', gap:16 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ background: shift.color||'#58a6ff' }}/>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h3 style={{ fontWeight:700, color:"var(--text-primary)" }}>{shift.name}</h3>
              {shift.code && <span style={{ fontSize:'0.75rem', fontFamily:'monospace', background:'var(--bg-surface2)', color:'#8080a8', padding:'2px 7px', borderRadius:6 }}>{shift.code}</span>}
              {shift.isDefault   && <Badge variant="lime"><Star size={9}/> Default</Badge>}
              {!shift.isActive   && <Badge variant="gray">Inactive</Badge>}
              {shift.isNightShift&& <Badge variant="blue">Night</Badge>}
            </div>
            {shift.description && <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shift.description}</p>}
          </div>
        </div>
        <div style={{ display:'flex', gap:5, flexShrink:0 }}>
          <UserActionBtn label="Edit"   icon={Edit3}  onClick={() => onEdit(shift)}   hoverColor="#facc15"/>
          <UserActionBtn label="Delete" icon={Trash2} onClick={() => onDelete(shift)} danger/>
        </div>
      </div>

      {/* Times */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label:'Check In',  value: shift.defaultInTime  || '—' },
          { label:'Check Out', value: shift.defaultOutTime || '—' },
          { label:'Work Hours',value: `${h}h${m>0?` ${m}m`:''}`, accent:true },
        ].map(x=>(
          <div key={x.label} className="card-sm p-2.5 text-center">
            <p style={{ fontSize:"1rem", fontWeight:700, fontFamily:"monospace", color:x.accent?"var(--accent)":"var(--text-primary)" }}>{x.value}</p>
            <p style={{ fontSize:"0.625rem", color:"var(--text-muted)", marginTop:2 }}>{x.label}</p>
          </div>
        ))}
      </div>

      {/* Breaks */}
      {shift.breaks?.length > 0 && (
        <div>
          <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Breaks</p>
          <div className="">
            {shift.breaks.map((b,i)=>(
              <div key={i} className="flex items-center justify-between text-xs">
                <span style={{ color:"var(--text-muted)" }}>{b.label}</span>
                <span style={{ fontFamily:"monospace", color:"var(--text-secondary)" }}>
                  {b.startTime} – {b.endTime}
                  {b.isPaid ? <span style={{ color:'#34d399', marginLeft:4 }}>(Paid)</span> : ''}
                </span>
              </div>
            ))}
            {breakMins > 0 && <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{breakMins} min unpaid break deducted</p>}
          </div>
        </div>
      )}

      {/* Weekly schedule */}
      <div>
        <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Schedule</p>
        <div className="flex gap-1 mb-2">
          {DAYS.map((d,i)=>{
            const isOff  = (shift.weeklyOffDays||[]).includes(i)
            const hdEntry = (shift.halfDayWeekDays||[]).find(h=>h.day===i)
            return (
              <div key={i} title={isOff?'Weekly off':hdEntry?`Half day ${hdEntry.inTime||''}–${hdEntry.outTime||''}`:'Work day'}
                className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold border',
                  isOff    ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                  hdEntry  ? 'border-amber-500/20' : 'bg-accent/10 text-accent border-accent/20')}
                style={hdEntry?{background:'rgba(245,158,11,0.1)',color:'#f59e0b'}:{}}>
                {d}
              </div>
            )
          })}
        </div>
        {(shift.halfDayWeekDays||[]).length > 0 && (
          <div className="flex flex-col gap-0.5">
            {shift.halfDayWeekDays.map((hd,i)=>(
              <span key={i} style={{fontSize:'0.75rem',fontFamily:'monospace',color:'#f59e0b'}}>
                {DAYS[hd.day]}: {hd.inTime||'—'} → {hd.outTime||'—'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rules summary */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
        <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace' }}>Late grace: {shift.attendanceRules?.graceLateMinutes||0} min</span>
        <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace' }}>Half-day after: {shift.attendanceRules?.halfDayAfterMinutes||0} min</span>
        <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace' }}>Min for present: {shift.attendanceRules?.minMinutesForPresent||0} min</span>
        <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace' }}>OT: {shift.overtimeRules?.enabled?'Enabled':'Disabled'}</span>
        {(shift.attendanceRules?.monthlyLateAllowance||0) > 0 && (
          <span style={{ fontSize:'0.8125rem', color:'#f59e0b', fontFamily:'monospace', gridColumn:'1/-1' }}>
            Late allow: {shift.attendanceRules.monthlyLateAllowance}/month
          </span>
        )}
        <span style={{ fontSize:'0.8125rem', fontFamily:'monospace', gridColumn:'1/-1',
          color: shift.punchMode==='4-punch' ? '#a78bfa' : shift.punchMode==='type-based' ? '#fb923c' : 'var(--text-dim)' }}>
          Punch: {PUNCH_MODES.find(m=>m.value===(shift.punchMode||'2-punch'))?.label || '2-Punch'}
        </span>
      </div>

      {shift.employeeCount != null && (
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.875rem', color:'var(--text-muted)' }}>
          <Users size={13}/>
          {shift.employeeCount} employee{shift.employeeCount!==1?'s':''} assigned
        </div>
      )}
    </motion.div>
  )
}

// ── Shift form modal ────────────────────────────────────────────────────────────
function ShiftModal({ open, onClose, initial, orgId, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [tab,  setTab]  = useState('timing')
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setTab('timing')
    setForm(initial ? {
      ...EMPTY, ...initial,
      weeklyOffDays:   initial.weeklyOffDays   ?? EMPTY.weeklyOffDays,
      halfDayWeekDays: initial.halfDayWeekDays ?? EMPTY.halfDayWeekDays,
      punchMode:       initial.punchMode       ?? EMPTY.punchMode,
      attendanceRules: { ...EMPTY.attendanceRules, ...(initial.attendanceRules||{}) },
      overtimeRules:   { ...EMPTY.overtimeRules,   ...(initial.overtimeRules||{}) },
    } : EMPTY)
  }, [open, initial])

  const sf  = (k,v) => setForm(f=>({...f,[k]:v}))
  const sar = (k,v) => setForm(f=>({...f, attendanceRules:{...f.attendanceRules,[k]:v}}))
  const sor = (k,v) => setForm(f=>({...f, overtimeRules:{...f.overtimeRules,[k]:v}}))
  const toggleOff = i => {
    const c = form.weeklyOffDays || []
    // If toggling ON as off-day, remove from halfDayWeekDays if present
    if (!c.includes(i)) sf('halfDayWeekDays', (form.halfDayWeekDays||[]).filter(h=>h.day!==i))
    sf('weeklyOffDays', c.includes(i) ? c.filter(x=>x!==i) : [...c,i])
  }
  const addHalfDay = () => {
    const used = [...(form.weeklyOffDays||[]), ...(form.halfDayWeekDays||[]).map(h=>h.day)]
    const next = [1,2,3,4,5,6,0].find(d=>!used.includes(d)) ?? 1
    sf('halfDayWeekDays', [...(form.halfDayWeekDays||[]), { day:next, inTime:form.defaultInTime||'09:00', outTime:'13:00' }])
  }
  const updateHalfDay = (i,k,v) => {
    const h=[...(form.halfDayWeekDays||[])]; h[i]={...h[i],[k]:v}; sf('halfDayWeekDays',h)
  }
  const setHalfDayDay = (i,newDay) => {
    // Remove from off days if toggled off there
    if ((form.weeklyOffDays||[]).includes(newDay)) sf('weeklyOffDays',(form.weeklyOffDays||[]).filter(d=>d!==newDay))
    // Prevent duplicate half-day entries
    sf('halfDayWeekDays',(form.halfDayWeekDays||[]).map((h,idx)=>idx===i?{...h,day:newDay}:h).filter((h,idx,arr)=>arr.findIndex(x=>x.day===h.day)===idx))
  }
  const removeHalfDay = i => sf('halfDayWeekDays',(form.halfDayWeekDays||[]).filter((_,idx)=>idx!==i))
  const updateBreak = (i,k,v) => { const b=[...(form.breaks||[])]; b[i]={...b[i],[k]:v}; sf('breaks',b) }
  const addBreak    = () => sf('breaks',[...(form.breaks||[]),{label:'Tea Break',startTime:'10:30',endTime:'10:45',isPaid:false}])
  const removeBreak = i  => sf('breaks',(form.breaks||[]).filter((_,idx)=>idx!==i))

  async function save() {
    if (!form.name.trim()) return toast('Shift name is required', 'error')
    setBusy(true)
    try {
      if (initial?.shiftId)
        await api.patch(`/organizations/${orgId}/shifts/${initial.shiftId}`, form)
      else
        await api.post(`/organizations/${orgId}/shifts`, form)
      toast(initial?'Shift updated':'Shift created','success')
      onSaved(); onClose()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  const TABS = ['timing','breaks','rules','overtime']

  return (
    <Modal open={open} onClose={onClose} title={initial?'Edit Shift':'New Shift'} description="Define schedule, breaks and attendance rules" size="xl">
      <div style={{ display:"flex", gap:4, borderBottom:"1px solid var(--border)", marginTop:-8, overflowX:"auto", flexShrink:0 }}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={cn('px-4 py-2 text-xs font-mono font-semibold capitalize whitespace-nowrap border-b-2 transition-colors',
              tab===t ? 'text-accent border-accent' : 'border-transparent')}>
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto max-h-[60vh] pr-1">

        {/* TIMING */}
        {tab === 'timing' && <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Shift Name *" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="General Shift"/>
            <Input label="Short Code"   value={form.code} onChange={e=>sf('code',e.target.value.toUpperCase())} placeholder="GEN"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Colour</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color||'#58a6ff'} onChange={e=>sf('color',e.target.value)}
                  style={{ width:40, height:40, borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", cursor:"pointer", padding:4 }}/>
                <span style={{ fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-muted)" }}>{form.color}</span>
              </div>
            </div>
            <Input label="Description" value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="Optional note"/>
          </div>
          <div className="flex gap-6 flex-wrap">
            <CB checked={form.isDefault}    onChange={()=>sf('isDefault',   !form.isDefault)}    label="Set as default"/>
            <CB checked={form.isNightShift} onChange={()=>sf('isNightShift',!form.isNightShift)} label="Night shift (crosses midnight)"/>
            <CB checked={form.isActive}     onChange={()=>sf('isActive',    !form.isActive)}     label="Active"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="Check In Time *"  value={form.defaultInTime}  onChange={v=>sf('defaultInTime',v)}/>
            <TimeInput label="Check Out Time *" value={form.defaultOutTime} onChange={v=>sf('defaultOutTime',v)}/>
          </div>
          <div>
            <label className="field-label">Weekly Off Days</label>
            <div className="flex gap-2">
              {DAYS.map((d,i)=>(
                <button key={i} type="button" onClick={()=>toggleOff(i)}
                  title={(form.weeklyOffDays||[]).includes(i)?'Off day':'Work day'}
                  className={cn('w-10 h-10 rounded-lg text-xs font-mono font-bold transition-all border',
                    (form.weeklyOffDays||[]).includes(i)
                      ? 'bg-red-500/10 text-red-400 border-red-500/25'
                      : 'bg-accent/10 text-accent border-accent/20')}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Punch mode */}
          <div>
            <label className="field-label">Punch Mode</label>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {PUNCH_MODES.map(m => (
                <label key={m.value} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px', borderRadius:10,
                  border:`1px solid ${form.punchMode===m.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: form.punchMode===m.value ? 'color-mix(in srgb,var(--accent) 8%,transparent)' : 'var(--bg-surface2)',
                  cursor:'pointer', transition:'all .12s' }}>
                  <input type="radio" name="punchMode" value={m.value} checked={form.punchMode===m.value}
                    onChange={()=>sf('punchMode',m.value)}
                    style={{ marginTop:2, accentColor:'var(--accent)', flexShrink:0 }}/>
                  <div>
                    <p style={{ fontSize:'0.8125rem', fontWeight:600, color: form.punchMode===m.value ? 'var(--accent)' : 'var(--text-primary)' }}>{m.label}</p>
                    <p style={{ fontSize:'0.7rem', color:'var(--text-dim)', marginTop:1 }}>{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Half-day weekdays */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="field-label" style={{marginBottom:0}}>Half-Day Weekdays</label>
              <Button size="sm" variant="secondary" type="button" onClick={addHalfDay}><Plus size={12}/> Add</Button>
            </div>
            {(form.halfDayWeekDays||[]).length === 0 && (
              <p style={{fontSize:'0.75rem',color:'var(--text-dim)',fontFamily:'monospace'}}>No half-day weekdays defined</p>
            )}
            {(form.halfDayWeekDays||[]).map((hd,i)=>(
              <div key={i} className="card-sm p-2.5 flex items-center gap-2">
                <select value={hd.day} onChange={e=>setHalfDayDay(i,+e.target.value)}
                  className="field-input font-mono" style={{width:90,flexShrink:0}}>
                  {DAYS.map((d,di)=>(
                    <option key={di} value={di}
                      disabled={(form.weeklyOffDays||[]).includes(di)||(form.halfDayWeekDays||[]).some((h,hi)=>hi!==i&&h.day===di)}>
                      {d}
                    </option>
                  ))}
                </select>
                <TimeInput label="" value={hd.inTime} onChange={v=>updateHalfDay(i,'inTime',v)}/>
                <span style={{color:'var(--text-dim)',fontSize:'0.75rem',flexShrink:0,paddingTop:2}}>→</span>
                <TimeInput label="" value={hd.outTime} onChange={v=>updateHalfDay(i,'outTime',v)}/>
                <button onClick={()=>removeHalfDay(i)} className="btn-icon hover:text-red-400 mt-0.5 flex-shrink-0"><Trash2 size={13}/></button>
              </div>
            ))}
            {(form.halfDayWeekDays||[]).length > 0 && (
              <p style={{fontSize:'0.7rem',color:'var(--text-dim)',marginTop:4}}>Late arrivals for these days are measured against the half-day start time</p>
            )}
          </div>
        </>}

        {/* BREAKS */}
        {tab === 'breaks' && <>
          <div className="flex items-center justify-between">
            <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", fontFamily:"monospace" }}>Define break periods within the shift</p>
            <Button size="sm" variant="secondary" onClick={addBreak}><Plus size={12}/> Add Break</Button>
          </div>
          {(form.breaks||[]).length === 0 && (
            <p style={{ textAlign:"center", fontSize:"0.875rem", color:"var(--text-dim)", padding:"24px 0" }}>No breaks defined</p>
          )}
          {(form.breaks||[]).map((b,i)=>(
            <div key={i} className="card-sm p-3 ">
              <div className="grid grid-cols-4 gap-2 items-end">
                <Input label="Label"  value={b.label}     onChange={e=>updateBreak(i,'label',e.target.value)}     placeholder="Lunch"/>
                <TimeInput label="Start" value={b.startTime} onChange={v=>updateBreak(i,'startTime',v)}/>
                <TimeInput label="End"   value={b.endTime}   onChange={v=>updateBreak(i,'endTime',v)}/>
                <div className="flex items-end gap-2 pb-0.5">
                  <CB checked={b.isPaid} onChange={()=>updateBreak(i,'isPaid',!b.isPaid)} label="Paid"/>
                  <button onClick={()=>removeBreak(i)} className="btn-icon hover:text-red-400"><Trash2 size={13}/></button>
                </div>
              </div>
            </div>
          ))}
        </>}

        {/* RULES */}
        {tab === 'rules' && <>
          <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", fontFamily:"monospace" }}>Attendance calculation rules for this shift</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Late Grace (min)"        type="number" value={form.attendanceRules.graceLateMinutes}     onChange={e=>sar('graceLateMinutes',    +e.target.value)}/>
            <Input label="Early Leave Grace (min)" type="number" value={form.attendanceRules.graceEarlyMinutes}    onChange={e=>sar('graceEarlyMinutes',   +e.target.value)}/>
            <Input label="Half-Day After (min)"    type="number" value={form.attendanceRules.halfDayAfterMinutes}  onChange={e=>sar('halfDayAfterMinutes', +e.target.value)}/>
            <Input label="Min for Present (min)"   type="number" value={form.attendanceRules.minMinutesForPresent} onChange={e=>sar('minMinutesForPresent',+e.target.value)}/>
            <Input label="Min for Full Day (min)"  type="number" value={form.attendanceRules.minMinutesForFullDay} onChange={e=>sar('minMinutesForFullDay',+e.target.value)}/>
            <div>
              <Input label="Monthly Late Allowance" type="number" min="0"
                value={form.attendanceRules.monthlyLateAllowance ?? 0}
                onChange={e=>sar('monthlyLateAllowance',+e.target.value)}/>
              <p style={{fontSize:'0.7rem',color:'var(--text-dim)',marginTop:3}}>
                {(form.attendanceRules.monthlyLateAllowance||0)===0
                  ? 'No pardons — every late arrival is marked late'
                  : `First ${form.attendanceRules.monthlyLateAllowance} late arrival${form.attendanceRules.monthlyLateAllowance===1?'':'s'} per month counted as Present`}
              </p>
            </div>
          </div>
          <div className="flex gap-6 flex-wrap pt-1">
            <CB checked={form.attendanceRules.autoDeductBreak} onChange={()=>sar('autoDeductBreak',!form.attendanceRules.autoDeductBreak)} label="Auto-deduct unpaid break time"/>
            <CB checked={form.attendanceRules.countHalfDays}   onChange={()=>sar('countHalfDays',  !form.attendanceRules.countHalfDays)}   label="Count half-days for payroll"/>
          </div>
        </>}

        {/* OVERTIME */}
        {tab === 'overtime' && <>
          <CB checked={form.overtimeRules.enabled} onChange={()=>sor('enabled',!form.overtimeRules.enabled)} label="Enable overtime calculation"/>
          {form.overtimeRules.enabled && (
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Input label="OT After Shift End (min)" type="number" value={form.overtimeRules.afterMinutes}     onChange={e=>sor('afterMinutes',    +e.target.value)}/>
              <Input label="Max OT Per Day (min)"     type="number" value={form.overtimeRules.maxMinutesPerDay} onChange={e=>sor('maxMinutesPerDay',+e.target.value)}/>
              <Input label="Round OT To (min)"        type="number" value={form.overtimeRules.roundToMinutes}   onChange={e=>sor('roundToMinutes',  +e.target.value)}/>
            </div>
          )}
        </>}
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:12, borderTop:"1px solid var(--border)", flexShrink:0 }}>
        <div className="flex gap-1.5">
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn('w-2 h-2 rounded-full transition-all', tab===t?'bg-accent scale-125':'bg-edge-soft hover:bg-edge-bright')}/>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{initial?'Update Shift':'Create Shift'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Shifts() {
  const { ready } = useAuth()
  const { toast } = useToast()

  const { orgId } = useOrgContext()
  const [shifts, setShifts] = useState([])
  const [loading,setLoad]   = useState(false)
  const [modal,  setModal]  = useState(false)
  const [editing,setEdit]   = useState(null)
  const [delTarget,setDel]  = useState(null)
  const [delBusy,setDelBusy]= useState(false)

  async function load(oid = orgId) {
    if (!oid) return
    setLoad(true)
    try { const r = await api.get(`/organizations/${oid}/shifts`); setShifts(r.data||[]) }
    catch(e) { toast(e.message,'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready && orgId) load(orgId) }, [ready, orgId])

  async function deleteShift() {
    if (!delTarget) return
    setDelBusy(true)
    try { await api.delete(`/organizations/${orgId}/shifts/${delTarget.shiftId}`); toast('Shift deleted','success'); setDel(null); load() }
    catch(e) { toast(e.message,'error') }
    finally { setDelBusy(false) }
  }

  return (
    <UserPage>
      <UserPageHeader title="Shift Management" icon={Clock} iconColor="#58a6ff" subtitle="Manage schedules, breaks and attendance rules">
        <Button variant="secondary" size="sm" onClick={()=>load()}><RefreshCw size={13}/></Button>
        <Button onClick={()=>{ setEdit(null); setModal(true) }}><Plus size={15}/> New Shift</Button>
      </UserPageHeader>
      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <UserStatCard label="Total Shifts"   value={shifts.length}                          icon={Clock}         accent="#58a6ff" index={0}/>
        <UserStatCard label="Active"         value={shifts.filter(s=>s.isActive).length}     icon={CheckCircle2}  accent="#34d399" index={1}/>
        <UserStatCard label="Night Shifts"   value={shifts.filter(s=>s.isNightShift).length} icon={Star}          accent="#c084fc" index={2}/>
        <UserStatCard label="Default Shift"  value={shifts.filter(s=>s.isDefault).length}    icon={Star}          accent="#facc15" index={3}/>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i=><div key={i} className="h-72 shimmer rounded-xl"/>)}
        </div>
      ) : shifts.length === 0 ? (
        <div className="card">
          <Empty icon={Clock} title="No shifts yet"
            description="Create your first shift to assign to employees and process attendance."
            action={<Button onClick={()=>{ setEdit(null); setModal(true) }}><Plus size={15}/> Create Shift</Button>}/>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map(s=>(
            <ShiftCard key={s.shiftId} shift={s}
              onEdit={shift=>{ setEdit(shift); setModal(true) }}
              onDelete={shift=>setDel(shift)}/>
          ))}
        </div>
      )}

      <ShiftModal open={modal} onClose={()=>setModal(false)} initial={editing} orgId={orgId} onSaved={()=>load()}/>
      <ConfirmModal open={!!delTarget} onClose={()=>setDel(null)} onConfirm={deleteShift} loading={delBusy} danger
        title="Delete Shift"
        message={`Delete "${delTarget?.name}"? Employees assigned to it will lose their shift.`}/>
    </UserPage>
  )
}
