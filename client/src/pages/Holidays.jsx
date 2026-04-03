import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays, Plus, Edit3, Trash2, RefreshCw,
  Globe, Info, ChevronLeft, ChevronRight, Trash
} from 'lucide-react'
import { Button }       from '../components/ui/Button'
import { Input }        from '../components/ui/Input'
import { Modal }        from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { Empty }        from '../components/ui/Empty'
import { useAuth }      from '../store/auth'
import { useOrgContext } from '../store/context'
import { useToast }     from '../components/ui/Toast'
import { UserPage, UserPageHeader } from '../components/ui/UserUI'
import api from '../lib/api'

// ── Type config — matches backend enum ───────────────────────────────────────
const TYPE_CFG = {
  national: { label:'National',  accent:'#34d399', bg:'rgba(52,211,153,.1)',  border:'rgba(52,211,153,.25)'  },
  regional: { label:'Regional',  accent:'#fb923c', bg:'rgba(251,146,60,.1)',  border:'rgba(251,146,60,.25)'  },
  custom:   { label:'Custom',    accent:'#60a5fa', bg:'rgba(96,165,250,.1)',  border:'rgba(96,165,250,.25)'  },
}

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW          = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function TypeBadge({ type }) {
  const c = TYPE_CFG[type] || TYPE_CFG.custom
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:99,
      fontSize:'0.7rem', fontWeight:700, fontFamily:'monospace', whiteSpace:'nowrap',
      background:c.bg, color:c.accent, border:`1px solid ${c.border}`,
    }}>{c.label}</span>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function HolidayModal({ open, onClose, initial, orgId, onSaved }) {
  const [form, setForm] = useState({ date:'', name:'', description:'', type:'custom', optional:false })
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setForm({
      date:        initial?.date        || todayStr(),
      name:        initial?.name        || '',
      description: initial?.description || '',
      type:        initial?.type        || 'custom',
      optional:    initial?.optional    || false,
    })
  }, [open, initial])

  const sf = k => e => setForm(f => ({...f, [k]: e.target.value}))

  async function save() {
    if (!form.date || !form.name.trim()) return toast('Date and name are required', 'error')
    setBusy(true)
    try {
      if (initial?.holidayId) {
        await api.patch(`/organizations/${orgId}/holidays/${initial.holidayId}`, form)
        toast('Holiday updated', 'success')
      } else {
        await api.post(`/organizations/${orgId}/holidays`, form)
        toast('Holiday added', 'success')
      }
      onSaved(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={initial?.holidayId ? 'Edit Holiday' : 'Add Holiday'}
      size="sm">
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <Input label="Date *" type="date" value={form.date} onChange={sf('date')}/>
        <Input label="Holiday Name *" value={form.name} onChange={sf('name')} placeholder="Republic Day, Diwali…"/>
        <div>
          <label className="field-label">Type</label>
          <select className="field-input" value={form.type} onChange={sf('type')}>
            <option value="national">National (Gazetted)</option>
            <option value="regional">Regional (Widely observed)</option>
            <option value="custom">Custom / Organisation</option>
          </select>
        </div>
        <Input label="Description (optional)" value={form.description} onChange={sf('description')} placeholder="Optional note"/>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'0.875rem', color:'var(--text-muted)' }}>
          <input type="checkbox" checked={form.optional}
            onChange={e => setForm(f => ({...f, optional:e.target.checked}))}
            style={{ width:15, height:15, accentColor:'var(--accent)', cursor:'pointer' }}/>
          Optional holiday (employees may choose to avail)
        </label>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:12, borderTop:'1px solid var(--border)', marginTop:4 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>{initial?.holidayId ? 'Update' : 'Add Holiday'}</Button>
      </div>
    </Modal>
  )
}

// ── Google Calendar sync modal ────────────────────────────────────────────────
const INDIA_HOLIDAYS_PREVIEW = [
  'Republic Day', 'Holi', 'Good Friday', 'Ambedkar Jayanti',
  'Labour Day', 'Independence Day', 'Janmashtami', 'Gandhi Jayanti',
  'Dussehra', 'Diwali', 'Guru Nanak Jayanti', 'Christmas',
  'Eid ul-Fitr', 'Eid ul-Adha', 'Muharram', 'Milad-un-Nabi',
]

