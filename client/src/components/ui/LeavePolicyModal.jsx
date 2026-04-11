import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays, Settings2, ChevronDown, ChevronUp,
  Info, RotateCcw, Save, Wallet, Shield, GitBranch
} from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'
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

function LeaveTypeRow({ type, cfg, onChange }) {
  const [open, setOpen] = useState(false)
  const set = (k, v) => onChange({ ...cfg, [k]: v })

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      background: cfg.enabled ? 'var(--bg-surface2)' : 'var(--bg-surface)',
      transition: 'all .2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.enabled ? type.color : 'var(--border)', flexShrink: 0, transition: 'background .2s' }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: cfg.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{type.label}</p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', marginTop: 1 }}>{type.desc}</p>
        </div>
        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
          {cfg.enabled && (
            <>
              <span style={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {cfg.annualQuota}d/yr
              </span>
              {cfg.carryForward && (
                <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 99, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', color: '#22c55e', fontWeight: 700 }}>
                  CF
                </span>
              )}
            </>
          )}
          {/* Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
            <div onClick={() => set('enabled', !cfg.enabled)}
              style={{
                width: 34, height: 18, borderRadius: 99, position: 'relative', transition: 'background .2s',
                background: cfg.enabled ? 'var(--accent)' : 'var(--border)', cursor: 'pointer',
              }}>
              <div style={{
                position: 'absolute', top: 2, left: cfg.enabled ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s',
              }}/>
            </div>
          </label>
          {open ? <ChevronUp size={13} style={{ color: 'var(--text-dim)' }}/> : <ChevronDown size={13} style={{ color: 'var(--text-dim)' }}/>}
        </div>
      </div>

      {/* Expanded settings */}
      {open && cfg.enabled && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 0 }}>
          <div style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.6875rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Annual Quota (days)
              </label>
              <input type="number" min="0" className="field-input" value={cfg.annualQuota}
                onChange={e => set('annualQuota', Math.max(0, Number(e.target.value)))}/>
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Monthly Cap (0 = no cap)
              </label>
              <input type="number" min="0" className="field-input" value={cfg.monthlyLeaveCap}
                onChange={e => set('monthlyLeaveCap', Math.max(0, Number(e.target.value)))}/>
            </div>
          </div>

          {/* Carry forward toggle + cap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <div onClick={() => set('carryForward', !cfg.carryForward)}
                style={{
                  width: 34, height: 18, borderRadius: 99, position: 'relative', transition: 'background .2s',
                  background: cfg.carryForward ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', flexShrink: 0,
                }}>
                <div style={{
                  position: 'absolute', top: 2, left: cfg.carryForward ? 18 : 2,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s',
                }}/>
              </div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Carry Forward</span>
            </label>
            {cfg.carryForward && (
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: '0.6875rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                  Max carry (0 = unlimited)
                </label>
                <input type="number" min="0" className="field-input" value={cfg.carryForwardCap}
                  onChange={e => set('carryForwardCap', Math.max(0, Number(e.target.value)))}/>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PtSlabRow({ slab, onChange, onRemove, isLast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 80 }}>
        <label style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Min ₹</label>
        <input type="number" min="0" className="field-input" value={slab.min}
          onChange={e => onChange({ ...slab, min: Number(e.target.value) })}/>
      </div>
      <div style={{ flex: 1, minWidth: 80 }}>
        <label style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>
          Max ₹ {isLast ? '(blank = ∞)' : ''}
        </label>
        <input type="number" min="0" className="field-input"
          value={slab.max == null ? '' : slab.max}
          onChange={e => onChange({ ...slab, max: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder={isLast ? '∞' : ''}/>
      </div>
      <div style={{ flex: 1, minWidth: 80 }}>
        <label style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>PT ₹/month</label>
        <input type="number" min="0" className="field-input" value={slab.pt}
          onChange={e => onChange({ ...slab, pt: Number(e.target.value) })}/>
      </div>
      <button onClick={onRemove} style={{ marginTop: 16, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.7, transition: 'opacity .15s' }}
        onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.7}>
        ✕
      </button>
    </div>
  )
}

export default function LeavePolicyModal({ open, onClose, orgId, orgName }) {
  const [policy,     setPolicy]     = useState(null)
  const [types,      setTypes]      = useState({})
  const [ptSlabs,    setPtSlabs]    = useState(DEFAULT_PT_SLABS)
  const [yearMonth,  setYearMonth]  = useState(4)
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [crediting,  setCrediting]  = useState(false)
  const [activeTab,  setActiveTab]  = useState('leave')
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
        leaveYearStartMonth: yearMonth,
        types,
        ptSlabs,
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

  return (
    <Modal open={open} onClose={onClose} title="Leave & Payroll Settings" description="Default leave policy and payroll rules for this organisation" size="lg">
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginTop: -8, marginBottom: 16 }}>
        {[
          { key: 'leave', label: 'Default Policy', icon: GitBranch },
          { key: 'pt',    label: 'Prof. Tax (PT)', icon: Wallet },
          { key: 'year',  label: 'Leave Year', icon: Settings2 },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600,
              borderBottom: `2px solid ${activeTab===t.key?'var(--accent)':'transparent'}`,
              color: activeTab===t.key ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent', cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
            }}>
            <t.icon size={12}/> {t.label}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 320 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 52, borderRadius: 12 }}/>)}
          </div>
        ) : activeTab === 'leave' ? (
          /* ── Default Leave Policy ────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding:'10px 14px', borderRadius:10, background:'var(--accent-muted)',
              border:'1px solid var(--accent-border)', display:'flex', gap:10, alignItems:'flex-start' }}>
              <GitBranch size={13} style={{ color:'var(--accent)', marginTop:1, flexShrink:0 }}/>
              <p style={{ fontSize:'0.75rem', color:'var(--text-secondary)', lineHeight:1.55 }}>
                This is the <strong style={{ color:'var(--accent)' }}>organisation-wide default</strong> leave policy.
                Individual shifts can override these quotas — go to <em>Shifts → Edit → Leave Policy</em> to set shift-specific entitlements.
              </p>
            </div>
            {LEAVE_TYPES.map(t => (
              <LeaveTypeRow
                key={t.key}
                type={t}
                cfg={types[t.key] || { enabled: false, annualQuota: 0, monthlyLeaveCap: 0, carryForward: false, carryForwardCap: 0 }}
                onChange={cfg => setTypes(old => ({ ...old, [t.key]: cfg }))}
              />
            ))}
          </div>
        ) : activeTab === 'pt' ? (
          /* ── PT Slabs ────────────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Info size={13} style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                PT slabs are evaluated in order — the first matching range is used. Employee-level override (set in Employee profile) takes precedence. PT is prorated for partial months.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ptSlabs.map((slab, i) => (
                <PtSlabRow
                  key={i}
                  slab={slab}
                  isLast={i === ptSlabs.length - 1}
                  onChange={updated => setPtSlabs(s => s.map((x, j) => j === i ? updated : x))}
                  onRemove={() => setPtSlabs(s => s.filter((_, j) => j !== i))}
                />
              ))}
            </div>

            <button onClick={addSlab}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, width: 'fit-content', transition: 'all .15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)' }}>
              + Add Slab
            </button>

            <button onClick={() => setPtSlabs(DEFAULT_PT_SLABS)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, width: 'fit-content' }}>
              <RotateCcw size={11}/> Reset to defaults
            </button>
          </div>
        ) : (
          /* ── Leave Year ──────────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Info size={13} style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                The leave year start determines when annual quotas reset and carry-forward is applied. Common choices: April (Indian fiscal year) or January (calendar year).
              </p>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                Leave Year Starts In
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {MONTHS.map((m, i) => (
                  <button key={i} onClick={() => setYearMonth(i + 1)}
                    style={{
                      padding: '10px 8px', borderRadius: 10, border: `2px solid ${yearMonth === i+1 ? 'var(--accent)' : 'var(--border)'}`,
                      background: yearMonth === i+1 ? 'var(--accent-muted)' : 'var(--bg-surface2)',
                      color: yearMonth === i+1 ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: yearMonth === i+1 ? 700 : 500,
                      fontSize: '0.75rem', cursor: 'pointer', transition: 'all .15s',
                    }}>
                    {m.substring(0, 3)}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Current: Leave year starts in <strong style={{ color: 'var(--accent)' }}>{MONTHS[yearMonth - 1]}</strong>
              </p>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" onClick={applyAnnualCredit} loading={crediting}
          title="Credit annual leave quota to all active employees for the current leave year">
          <CalendarDays size={12}/> Apply Annual Credit
        </Button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>
            <Save size={13}/> Save Policy
          </Button>
        </div>
      </div>
    </Modal>
  )
}
