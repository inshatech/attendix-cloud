import { useEffect, useState } from 'react'
import {
  CalendarDays, Settings2, ChevronDown, ChevronUp,
  Info, RotateCcw, Save, Wallet, GitBranch, X, Plus
} from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useToast } from './Toast'
import api from '../../lib/api'

const LEAVE_TYPES = [
  { key: 'casual',    label: 'Casual Leave',    desc: 'General purpose, short notice',  color: '#58a6ff' },
  { key: 'sick',      label: 'Sick Leave',       desc: 'Medical / health related',       color: '#34d399' },
  { key: 'earned',    label: 'Earned / PL',      desc: 'Accumulated privilege leave',    color: '#a78bfa' },
  { key: 'maternity', label: 'Maternity Leave',  desc: 'For female employees (182 days)',color: '#f472b6' },
  { key: 'paternity', label: 'Paternity Leave',  desc: 'For new fathers',               color: '#60a5fa' },
  { key: 'other',     label: 'Other Leave',      desc: 'Configurable extra category',   color: '#fb923c' },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const DEFAULT_PT_SLABS = [
  { min: 0,     max: 10000, pt: 0   },
  { min: 10001, max: 15000, pt: 150 },
  { min: 15001, max: null,  pt: 200 },
]

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ on, onChange, color = 'var(--accent)' }) {
  return (
    <div onClick={onChange}
      style={{ width: 38, height: 21, borderRadius: 99, position: 'relative',
        background: on ? color : 'var(--border)', cursor: 'pointer',
        transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}/>
    </div>
  )
}

// ── Number spinner input ──────────────────────────────────────────────────────
function NumInput({ value, onChange, label, sub, style: s }) {
  return (
    <div style={s}>
      <label style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
        color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em',
        display: 'block', marginBottom: 5 }}>
        {label}{sub && <span style={{ fontWeight: 400, textTransform: 'none' }}> {sub}</span>}
      </label>
      <input type="number" min="0" className="field-input" value={value} onChange={onChange}
        style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}/>
    </div>
  )
}

// ── Leave type row ────────────────────────────────────────────────────────────
function LeaveTypeRow({ type, cfg, onChange }) {
  const [open, setOpen] = useState(false)
  const set = (k, v) => onChange({ ...cfg, [k]: v })
  const isOn = cfg.enabled

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: `1px solid ${isOn ? `color-mix(in srgb, ${type.color} 35%, var(--border))` : 'var(--border)'}`,
      boxShadow: isOn ? `0 0 0 1px color-mix(in srgb, ${type.color} 10%, transparent)` : 'none',
      transition: 'all .2s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer',
        background: isOn ? `color-mix(in srgb, ${type.color} 5%, var(--bg-surface))` : 'var(--bg-surface)',
        transition: 'background .2s',
      }} onClick={() => setOpen(o => !o)}>

        {/* Dot indicator */}
        <div style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          background: isOn ? type.color : 'var(--border)',
          boxShadow: isOn ? `0 0 7px color-mix(in srgb, ${type.color} 65%, transparent)` : 'none',
          transition: 'all .2s',
        }}/>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 700,
            color: isOn ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color .2s' }}>
            {type.label}
          </p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', marginTop: 1 }}>{type.desc}</p>
        </div>

        {/* Stats chips */}
        {isOn && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <span style={{
              fontSize: '0.6875rem', fontFamily: 'monospace', fontWeight: 700,
              padding: '2px 8px', borderRadius: 7,
              background: `color-mix(in srgb, ${type.color} 12%, transparent)`,
              color: type.color,
              border: `1px solid color-mix(in srgb, ${type.color} 28%, transparent)`,
            }}>{cfg.annualQuota}d/yr</span>
            {cfg.carryForward && (
              <span style={{
                fontSize: '0.6rem', padding: '2px 7px', borderRadius: 6, fontWeight: 700,
                background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.22)', color: '#22c55e',
              }}>CF</span>
            )}
          </div>
        )}

        {/* Toggle */}
        <div onClick={e => e.stopPropagation()}>
          <Toggle on={isOn} onChange={() => set('enabled', !isOn)} color={type.color}/>
        </div>

        {open
          ? <ChevronUp  size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>
          : <ChevronDown size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>}
      </div>

      {/* Expanded */}
      {open && (
        <div style={{
          padding: '14px 16px',
          borderTop: `1px solid color-mix(in srgb, ${type.color} 20%, var(--border))`,
          background: 'var(--bg-surface2)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {!isOn ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
              Enable this leave type to configure quotas.
            </p>
          ) : (<>
            {/* Quota + Cap */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NumInput label="Annual Quota" sub="(days)"
                value={cfg.annualQuota}
                onChange={e => set('annualQuota', Math.max(0, Number(e.target.value)))}/>
              <NumInput label="Monthly Cap" sub="(0 = none)"
                value={cfg.monthlyLeaveCap}
                onChange={e => set('monthlyLeaveCap', Math.max(0, Number(e.target.value)))}/>
            </div>

            {/* Carry Forward */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
              background: cfg.carryForward ? 'rgba(34,197,94,.05)' : 'var(--bg-surface)',
              border: `1px solid ${cfg.carryForward ? 'rgba(34,197,94,.22)' : 'var(--border)'}`,
              transition: 'all .2s', flexWrap: 'wrap',
            }}>
              <Toggle on={cfg.carryForward} onChange={() => set('carryForward', !cfg.carryForward)} color="#22c55e"/>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600,
                  color: cfg.carryForward ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Carry Forward
                </p>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', marginTop: 1 }}>
                  Roll unused days into next year
                </p>
              </div>
              {cfg.carryForward && (
                <NumInput label="Max carry" sub="(0 = ∞)"
                  value={cfg.carryForwardCap}
                  onChange={e => set('carryForwardCap', Math.max(0, Number(e.target.value)))}
                  style={{ minWidth: 120 }}/>
              )}
            </div>
          </>)}
        </div>
      )}
    </div>
  )
}