function SyncModal({ open, onClose, orgId, year, onSaved }) {
  const [syncing,    setSyncing]  = useState(false)
  const [result,     setResult]   = useState(null)   // null | { imported, skipped, message } | { error, setupRequired }
  const [clearFirst, setClear]    = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) { setSyncing(false); setResult(null); setClear(false) }
  }, [open])

  async function doSync() {
    setSyncing(true); setResult(null)
    try {
      if (clearFirst) {
        await api.delete(`/organizations/${orgId}/holidays?year=${year}`).catch(() => {})
      }
      const r = await api.post(`/organizations/${orgId}/holidays/sync`, { year })
      setResult(r)
      toast(`Imported ${r.imported} holidays for ${year}`, 'success')
      onSaved()
    } catch(e) {
      const setupRequired = e.setupRequired || false
      setResult({ error: e.message, setupRequired })
    } finally {
      setSyncing(false)
    }
  }

  const done = !!result

  return (
    <Modal open={open} onClose={onClose}
      title="Import Indian Holidays"
      description={`Auto-import public holidays for ${year} from Google Calendar`}
      size="sm">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* Year pill + source label */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, background:'rgba(66,133,244,.07)', border:'1px solid rgba(66,133,244,.2)' }}>
            <Globe size={14} style={{ color:'#4285f4' }}/>
            <span style={{ fontSize:'0.8rem', color:'#4285f4', fontWeight:600 }}>India — All National &amp; Major Festivals</span>
          </div>
          <div style={{ marginLeft:'auto', padding:'6px 12px', borderRadius:9, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
            <span style={{ fontSize:'1rem', fontWeight:800, fontFamily:'monospace', color:'var(--accent)' }}>{year}</span>
          </div>
        </div>

        {/* Preview chips — only show before sync */}
        {!done && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {INDIA_HOLIDAYS_PREVIEW.map(h => (
              <span key={h} style={{ fontSize:'0.7rem', padding:'3px 9px', borderRadius:99, background:'var(--bg-surface2)', border:'1px solid var(--border)', color:'var(--text-muted)', fontFamily:'monospace' }}>
                {h}
              </span>
            ))}
            <span style={{ fontSize:'0.7rem', padding:'3px 9px', borderRadius:99, background:'var(--bg-surface2)', border:'1px solid var(--border)', color:'var(--text-dim)', fontFamily:'monospace' }}>
              + more…
            </span>
          </div>
        )}

        {/* Clear first option — only before sync */}
        {!done && (
          <label style={{ display:'flex', alignItems:'flex-start', gap:9, cursor:'pointer', padding:'10px 12px', borderRadius:9, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
            <input type="checkbox" checked={clearFirst} onChange={e => setClear(e.target.checked)}
              style={{ width:15, height:15, accentColor:'var(--accent)', cursor:'pointer', marginTop:2, flexShrink:0 }}/>
            <div>
              <p style={{ fontSize:'0.875rem', color:'var(--text-primary)', fontWeight:500, lineHeight:1.3 }}>Replace existing holidays for {year}</p>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:2 }}>Clears all holidays for this year first, then imports fresh</p>
            </div>
          </label>
        )}

        {/* Result — success */}
        {result && !result.error && (
          <div style={{ padding:'14px 16px', borderRadius:10, background:'rgba(52,211,153,.06)', border:'1px solid rgba(52,211,153,.2)' }}>
            <p style={{ fontSize:'0.9rem', fontWeight:700, color:'#34d399', marginBottom:10 }}>✓ Holidays imported successfully</p>
            <div style={{ display:'flex', gap:20 }}>
              {[
                { l:'Imported', v:result.imported, c:'#34d399' },
                { l:'Already existed', v:result.skipped, c:'var(--text-muted)' },
              ].map(m => (
                <div key={m.l}>
                  <p style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{m.l}</p>
                  <p style={{ fontSize:'1.5rem', fontWeight:800, fontFamily:'monospace', color:m.c, lineHeight:1 }}>{m.v ?? 0}</p>
                </div>
              ))}
            </div>
            {result.warnings?.length > 0 && (
              <p style={{ fontSize:'0.75rem', color:'#fb923c', marginTop:8 }}>⚠ {result.warnings[0]}</p>
            )}
          </div>
        )}

        {/* Result — error */}
        {result?.error && (
          <div style={{ padding:'14px 16px', borderRadius:10, background:'rgba(248,113,113,.06)', border:'1px solid rgba(248,113,113,.2)' }}>
            <p style={{ fontSize:'0.875rem', fontWeight:700, color:'#f87171', marginBottom: result.setupRequired ? 8 : 0 }}>
              ✗ {result.error}
            </p>
            {result.setupRequired && (
              <p style={{ fontSize:'0.8rem', color:'#fb923c', lineHeight:1.5 }}>
                Go to <strong>Admin → Plugins → Google Calendar</strong> and enter your Google API key to enable holiday sync.
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:12, borderTop:'1px solid var(--border)', marginTop:4 }}>
        <Button variant="secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
        {!done && (
          <Button onClick={doSync} loading={syncing} style={{ background:'#4285f4', borderColor:'#4285f4' }}>
            <Globe size={13}/> Import Holidays
          </Button>
        )}
        {done && !result?.error && (
          <Button variant="secondary" onClick={() => setResult(null)}>
            <RefreshCw size={13}/> Sync Again
          </Button>
        )}
      </div>
    </Modal>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
const Card = ({ children, style:s }) => (
  <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow-card)', ...s }}>
    {children}
  </div>
)

// ── Shimmer ───────────────────────────────────────────────────────────────────
const Shim = ({ h=80 }) => (
  <div style={{ height:h, borderRadius:14, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
)

// ─────────────────────────────────────────────────────────────────────────────
export default function Holidays() {
  const { ready }  = useAuth()
  const { orgId }  = useOrgContext()
  const { toast }  = useToast()

  const [year,     setYear]    = useState(new Date().getFullYear())
  const [holidays, setHols]    = useState([])
  const [loading,  setLoad]    = useState(false)
  const [addModal, setAdd]     = useState(false)
  const [editing,  setEditing] = useState(null)
  const [syncMod,  setSyncMod] = useState(false)
  const [delTarget,setDel]     = useState(null)
  const [delBusy,  setDelBusy] = useState(false)
  const [clearMod, setClearMod]= useState(false)
  const [clearBusy,setClearBusy]=useState(false)

  async function load(oid = orgId, y = year) {
    if (!oid) return
    setLoad(true)
    try {
      const r = await api.get(`/organizations/${oid}/holidays?year=${y}`)
      setHols(r.data || [])
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready && orgId) load(orgId, year) }, [ready, orgId, year])

  async function deleteOne() {
    if (!delTarget) return
    setDelBusy(true)
    try {
      await api.delete(`/organizations/${orgId}/holidays/${delTarget.holidayId}`)
      toast('Holiday deleted', 'success')
      setDel(null); load()
    } catch(e) { toast(e.message, 'error') }
    finally { setDelBusy(false) }
  }

  async function clearYear() {
    setClearBusy(true)
    try {
      const r = await api.delete(`/organizations/${orgId}/holidays?year=${year}`)
      toast(`Cleared ${r.deleted} holidays for ${year}`, 'success')
      setClearMod(false); load()
    } catch(e) { toast(e.message, 'error') }
    finally { setClearBusy(false) }
  }

  // Group by month
  const byMonth = {}
  for (const h of holidays) {
    const m = parseInt(h.date.split('-')[1]) - 1
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(h)
  }

  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const currentMonthIdx  = now.getMonth()
  const isCurrentYear    = year === now.getFullYear()
  const currentMonthRef  = useRef(null)

  // Scroll current month into view when data loads or year changes
  useEffect(() => {
    if (!loading && isCurrentYear && currentMonthRef.current) {
      // Small delay so the DOM has settled before scrolling
      const t = setTimeout(() => {
        currentMonthRef.current?.scrollIntoView({ behavior:'smooth', block:'start' })
      }, 120)
      return () => clearTimeout(t)
    }
  }, [loading, isCurrentYear])
  const googleCount = holidays.filter(h => h.source === 'google').length
  const manualCount = holidays.filter(h => h.source !== 'google').length

  if (!orgId) return (
    <UserPage>
      <UserPageHeader title="Holidays" icon={CalendarDays} iconColor="#f472b6" subtitle="Synced from Google Calendar · auto-marked in attendance"/>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4rem 0', gap:14 }}>
        <div style={{ width:56, height:56, borderRadius:16, background:'var(--bg-surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <CalendarDays size={24} style={{ color:'var(--text-dim)' }}/>
        </div>
        <p style={{ fontWeight:700, color:'var(--text-primary)' }}>No organization selected</p>
        <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>Select an organization from the top bar to manage holidays.</p>
      </div>
    </UserPage>
  )

  return (
    <UserPage className="holidays-page-wrap">
      {/* Header */}
      <UserPageHeader
        title="Holidays"
        icon={CalendarDays}
        iconColor="#f472b6"
        subtitle={`${holidays.length} holiday${holidays.length !== 1 ? 's' : ''} · ${year} · auto-marked in attendance`}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {/* Year navigator */}
          <div style={{ display:'flex', alignItems:'center', gap:2, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'3px' }}>
            <button onClick={() => setYear(y => y - 1)}
              style={{ width:28, height:28, borderRadius:7, border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', transition:'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color='var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
              <ChevronLeft size={14}/>
            </button>
            <span style={{ fontSize:'0.875rem', fontFamily:'monospace', fontWeight:700, color:'var(--text-secondary)', width:42, textAlign:'center' }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)}
              style={{ width:28, height:28, borderRadius:7, border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', transition:'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color='var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
              <ChevronRight size={14}/>
            </button>
          </div>

          {/* Clear year */}
          {holidays.length > 0 && (
            <button onClick={() => setClearMod(true)}
              title={`Clear all holidays for ${year}`}
              style={{ width:34, height:34, borderRadius:9, border:'1px solid var(--border)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(248,113,113,.4)'; e.currentTarget.style.color='#f87171'; e.currentTarget.style.background='rgba(248,113,113,.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='var(--bg-surface)' }}>
              <Trash size={13}/>
            </button>
          )}

          <Button variant="secondary" size="sm" onClick={() => load()}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
          </Button>

          {/* Primary: Google Sync */}
          <Button onClick={() => setSyncMod(true)} style={{ background:'#4285f4', borderColor:'#4285f4' }}>
            <Globe size={13}/> Sync Google Calendar
          </Button>

          {/* Secondary: Manual add */}
          <Button variant="secondary" onClick={() => { setEditing(null); setAdd(true) }}>
            <Plus size={13}/> Add Manual
          </Button>
        </div>
      </UserPageHeader>

      {/* Source stats strip */}
      {holidays.length > 0 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {[
            { l:'Total',    v:holidays.length, c:'var(--accent)'     },
            { l:'Google',   v:googleCount,     c:'#4285f4'           },
            { l:'Manual',   v:manualCount,     c:'var(--text-muted)' },
          ].map(s => (
            <div key={s.l} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:9, background:'var(--bg-surface)', border:'1px solid var(--border)', boxShadow:'var(--shadow-card)' }}>
              <span style={{ fontSize:'1.25rem', fontWeight:800, fontFamily:'monospace', color:s.c, lineHeight:1 }}>{s.v}</span>
              <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* Month overview mini-grid */}
      {holidays.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(52px, 1fr))', gap:5 }}>
          {MONTHS_SHORT.map((m, i) => {
            const cnt        = byMonth[i]?.length || 0
            const hasToday   = byMonth[i]?.some(h => h.date === today)
            const isCurMonth = isCurrentYear && i === currentMonthIdx
            return (
              <div key={i} style={{
                padding:'8px 4px', borderRadius:9, textAlign:'center',
                background: isCurMonth ? 'rgba(244,114,182,.08)' : cnt > 0 ? 'var(--bg-surface)' : 'var(--bg-surface2)',
                border:`1px solid ${isCurMonth ? 'rgba(244,114,182,.4)' : cnt > 0 ? 'var(--accent-border)' : 'var(--border)'}`,
                opacity: cnt > 0 || isCurMonth ? 1 : 0.4,
                boxShadow: isCurMonth ? '0 0 0 1px rgba(244,114,182,.15)' : 'none',
                transition:'all .15s',
              }}>
                <p style={{ fontSize:'0.6rem', fontFamily:'monospace', fontWeight:700, color: isCurMonth ? '#f472b6' : cnt > 0 ? 'var(--accent)' : 'var(--text-dim)', letterSpacing:'0.04em' }}>{m}</p>
                <p style={{ fontSize:'1.125rem', fontWeight:800, color: isCurMonth ? '#f472b6' : 'var(--text-primary)', lineHeight:1, marginTop:3 }}>{cnt}</p>
                {hasToday && <div style={{ width:5, height:5, borderRadius:'50%', background:'#34d399', margin:'3px auto 0' }}/>}
                {isCurMonth && !hasToday && <div style={{ width:5, height:5, borderRadius:'50%', background:'rgba(244,114,182,.5)', margin:'3px auto 0' }}/>}
              </div>
            )
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <Shim h={90}/><Shim h={90}/><Shim h={70}/>
        </div>
      )}

      {/* Empty */}
      {!loading && holidays.length === 0 && (
        <Card>
          <Empty
            icon={CalendarDays}
            title={`No holidays for ${year}`}
            description="Sync from Google Calendar to auto-populate holidays, or add custom ones manually."
            action={
              <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:4 }}>
                <Button onClick={() => setSyncMod(true)} style={{ background:'#4285f4', borderColor:'#4285f4' }}>
                  <Globe size={13}/> Sync from Google Calendar
                </Button>
                <Button variant="secondary" onClick={() => { setEditing(null); setAdd(true) }}>
                  <Plus size={13}/> Add Manually
                </Button>
              </div>
            }/>
        </Card>
      )}

      {/* Holiday list by month */}
      {!loading && holidays.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Object.entries(byMonth)
            .sort(([a],[b]) => Number(a) - Number(b))
            .map(([monthIdx, monthHols]) => {
              const isCurMonth = isCurrentYear && Number(monthIdx) === currentMonthIdx
              return (
              <Card key={monthIdx} style={isCurMonth ? { border:'1px solid rgba(244,114,182,.35)', boxShadow:'0 0 0 2px rgba(244,114,182,.08)' } : {}}>
                <div ref={isCurMonth ? currentMonthRef : null} style={{
                  padding:'10px 18px', borderBottom:'1px solid var(--border-soft)',
                  background: isCurMonth ? 'rgba(244,114,182,.07)' : 'var(--bg-surface2)',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  scrollMarginTop:'72px',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <p style={{ fontSize:'0.8rem', fontFamily:'monospace', fontWeight:700, color: isCurMonth ? '#f472b6' : 'var(--accent)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      {MONTHS_FULL[monthIdx]} {year}
                    </p>
                    {isCurMonth && (
                      <span style={{ fontSize:'0.6rem', fontFamily:'monospace', fontWeight:700, padding:'2px 7px', borderRadius:99, background:'rgba(244,114,182,.12)', color:'#f472b6', border:'1px solid rgba(244,114,182,.3)' }}>
                        THIS MONTH
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-dim)' }}>
                    {monthHols.length} holiday{monthHols.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {monthHols
                  .sort((a,b) => a.date.localeCompare(b.date))
                  .map((h, i) => {
                    const d       = new Date(h.date + 'T12:00:00')
                    const dow     = DOW[d.getDay()]
                    const isPast  = h.date < today
                    const isToday = h.date === today

                    return (
                      <motion.div key={h.holidayId}
                        initial={{ opacity:0 }} animate={{ opacity:1 }}
                        style={{
                          display:'flex', alignItems:'center', gap:14, padding:'12px 18px',
                          borderBottom: i < monthHols.length - 1 ? '1px solid var(--border-soft)' : 'none',
                          opacity: isPast && !isToday ? 0.55 : 1,
                          transition:'background .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--tbl-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                        {/* Date block */}
                        <div style={{
                          width:46, flexShrink:0, textAlign:'center', padding:'5px 4px', borderRadius:9,
                          background: isToday ? 'rgba(244,114,182,.1)' : 'var(--bg-surface2)',
                          border:`1px solid ${isToday ? 'rgba(244,114,182,.3)' : 'var(--border)'}`,
                        }}>
                          <p style={{ fontSize:'1.25rem', fontWeight:800, lineHeight:1, color: isToday ? '#f472b6' : 'var(--text-primary)' }}>
                            {d.getDate()}
                          </p>
                          <p style={{ fontSize:'0.6rem', fontFamily:'monospace', color:'var(--text-dim)', marginTop:1 }}>{dow}</p>
                        </div>

                        {/* Name & desc */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                            <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--text-primary)' }}>
                              {h.name}
                            </p>
                            {isToday && (
                              <span style={{ fontSize:'0.65rem', fontFamily:'monospace', fontWeight:700, padding:'2px 7px', borderRadius:99, background:'rgba(52,211,153,.1)', color:'#34d399', border:'1px solid rgba(52,211,153,.25)', flexShrink:0 }}>
                                TODAY
                              </span>
                            )}
                            {h.optional && (
                              <span style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'var(--text-dim)', flexShrink:0 }}>optional</span>
                            )}
                            {h.source === 'google' && (
                              <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:'0.65rem', fontFamily:'monospace', color:'#4285f4', flexShrink:0 }}>
                                <Globe size={9}/> Google
                              </span>
                            )}
                          </div>
                          {h.description && (
                            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {h.description}
                            </p>
                          )}
                        </div>

                        {/* Type badge */}
                        <TypeBadge type={h.type}/>

                        {/* Actions */}
                        <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                          {[
                            { Icon:Edit3,  col:'var(--accent)', fn:() => { setEditing(h); setAdd(true) } },
                            { Icon:Trash2, col:'#f87171', danger:true, fn:() => setDel(h) },
                          ].map((btn, bi) => (
                            <button key={bi} onClick={btn.fn}
                              style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg-surface2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', transition:'all .15s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor=btn.col; e.currentTarget.style.color=btn.col; if(btn.danger) e.currentTarget.style.background='rgba(248,113,113,.06)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='var(--bg-surface2)' }}>
                              <btn.Icon size={12}/>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )
                  })}
              </Card>
            )})}
        </div>
      )}

      {/* Info banner */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'13px 16px', borderRadius:12, background:'rgba(96,165,250,.04)', border:'1px solid rgba(96,165,250,.15)' }}>
        <Info size={14} style={{ color:'#60a5fa', flexShrink:0, marginTop:2 }}/>
        <div>
          <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)', marginBottom:3 }}>How holidays work</p>
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.65 }}>
            Any date listed here is automatically marked as <span style={{ color:'#f472b6', fontFamily:'monospace', fontWeight:600 }}>holiday</span> in
            the attendance dashboard — employees won't be marked absent. Sync from Google Calendar for accurate
            lunar-calendar festival dates. You can add custom org holidays manually at any time.
            Configure your Google API key in <span style={{ color:'var(--accent)', fontWeight:600 }}>Admin → Plugins → Google Calendar</span>.
          </p>
        </div>
      </div>

      {/* Modals */}
      <HolidayModal
        open={addModal} onClose={() => setAdd(false)}
        initial={editing} orgId={orgId}
        onSaved={() => load()}/>

      <SyncModal
        open={syncMod} onClose={() => setSyncMod(false)}
        orgId={orgId} year={year}
        onSaved={() => load()}/>

      <ConfirmModal
        open={!!delTarget} onClose={() => setDel(null)}
        onConfirm={deleteOne} loading={delBusy} danger
        title="Delete Holiday"
        message={`Remove "${delTarget?.name}" (${delTarget?.date})? This will affect attendance marking.`}/>

      <ConfirmModal
        open={clearMod} onClose={() => setClearMod(false)}
        onConfirm={clearYear} loading={clearBusy} danger
        title={`Clear all holidays for ${year}`}
        message={`Delete all ${holidays.length} holidays for ${year}? You can re-sync from Google Calendar after.`}/>

      <style>{`
        @keyframes spin          { to { transform:rotate(360deg) } }
        @keyframes shimmer-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
        @media (max-width: 640px) {
          .holidays-page-wrap { padding: 1rem 1rem !important; gap: 1rem !important; }
        }
        @media (max-width: 480px) {
          .holidays-page-wrap { padding: 0.75rem 0.75rem !important; }
        }
      `}</style>
    </UserPage>
  )
}