// ── PT slab row ───────────────────────────────────────────────────────────────
function PtSlabRow({ slab, onChange, onRemove, isLast, index }) {
  const rangeLabel = `₹${slab.min.toLocaleString('en-IN')} – ${slab.max != null ? '₹' + slab.max.toLocaleString('en-IN') : '∞'}`
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 32px',
      alignItems: 'center', gap: 8,
      padding: '6px 4px',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
        color: 'var(--text-dim)', textAlign: 'center' }}>
        {index + 1}
      </span>
      <input type="number" min="0" className="field-input" value={slab.min}
        onChange={e => onChange({ ...slab, min: Number(e.target.value) })}
        style={{ fontFamily: 'monospace', textAlign: 'right', fontSize: '0.8125rem' }}/>
      <input type="number" min="0" className="field-input"
        value={slab.max == null ? '' : slab.max}
        onChange={e => onChange({ ...slab, max: e.target.value === '' ? null : Number(e.target.value) })}
        placeholder={isLast ? '∞' : ''}
        style={{ fontFamily: 'monospace', textAlign: 'right', fontSize: '0.8125rem' }}/>
      <input type="number" min="0" className="field-input" value={slab.pt}
        onChange={e => onChange({ ...slab, pt: Number(e.target.value) })}
        style={{ fontFamily: 'monospace', textAlign: 'right', fontSize: '0.8125rem',
          color: 'var(--accent)', fontWeight: 700 }}/>
      <button onClick={onRemove}
        style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)',
          background: 'none', cursor: 'pointer', color: 'var(--text-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='#f87171'; e.currentTarget.style.color='#f87171'; e.currentTarget.style.background='rgba(248,113,113,.07)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-dim)'; e.currentTarget.style.background='none' }}>
        <X size={11}/>
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LeavePolicyModal({ open, onClose, orgId, orgName }) {
  const [policy,    setPolicy]    = useState(null)
  const [types,     setTypes]     = useState({})
  const [ptSlabs,   setPtSlabs]   = useState(DEFAULT_PT_SLABS)
  const [yearMonth, setYearMonth] = useState(4)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [crediting, setCrediting] = useState(false)
  const [activeTab, setActiveTab] = useState('leave')
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !orgId) return
    setLoading(true)
    api.get(`/organizations/${orgId}/leave-policy`)
      .then(r => {
        const p = r.data
        setPolicy(p)
        setTypes(p.types || {})
        setPtSlabs(p.ptSlabs?.length ? p.ptSlabs : DEFAULT_PT_SLABS)
        setYearMonth(p.leaveYearStartMonth || 4)
      })
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [open, orgId])

  async function save() {
    setSaving(true)
    try {
      await api.put(`/organizations/${orgId}/leave-policy`, {
        leaveYearStartMonth: yearMonth, types, ptSlabs,
      })
      toast('Leave policy saved', 'success')
      onClose()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function applyAnnualCredit() {
    if (!window.confirm('Apply annual leave credit to ALL active employees for the current leave year? This cannot be undone.')) return
    setCrediting(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const r = await api.post(`/organizations/${orgId}/leave-credit-annual`, { date: today })
      toast(`Annual credit applied to ${r.credited} employees (${r.transactions} transactions)`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setCrediting(false) }
  }

  function addSlab() {
    const last = ptSlabs[ptSlabs.length - 1]
    const newMin = last ? (last.max != null ? last.max + 1 : 0) : 0
    setPtSlabs(s => [...s, { min: newMin, max: null, pt: 0 }])
  }

  const TABS = [
    { key: 'leave', label: 'Default Policy', icon: GitBranch },
    { key: 'pt',    label: 'Prof. Tax (PT)', icon: Wallet    },
    { key: 'year',  label: 'Leave Year',     icon: Settings2 },
  ]

  const enabledCount = Object.values(types).filter(t => t.enabled).length

  return (
    <Modal open={open} onClose={onClose}
      title="Leave & Payroll Settings"
      description="Default leave policy and payroll rules for this organisation"
      size="lg" noScroll>
      <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, gap:0 }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginTop: -8, marginBottom: 0, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', fontSize: '0.8125rem', fontWeight: 600,
              borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`,
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent', cursor: 'pointer', transition: 'color .15s', whiteSpace: 'nowrap',
            }}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'16px 0 4px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 52, borderRadius: 12 }}/>)}
          </div>

        ) : activeTab === 'leave' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Info banner */}
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10,
              background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', alignItems: 'flex-start' }}>
              <GitBranch size={13} style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                This is the <strong style={{ color: 'var(--accent)' }}>organisation-wide default</strong> leave policy.
                Individual shifts can override these quotas — go to <em>Shifts → Edit → Leave Policy</em> to set shift-specific entitlements.
              </p>
              {enabledCount > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontFamily: 'monospace',
                  fontWeight: 700, flexShrink: 0, color: 'var(--accent)', padding: '2px 8px',
                  background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 6 }}>
                  {enabledCount} active
                </span>
              )}
            </div>

            {LEAVE_TYPES.map(t => (
              <LeaveTypeRow
                key={t.key} type={t}
                cfg={types[t.key] || { enabled: false, annualQuota: 0, monthlyLeaveCap: 0, carryForward: false, carryForwardCap: 0 }}
                onChange={cfg => setTypes(old => ({ ...old, [t.key]: cfg }))}
              />
            ))}
          </div>

        ) : activeTab === 'pt' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Info */}
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10,
              background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', alignItems: 'flex-start' }}>
              <Info size={13} style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Slabs are evaluated in order — first match is used. Employee-level override takes precedence.
                PT is prorated for partial months.
              </p>
            </div>

            {/* Slab table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 32px',
                gap: 8, padding: '8px 12px', background: 'var(--bg-surface2)',
                borderBottom: '1px solid var(--border)' }}>
                <span/>
                {['Min ₹', 'Max ₹', 'PT ₹/mo'].map(h => (
                  <span key={h} style={{ fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700,
                    color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>
                    {h}
                  </span>
                ))}
                <span/>
              </div>
              <div style={{ padding: '4px 12px 8px' }}>
                {ptSlabs.map((slab, i) => (
                  <PtSlabRow
                    key={i} slab={slab} index={i}
                    isLast={i === ptSlabs.length - 1}
                    onChange={updated => setPtSlabs(s => s.map((x, j) => j === i ? updated : x))}
                    onRemove={() => setPtSlabs(s => s.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={addSlab}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 8,
                  border: '1px dashed var(--border)', background: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)' }}>
                <Plus size={12}/> Add Slab
              </button>
              <button onClick={() => setPtSlabs(DEFAULT_PT_SLABS)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all .15s' }}
                onMouseEnter={e => e.currentTarget.style.color='var(--text-secondary)'}
                onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
                <RotateCcw size={11}/> Reset defaults
              </button>
            </div>
          </div>

        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10,
              background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', alignItems: 'flex-start' }}>
              <Info size={13} style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                The leave year start determines when annual quotas reset and carry-forward is applied.
                Common choices: <strong>April</strong> (Indian fiscal year) or <strong>January</strong> (calendar year).
              </p>
            </div>

            <div>
              <label style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
                color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em',
                display: 'block', marginBottom: 10 }}>
                Leave Year Starts In
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                {MONTHS.map((m, i) => (
                  <button key={i} onClick={() => setYearMonth(i + 1)}
                    style={{
                      padding: '9px 4px', borderRadius: 9, cursor: 'pointer', transition: 'all .15s',
                      border: `2px solid ${yearMonth === i+1 ? 'var(--accent)' : 'var(--border)'}`,
                      background: yearMonth === i+1 ? 'var(--accent-muted)' : 'var(--bg-surface2)',
                      color: yearMonth === i+1 ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: yearMonth === i+1 ? 800 : 500, fontSize: '0.8rem',
                      boxShadow: yearMonth === i+1 ? '0 0 0 3px var(--accent-muted)' : 'none',
                    }}>
                    {m.substring(0, 3)}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', borderRadius: 9, background: 'var(--bg-surface2)', border: '1px solid var(--border)' }}>
                <CalendarDays size={13} style={{ color: 'var(--accent)' }}/>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Leave year starts in <strong style={{ color: 'var(--accent)' }}>{MONTHS[yearMonth - 1]}</strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      </div>{/* end scrollable content */}

      {/* Footer — always visible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <Button variant="secondary" size="sm" onClick={applyAnnualCredit} loading={crediting}
          title="Credit annual leave quota to all active employees for the current leave year">
          <CalendarDays size={12}/> Apply Annual Credit
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>
            <Save size={13}/> Save Policy
          </Button>
        </div>
      </div>
    </Modal>
  )
}
