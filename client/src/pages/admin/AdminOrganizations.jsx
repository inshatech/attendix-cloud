import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Cpu, Server, Search, RefreshCw, Power, PowerOff,
  ChevronDown, ChevronUp, RotateCcw, Zap, ShieldOff, ShieldCheck,
  Trash2, Edit3, BarChart2, Unlink, Link2, Users, Fingerprint,
  Activity, AlertTriangle, CheckCircle2, XCircle, Wifi, WifiOff,
  Settings, MoreVertical, Calendar, Copy, Key, Globe, Shield, Plus, Clock, Volume2
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Empty } from '../../components/ui/Empty'
import { useAuth } from '../../store/auth'
import { ActionBtn as SharedActionBtn } from '../../components/ui/ActionBtn'
import { AdminPage, PageHeader, SectionCard, StatCard, FilterTabs, SearchBox, LinkBtn } from '../../components/admin/AdminUI'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

// ── Org Stats Modal ───────────────────────────────────────────────────────────
function OrgStatsModal({ open, onClose, orgId }) {
  const [stats, setStats] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !orgId) return
    api.get(`/admin/orgs/${orgId}/stats`)
      .then(r => setStats(r.data))
      .catch(e => toast(e.message, 'error'))
  }, [open, orgId])

  return (
    <Modal open={open} onClose={onClose} title="Organization Stats" size="md">
      {!stats ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{[1,2,3,4].map(i=><div key={i} className="h-10 shimmer rounded-lg"/>)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Employees */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'0.875rem' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:4 }}>
              <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#58a6ff', fontFamily:'monospace' }}>{stats.employees.active}</p>
              <p style={{ fontSize:'1rem', color:'var(--text-dim)', fontFamily:'monospace' }}>/ {stats.employees.total}</p>
              {stats.employees.permitted && (
                <p style={{ fontSize:'0.8rem', color:'#fb923c', fontFamily:'monospace', marginLeft:4 }}>of {stats.employees.permitted} permitted</p>
              )}
            </div>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>Employees</p>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontFamily:'monospace' }}>
              {stats.employees.active} active · {stats.employees.total - stats.employees.active} inactive
              {stats.employees.permitted ? ` · ${stats.employees.permitted - stats.employees.total} slots free` : ''}
            </p>
          </div>

          {/* Machine Users */}
          <div style={{ background:'var(--bg-surface)', border:`1px solid ${stats.machineUsers.unlinked > 0 ? 'rgba(251,146,60,.2)' : '#1e1e30'}`, borderRadius:10, padding:'0.875rem' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:4 }}>
              <p style={{ fontSize:'1.75rem', fontWeight:800, color: stats.machineUsers.linked > 0 ? '#34d399' : '#fb923c', fontFamily:'monospace' }}>{stats.machineUsers.linked}</p>
              <p style={{ fontSize:'1rem', color:'var(--text-dim)', fontFamily:'monospace' }}>/ {stats.machineUsers.total}</p>
            </div>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>Biometric Users</p>
            <p style={{ fontSize:'0.78rem', color: stats.machineUsers.unlinked > 0 ? '#fb923c' : '#5a5a7a', fontFamily:'monospace' }}>
              {stats.machineUsers.linked} linked · {stats.machineUsers.unlinked} pending link
            </p>
          </div>

          {/* Devices */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'0.875rem' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:4 }}>
              <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#c084fc', fontFamily:'monospace' }}>{stats.devices.enabled}</p>
              <p style={{ fontSize:'1rem', color:'var(--text-dim)', fontFamily:'monospace' }}>/ {stats.devices.total}</p>
            </div>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>Devices</p>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{stats.devices.enabled} enabled · {stats.devices.total - stats.devices.enabled} disabled</p>
          </div>

          {/* Today */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'0.875rem' }}>
            <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#34d399', fontFamily:'monospace', marginBottom:4 }}>{stats.attendance.today}</p>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>Today Punches</p>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{stats.attendance.total} total logs</p>
          </div>

          {/* Week */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'0.875rem' }}>
            <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#facc15', fontFamily:'monospace', marginBottom:4 }}>{stats.attendance.week}</p>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>Week Punches</p>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontFamily:'monospace' }}>last 7 days</p>
          </div>

          {/* Bridge */}
          <div style={{ background:'var(--bg-surface)', border:`1px solid ${stats.bridge?.online ? 'rgba(52,211,153,.2)' : '#1e1e30'}`, borderRadius:10, padding:'0.875rem' }}>
            <p style={{ fontSize:'1.75rem', fontWeight:800, color: stats.bridge?.online ? '#34d399' : '#f87171', fontFamily:'monospace', marginBottom:4 }}>
              {stats.bridge ? (stats.bridge.online ? 'Online' : 'Offline') : 'No Bridge'}
            </p>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>Bridge Status</p>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontFamily:'monospace' }}>
              {stats.bridge ? `last seen ${stats.bridge.lastSeen ? new Date(stats.bridge.lastSeen).toLocaleTimeString('en-IN') : 'never'}` : 'no bridge assigned'}
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Edit Org Modal ────────────────────────────────────────────────────────────
function EditOrgModal({ open, onClose, org, onSaved }) {
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && org) setForm({ name: org.name||'', industry: org.industry||'', city: org.city||'', address: org.address||'', phone: org.phone||'', email: org.email||'' })
  }, [open, org])

  const sf = k => e => setForm(f => ({...f, [k]: e.target.value}))

  async function save() {
    if (!form.name?.trim()) return toast('Name required', 'error')
    setBusy(true)
    try {
      await api.patch(`/admin/orgs/${org.orgId}`, form)
      toast('Organization updated', 'success'); onSaved(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Organization" size="lg">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Input label="Name *" value={form.name||''} onChange={sf('name')}/></div>
        <Input label="Industry"  value={form.industry||''} onChange={sf('industry')} placeholder="Manufacturing"/>
        <Input label="City"      value={form.city||''}     onChange={sf('city')}     placeholder="Mumbai"/>
        <div className="col-span-2"><Input label="Address" value={form.address||''} onChange={sf('address')}/></div>
        <Input label="Phone"     value={form.phone||''}    onChange={sf('phone')}    placeholder="+91..."/>
        <Input label="Email"     value={form.email||''}    onChange={sf('email')}    placeholder="hr@company.com"/>
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save Changes</Button>
      </div>
    </Modal>
  )
}

// ── Machine Users Modal ───────────────────────────────────────────────────────
function MachineUsersModal({ open, onClose, orgId }) {
  const [mus,     setMus]    = useState([])
  const [loading, setLoad]   = useState(false)
  const [busy,    setBusy]   = useState(false)
  const [filter,  setFilter] = useState('')
  const { toast } = useToast()

  async function load() {
    setLoad(true)
    try {
      const r = await api.get(`/admin/orgs/${orgId}/machine-users`)
      setMus(r.data || [])
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (open && orgId) { setFilter(''); load() } }, [open, orgId])

  async function unlink(mu) {
    setBusy(true)
    try {
      await api.patch(`/admin/orgs/${orgId}/machine-users/${mu._id}/unlink`)
      toast(`UID ${mu.uid} unlinked`, 'success'); load()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function cleanUnlinked() {
    if (!window.confirm('Delete all unlinked machine users for this org?')) return
    setBusy(true)
    try {
      const r = await api.delete(`/admin/orgs/${orgId}/machine-users/unlinked`)
      toast(`Deleted ${r.deleted} unlinked records`, 'success'); load()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const q        = filter.toLowerCase()
  const matches  = m => !q || (m.name||'').toLowerCase().includes(q) || String(m.uid).includes(q) || (m.deviceId||'').toLowerCase().includes(q)
  const linked   = mus.filter(m => m.employee && matches(m))
  const unlinked = mus.filter(m => !m.employee && matches(m))

  return (
    <Modal open={open} onClose={onClose} title="Machine Users" size="lg">

      {/* ── Search bar + summary ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Search by name, UID or device…" className="field-input"
          style={{ flex:1, fontSize:'0.8125rem' }}/>
        <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', whiteSpace:'nowrap', fontFamily:'monospace',
          background:'var(--bg-surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px' }}>
          {mus.filter(m=>m.employee).length} linked / {mus.length} total
        </span>
        {unlinked.length > 0 && (
          <Button variant="secondary" size="sm" onClick={cleanUnlinked} loading={busy}>
            <Trash2 size={12}/> Clean Unlinked
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height:52, borderRadius:10, background:'var(--bg-surface2)', animation:'shimmer 1.5s infinite' }}/>)}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:20, maxHeight:'60vh', overflowY:'auto', paddingRight:2 }}>

          {/* ── Linked section ── */}
          <div>
            <p style={{ fontSize:'0.72rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase',
              letterSpacing:'0.07em', color:'var(--text-muted)', marginBottom:8 }}>
              Linked to Employees · {linked.length}
            </p>
            {linked.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 0',
                border:'1px dashed var(--border)', borderRadius:12, gap:6 }}>
                <Fingerprint size={24} style={{ color:'var(--text-dim)', opacity:.4 }}/>
                <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>No linked machine users{q ? ' match filter' : ''}</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {linked.map(m => (
                  <div key={m._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    borderRadius:12, background:'rgba(52,211,153,.04)', border:'1px solid rgba(52,211,153,.18)' }}>
                    {/* Icon */}
                    <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                      background:'rgba(52,211,153,.1)', border:'1px solid rgba(52,211,153,.2)' }}>
                      <Fingerprint size={15} style={{ color:'#34d399' }}/>
                    </div>
                    {/* Machine info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)', fontFamily:'monospace',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {m.name || `UID ${m.uid}`}
                      </p>
                      <p style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-muted)' }}>
                        UID: {m.uid} · {m.deviceId}{m.cardno ? ` · Card: ${m.cardno}` : ''}
                      </p>
                    </div>
                    {/* Employee badge */}
                    <div style={{ flexShrink:0, textAlign:'right' }}>
                      <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'#34d399' }}>
                        {m.employee.displayName || `${m.employee.firstName} ${m.employee.lastName||''}`.trim()}
                      </p>
                      <p style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-dim)' }}>
                        {m.employee.employeeCode || '—'}
                      </p>
                    </div>
                    {/* Unlink */}
                    <button onClick={() => unlink(m)} disabled={busy} title="Unlink"
                      style={{ padding:7, borderRadius:8, background:'transparent', border:'1px solid transparent',
                        cursor:'pointer', color:'var(--text-muted)', transition:'all .15s', flexShrink:0 }}
                      onMouseEnter={e => { e.currentTarget.style.color='#f87171'; e.currentTarget.style.borderColor='rgba(248,113,113,.25)'; e.currentTarget.style.background='rgba(248,113,113,.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent' }}>
                      <Unlink size={13}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Unlinked section ── */}
          <div>
            <p style={{ fontSize:'0.72rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase',
              letterSpacing:'0.07em', color:'var(--text-muted)', marginBottom:8 }}>
              Not Linked · {unlinked.length}
            </p>
            {unlinked.length === 0 ? (
              <p style={{ fontSize:'0.75rem', color:'var(--text-dim)', fontFamily:'monospace', textAlign:'center', padding:'16px 0' }}>
                {q ? 'No unlinked machine users match filter' : 'All machine users are linked ✓'}
              </p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {unlinked.map(m => (
                  <div key={m._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    borderRadius:12, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                    <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                      background:'var(--bg-elevated)', border:'1px solid var(--border)' }}>
                      <Fingerprint size={15} style={{ color:'var(--text-dim)' }}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)', fontFamily:'monospace',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {m.name || `UID ${m.uid}`}
                      </p>
                      <p style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-dim)' }}>
                        UID: {m.uid} · {m.deviceId}{m.cardno ? ` · Card: ${m.cardno}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#f87171', fontFamily:'monospace',
                      background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.18)',
                      borderRadius:6, padding:'2px 8px', flexShrink:0 }}>
                      Not Linked
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </Modal>
  )
}

// ── Admin Device Control Modal ────────────────────────────────────────────────
function AdminDeviceControlModal({ open, onClose, dev, orgId, onRefresh }) {
  const { toast } = useToast()
  const [info,     setInfo]    = useState(null)
  const [time,     setTime]    = useState(null)
  const [loadInfo, setLoadInfo]= useState(false)
  const [busy,     setBusy]    = useState('')

  async function fetchInfo() {
    setLoadInfo(true)
    try {
      const r = await api.get(`/admin/orgs/${orgId}/devices/${dev.deviceId}/info`)
      setInfo(r.data); setTime(null)
      // separately fetch time
      api.get(`/admin/orgs/${orgId}/devices/${dev.deviceId}/time`)
        .then(r => setTime(r.data?.deviceTime)).catch(() => setTime('—'))
    } catch(e) { toast(e.message, 'error') }
    finally { setLoadInfo(false) }
  }

  async function syncTime() {
    setBusy('synctime')
    try {
      await api.put(`/admin/orgs/${orgId}/devices/${dev.deviceId}/time`, { time: new Date().toISOString() })
      toast('Device time synced', 'success')
      api.get(`/admin/orgs/${orgId}/devices/${dev.deviceId}/time`).then(r => setTime(r.data?.deviceTime)).catch(() => {})
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function voiceTest() {
    setBusy('voice')
    try { await api.post(`/admin/orgs/${orgId}/devices/${dev.deviceId}/voice-test`); toast('Voice test triggered', 'success') }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function triggerSync() {
    setBusy('sync')
    try { await api.post(`/admin/orgs/${orgId}/devices/${dev.deviceId}/sync`); toast('Sync triggered', 'success') }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function connectDev() {
    setBusy('connect')
    try { await api.post(`/admin/orgs/${orgId}/devices/${dev.deviceId}/connect`); toast('Connect signal sent', 'success'); onRefresh?.() }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function disconnectDev() {
    setBusy('disconnect')
    try { await api.post(`/admin/orgs/${orgId}/devices/${dev.deviceId}/disconnect`); toast('Disconnect signal sent', 'success'); onRefresh?.() }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  useEffect(() => { if (open) fetchInfo() }, [open])

  const bridgeOnline = !!dev.bridgeOnline

  return (
    <Modal open={open} onClose={onClose} title={dev.name} description={`${dev.ip}:${dev.port} · ${dev.deviceId}`} size="lg">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:20 }}>

        {/* Left: device card */}
        <div>
          {/* Status indicator */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, padding:'12px 14px', borderRadius:12,
            background: bridgeOnline ? 'rgba(52,211,153,.04)' : 'var(--bg-surface2)',
            border:`1px solid ${bridgeOnline ? 'rgba(52,211,153,.2)' : 'var(--border)'}`, marginBottom:12 }}>
            {[
              { l:'IP Address', v:`${dev.ip}` },
              { l:'Port',       v:`${dev.port || 4370}` },
              { l:'Device ID',  v:dev.deviceId },
              { l:'Model',      v:dev.model || '—' },
              { l:'Location',   v:dev.location || '—' },
              { l:'Status',     v: bridgeOnline ? (info?.deviceStatus || 'checking…') : 'Bridge Offline',
                color: bridgeOnline ? (info?.deviceStatus === 'online' ? '#34d399' : '#f87171') : '#fb923c' },
              { l:'Device Time', v: time || (bridgeOnline ? 'loading…' : '—') },
            ].map(r => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:'0.78rem', fontFamily:'monospace' }}>
                <span style={{ color:'var(--text-dim)', flexShrink:0 }}>{r.l}</span>
                <span style={{ color: r.color || 'var(--text-secondary)', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* Sync stats from DB */}
          {info && (
            <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'10px 12px', borderRadius:10,
              background:'var(--bg-input)', border:'1px solid var(--border)', fontSize:'0.75rem', fontFamily:'monospace' }}>
              <p style={{ fontSize:'0.625rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-dim)', marginBottom:4 }}>Sync Stats</p>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--text-muted)' }}>Punches synced</span>
                <span style={{ color:'#58a6ff' }}>{info.totalAttendanceSynced || 0}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--text-muted)' }}>Users synced</span>
                <span style={{ color:'#c084fc' }}>{info.totalUsersSynced || 0}</span>
              </div>
              {info.lastAttendanceSync && (
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text-muted)' }}>Last punch sync</span>
                  <span style={{ color:'var(--text-dim)' }}>{new Date(info.lastAttendanceSync).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' })}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: hardware info + actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Hardware info (from tunnel) */}
          {loadInfo ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>{[1,2,3].map(i=><div key={i} className="h-8 shimmer rounded-md"/>)}</div>
          ) : info?.hw ? (
            <div style={{ padding:'12px 14px', borderRadius:12, background:'rgba(250,204,21,.04)', border:'1px solid rgba(250,204,21,.15)' }}>
              <p style={{ fontSize:'0.625rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#facc1580', marginBottom:8 }}>Hardware Info</p>
              <div style={{ display:'flex', flexDirection:'column', gap:5, fontSize:'0.75rem', fontFamily:'monospace' }}>
                {[
                  { l:'Device Name', v:info.hw.name },
                  { l:'Version',     v:info.hw.version },
                  { l:'OS',          v:info.hw.os },
                  { l:'Platform',    v:info.hw.platform },
                  { l:'MAC',         v:info.hw.mac },
                ].filter(r=>r.v).map(r=>(
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <span style={{ color:'var(--text-dim)' }}>{r.l}</span>
                    <span style={{ color:'#facc15' }}>{r.v}</span>
                  </div>
                ))}
                {info.hw.stats && (
                  <div style={{ paddingTop:8, borderTop:'1px solid rgba(250,204,21,.15)', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, textAlign:'center' }}>
                    {[{l:'Users',v:info.hw.stats?.UserCount},{l:'Logs',v:info.hw.stats?.AttLogCount},{l:'Admins',v:info.hw.stats?.AdminCount}]
                      .filter(r=>r.v!==undefined).map(r=>(
                      <div key={r.l}><p style={{ fontSize:'0.9rem', fontWeight:800, color:'#34d399' }}>{r.v}</p><p style={{ fontSize:'0.6rem', color:'var(--text-dim)' }}>{r.l}</p></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : bridgeOnline ? (
            <div style={{ padding:'12px', borderRadius:10, background:'rgba(251,146,60,.06)', border:'1px solid rgba(251,146,60,.2)', fontSize:'0.8rem', color:'#fb923c' }}>
              ⚠ Device may not be connected to bridge
            </div>
          ) : null}

          {/* Actions */}
          <div>
            <p style={{ fontSize:'0.625rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-dim)', marginBottom:8 }}>Actions</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <Button size="sm" variant="secondary" onClick={triggerSync} loading={busy==='sync'}>
                <RefreshCw size={12}/> Sync Data
              </Button>
              <Button size="sm" variant="secondary" onClick={syncTime} loading={busy==='synctime'} disabled={!bridgeOnline}>
                <Clock size={12}/> Sync Time
              </Button>
              <Button size="sm" variant="secondary" onClick={voiceTest} loading={busy==='voice'} disabled={!bridgeOnline}>
                <Volume2 size={12}/> Voice Test
              </Button>
              <Button size="sm" variant="secondary" onClick={fetchInfo} loading={loadInfo}>
                <BarChart2 size={12}/> Refresh Info
              </Button>
              {info?.deviceStatus === 'online' ? (
                <Button size="sm" variant="secondary" onClick={disconnectDev} loading={busy==='disconnect'} disabled={!bridgeOnline}>
                  <WifiOff size={12}/> Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={connectDev} loading={busy==='connect'} disabled={!bridgeOnline}>
                  <Wifi size={12}/> Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:12, borderTop:'1px solid var(--border)' }}>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}

// ── Edit Device Modal ─────────────────────────────────────────────────────────
function EditDeviceModal({ open, onClose, dev, orgId, onSaved }) {
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && dev) setForm({ name: dev.name||'', ip: dev.ip||'', port: dev.port||4370, model: dev.model||'', location: dev.location||'' })
  }, [open, dev])

  const sf = k => e => setForm(f => ({...f, [k]: e.target.value}))

  async function save() {
    if (!form.ip?.trim()) return toast('IP address is required', 'error')
    setBusy(true)
    try {
      await api.patch(`/admin/orgs/${orgId}/devices/${dev.deviceId}`, { ...form, port: Number(form.port)||4370 })
      toast('Device updated', 'success'); onSaved(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Device" size="md">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Input label="Device Name *" value={form.name||''} onChange={sf('name')} placeholder="Main Gate"/></div>
        <Input label="IP Address *"  value={form.ip||''}       onChange={sf('ip')}       placeholder="192.168.1.201"/>
        <Input label="Port"          value={form.port||''}     onChange={sf('port')}     placeholder="4370" type="number"/>
        <Input label="Model"         value={form.model||''}    onChange={sf('model')}    placeholder="ZKTeco K40"/>
        <Input label="Location"      value={form.location||''} onChange={sf('location')} placeholder="Ground Floor, Block A"/>
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save Changes</Button>
      </div>
    </Modal>
  )
}

// ── Add Device Modal ──────────────────────────────────────────────────────────
function AddDeviceModal({ open, onClose, orgId, onSaved }) {
  const [form, setForm] = useState({ name:'', ip:'', port:4370, model:'', location:'' })
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => { if (open) setForm({ name:'', ip:'', port:4370, model:'', location:'' }) }, [open])

  const sf = k => e => setForm(f => ({...f, [k]: e.target.value}))

  async function save() {
    if (!form.ip?.trim()) return toast('IP address is required', 'error')
    setBusy(true)
    try {
      await api.post(`/admin/orgs/${orgId}/devices`, { ...form, port: Number(form.port)||4370 })
      toast('Device added', 'success'); onSaved(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Device" size="md">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Input label="Device Name" value={form.name} onChange={sf('name')} placeholder="Main Gate"/></div>
        <Input label="IP Address *" value={form.ip}       onChange={sf('ip')}       placeholder="192.168.1.201"/>
        <Input label="Port"         value={form.port}     onChange={sf('port')}     placeholder="4370" type="number"/>
        <Input label="Model"        value={form.model}    onChange={sf('model')}    placeholder="ZKTeco K40"/>
        <Input label="Location"     value={form.location} onChange={sf('location')} placeholder="Ground Floor, Block A"/>
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Add Device</Button>
      </div>
    </Modal>
  )
}

// ── Device Row ────────────────────────────────────────────────────────────────
function DeviceRow({ dev, orgId, isAdmin, onRefresh }) {
  const { toast } = useToast()
  const [busy,       setBusy]     = useState(false)
  const [showCtrl,   setShowCtrl] = useState(false)
  const [showEdit,   setShowEdit] = useState(false)
  const [delConfirm, setDelConf]  = useState(false)

  async function act(fn) { setBusy(true); try { await fn() } catch(e) { toast(e.message,'error') } finally { setBusy(false) } }

  // Bridge = websocket connection alive. Device = enabled in config.
  // A device can only receive data when BOTH bridge is online AND device is enabled.
  const bridgeOnline = !!dev.bridgeOnline
  const devEnabled   = !!dev.enabled
  const fullyLive    = bridgeOnline && devEnabled

  return (
    <>
      <div style={{ borderRadius:12, border:`1px solid ${fullyLive ? 'rgba(52,211,153,.2)' : devEnabled ? 'rgba(251,146,60,.2)' : 'var(--border)'}`,
        background: fullyLive ? 'rgba(52,211,153,.04)' : 'var(--bg-surface2)', overflow:'hidden', transition:'all .2s',
        animation: fullyLive ? 'glow-green 3s ease-in-out infinite' : 'none' }}>

        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px' }}>

          {/* Device icon — visual state at a glance */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <div style={{ width:42, height:42, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center',
              background: fullyLive ? 'rgba(52,211,153,.1)' : devEnabled ? 'rgba(251,146,60,.08)' : 'var(--bg-surface2)',
              border:`1.5px solid ${fullyLive ? 'rgba(52,211,153,.3)' : devEnabled ? 'rgba(251,146,60,.25)' : 'var(--border)'}` }}>
              <Cpu size={17} style={{ color: fullyLive ? '#34d399' : devEnabled ? '#fb923c' : '#4a4a68' }}/>
            </div>
            {/* Status dot — green pulsing = live, orange = enabled but bridge down, red = disabled */}
            {fullyLive && <div style={{ position:'absolute', bottom:-2, right:-2, width:10, height:10, borderRadius:'50%', background:'rgba(52,211,153,.4)', animation:'pulse-ring 2s ease-out infinite' }}/>}
            <div style={{ position:'absolute', bottom:-2, right:-2, width:10, height:10, borderRadius:'50%', border:'2px solid var(--bg-surface)',
              background: fullyLive ? '#34d399' : devEnabled ? '#fb923c' : '#4a4a68',
              animation: fullyLive ? 'pulse-dot 2s ease-in-out infinite' : devEnabled ? 'offline-blink 2.5s ease-in-out infinite' : 'none' }}/>
          </div>

          {/* Info */}
          <div style={{ flex:1, minWidth:0 }}>
            {/* Name + model */}
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5, flexWrap:'wrap' }}>
              <p style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)' }}>{dev.name}</p>
              {dev.model && <span style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-muted)', background:'var(--bg-surface2)', padding:'1px 7px', borderRadius:6, border:'1px solid var(--border)' }}>{dev.model}</span>}
              {dev.location && <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>· 📍 {dev.location}</span>}
            </div>

            {/* Status pills — bridge + device, clearly separate */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {/* Bridge status pill */}
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'0.72rem', fontWeight:700,
                padding:'3px 9px', borderRadius:99,
                background: bridgeOnline ? 'rgba(52,211,153,.1)' : 'rgba(90,90,122,.12)',
                border:`1px solid ${bridgeOnline ? 'rgba(52,211,153,.3)' : 'rgba(90,90,122,.3)'}`,
                color: bridgeOnline ? '#34d399' : '#6a6a98' }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background: bridgeOnline ? '#34d399' : '#5a5a7a', flexShrink:0,
                  animation: bridgeOnline ? 'pulse-dot 2s ease-in-out infinite' : 'offline-blink 3s ease-in-out infinite' }}/>
                Bridge {bridgeOnline ? 'Online' : 'Offline'}
              </span>
              {/* Device status pill */}
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'0.72rem', fontWeight:700,
                padding:'3px 9px', borderRadius:99,
                background: devEnabled ? 'rgba(88,166,255,.1)' : 'rgba(248,113,113,.08)',
                border:`1px solid ${devEnabled ? 'rgba(88,166,255,.25)' : 'rgba(248,113,113,.2)'}`,
                color: devEnabled ? '#58a6ff' : '#f87171' }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background: devEnabled ? '#58a6ff' : '#f87171', flexShrink:0 }}/>
                Device {devEnabled ? 'Enabled' : 'Disabled'}
              </span>
              {/* Combined warning */}
              {devEnabled && !bridgeOnline && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'0.72rem', fontWeight:700,
                  padding:'3px 9px', borderRadius:99,
                  background:'rgba(251,146,60,.1)', border:'1px solid rgba(251,146,60,.25)', color:'#fb923c',
                  animation:'offline-blink 2.5s ease-in-out infinite' }}>
                  ⚠ No Data — Bridge Down
                </span>
              )}
              {/* IP */}
              {dev.ip && <span style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-dim)', padding:'3px 8px', borderRadius:99, background:'var(--bg-surface2)', border:'1px solid var(--border-soft)' }}>🌐 {dev.ip}:{dev.port}</span>}
            </div>

          </div>

          {/* Actions — grouped by purpose */}
          <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0, alignItems:'flex-end' }}>
            {/* Data ops */}
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              <ActionBtn label="Sync"         icon={RotateCcw} disabled={busy} color="var(--text-muted)" hoverColor="#58a6ff"
                onClick={() => act(() => api.post(`/admin/orgs/${orgId}/devices/${dev.deviceId}/sync`).then(() => toast('Sync triggered','success')))}/>
              <ActionBtn label="Device Control" icon={BarChart2} disabled={busy} color="var(--text-muted)" hoverColor="#facc15"
                onClick={() => setShowCtrl(true)}/>
              <ActionBtn label="Push Config" icon={Zap}        disabled={busy} color="var(--text-muted)" hoverColor="#c084fc"
                onClick={() => act(() => api.post(`/admin/orgs/${orgId}/devices/${dev.deviceId}/push-config`).then(() => toast('Config pushed','success')))}/>
            </div>
            {/* Edit + Power + danger */}
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              {isAdmin && <ActionBtn label="Edit" icon={Edit3} disabled={busy} color="var(--text-muted)" hoverColor="#facc15" onClick={() => setShowEdit(true)}/>}
              <ActionBtn label={devEnabled ? 'Disable' : 'Enable'} icon={devEnabled ? PowerOff : Power}
                disabled={busy} color="var(--text-muted)" hoverColor={devEnabled ? '#f87171' : '#34d399'} danger={devEnabled}
                onClick={() => act(() => api.patch(`/admin/orgs/${orgId}/devices/${dev.deviceId}/enabled`, { enabled: !devEnabled }).then(() => onRefresh()))}/>
              {isAdmin && <ActionBtn label="Delete" icon={Trash2} danger color="var(--text-muted)" onClick={() => setDelConf(true)}/>}
            </div>
          </div>

        </div>
      </div>
      <AdminDeviceControlModal open={showCtrl} onClose={() => setShowCtrl(false)} dev={dev} orgId={orgId} onRefresh={onRefresh}/>
      <EditDeviceModal open={showEdit} onClose={() => setShowEdit(false)} dev={dev} orgId={orgId}
        onSaved={onRefresh}/>
      <ConfirmModal open={delConfirm} onClose={() => setDelConf(false)}
        title="Delete Device" danger
        message={`Delete "${dev.name}"? All its machine users will also be removed.`}
        onConfirm={() => act(() => api.delete(`/admin/orgs/${orgId}/devices/${dev.deviceId}`).then(() => { onRefresh(); setDelConf(false) }))}
        loading={busy}/>
    </>
  )
}


// ── Bridge Credentials Modal ──────────────────────────────────────────────────
function BridgeCredModal({ info, onClose }) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState({})

  function copy(label, value) {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(p => ({...p, [label]:true}))
      setTimeout(() => setCopied(p => ({...p, [label]:false})), 2000)
      toast(`${label} copied!`, 'success')
    })
  }

  const fields = [
    { icon:Key,    label:'Bridge ID',           value:info.bridgeId },
    { icon:Wifi,   label:'WebSocket Server URL', value:info.wsUrl    },
    { icon:Globe,  label:'Server API URL',       value:info.apiUrl   },
    { icon:Shield, label:'WebSocket Secret',     value:info.wsSecret, secret:true },
  ]

  return (
    <Modal open={true} onClose={onClose} title={null} size="md" noBodyPad>
      <div style={{ padding:'28px 28px 24px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:22 }}>
          <div style={{ width:52, height:52, borderRadius:15, flexShrink:0,
            background:'rgba(52,211,153,.1)', border:'1px solid rgba(52,211,153,.25)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <CheckCircle2 size={26} style={{ color:'#16a34a' }}/>
          </div>
          <div style={{ flex:1 }}>
            <h3 style={{ fontSize:'1.25rem', fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.02em', marginBottom:4 }}>
              Bridge Credentials
            </h3>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', lineHeight:1.6 }}>
              Share these with the user to configure the Bridge desktop app.
            </p>
          </div>
          <button onClick={onClose}
            style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border)',
              background:'var(--bg-surface2)', display:'flex', alignItems:'center',
              justifyContent:'center', cursor:'pointer', color:'var(--text-muted)', flexShrink:0 }}
            onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-elevated)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface2)'}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {fields.map(f => {
            const isCopied = copied[f.label]
            return (
              <div key={f.label}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <f.icon size={12} style={{ color:'var(--text-dim)' }}/>
                  <span style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)',
                    textTransform:'uppercase', letterSpacing:'0.08em' }}>{f.label}</span>
                </div>
                <div style={{ display:'flex', border:'1.5px solid var(--border)', borderRadius:10,
                  background:'var(--bg-input)', overflow:'hidden' }}>
                  <span style={{ flex:1, padding:'10px 13px', fontSize:'0.875rem', fontFamily:'monospace',
                    color:f.value?'var(--text-primary)':'var(--text-dim)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', userSelect:'all' }}>
                    {f.value
                      ? (f.secret && !copied['show_'+f.label] ? '•'.repeat(Math.min(f.value.length,28)) : f.value)
                      : '— not configured —'}
                  </span>
                  {f.secret && f.value && (
                    <button onClick={()=>setCopied(p=>({...p,['show_'+f.label]:!p['show_'+f.label]}))}
                      style={{ padding:'0 11px', background:'none', border:'none',
                        borderLeft:'1px solid var(--border)', cursor:'pointer',
                        color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
                      <ChevronDown size={13} style={{ transform:copied['show_'+f.label]?'rotate(180deg)':'none', transition:'transform .2s' }}/>
                    </button>
                  )}
                  <button onClick={()=>copy(f.label, f.value)} disabled={!f.value}
                    style={{ padding:'0 14px', background:isCopied?'rgba(52,211,153,.1)':'transparent',
                      border:'none', borderLeft:'1px solid var(--border)',
                      cursor:f.value?'pointer':'not-allowed',
                      color:isCopied?'#16a34a':'var(--text-muted)',
                      display:'flex', alignItems:'center', gap:5,
                      fontSize:'0.8rem', fontWeight:600, transition:'all .2s',
                      whiteSpace:'nowrap', minWidth:72 }}>
                    {isCopied ? <><CheckCircle2 size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding:'12px 14px', borderRadius:10, background:'var(--accent-muted)',
          border:'1px solid var(--accent-border)', marginBottom:18 }}>
          <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', lineHeight:1.65 }}>
            User opens Bridge app → <strong style={{ color:'var(--text-primary)' }}>Configure</strong> → pastes all 4 values → 
            <strong style={{ color:'var(--text-primary)' }}> Connect</strong>. Status turns green when live.
          </p>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>copy('All Credentials',
            `Bridge ID: ${info.bridgeId}\nWebSocket URL: ${info.wsUrl}\nAPI URL: ${info.apiUrl}\nWS Secret: ${info.wsSecret}`)}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid var(--border)',
              background:'var(--bg-surface2)', color:'var(--text-secondary)', fontWeight:700,
              fontSize:'0.875rem', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', gap:7, transition:'all .15s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-bright)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)'}}>
            <Copy size={14}/> Copy All
          </button>
          <button onClick={onClose}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'none',
              background:'var(--accent)', color:'#fff', fontWeight:800,
              fontSize:'0.875rem', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', gap:7, boxShadow:'0 4px 14px var(--accent-muted)' }}>
            <CheckCircle2 size={14}/> Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Control Group ─────────────────────────────────────────────────────────────
function ControlGroup({ label, accent, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <span style={{
        fontSize:'0.625rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em',
        color: accent || 'var(--text-dim)', paddingLeft:2, lineHeight:1,
      }}>
        {label}
      </span>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
        {children}
      </div>
    </div>
  )
}

// ── Org Row ───────────────────────────────────────────────────────────────────
function OrgRow({ org: initOrg, isAdmin, onRefresh }) {
  const { toast } = useToast()
  const [org,        setOrg]      = useState(initOrg)
  const [expanded,   setExpanded] = useState(false)
  const [devices,    setDevices]  = useState([])
  const [loadDev,    setLoadDev]  = useState(false)
  const [busy,       setBusy]     = useState(false)
  const [showStats,  setStats]    = useState(false)
  const [showEdit,   setEdit]     = useState(false)
  const [showMU,     setMU]       = useState(false)
  const [suspModal,  setSuspModal]= useState(false)
  const [suspReason, setSuspReason]=useState('')
  const [delConfirm, setDelConf]  = useState(false)
  const [bridgeCred, setBridgeCred]= useState(null)   // show credentials modal
  const [showBridgeConnect, setShowBridgeConnect] = useState(false)
  const [showAddDevice,    setShowAddDevice]     = useState(false)
  const [connectBridgeId, setConnectBridgeId] = useState('')

  useEffect(() => { setOrg(initOrg) }, [initOrg])

  async function loadDevices() {
    setLoadDev(true)
    try { const r = await api.get(`/admin/orgs/${org.orgId}/devices`); setDevices(r.data||[]) }
    catch {} finally { setLoadDev(false) }
  }

  function toggle() { setExpanded(v=>!v); if (!expanded) loadDevices() }

  async function createBridge() {
    setBusy(true)
    try {
      const r = await api.post(`/admin/orgs/${org.orgId}/bridge/create`, { name:`${org.name} Bridge` })
      toast('Bridge created!', 'success')
      const cfg = await api.get(`/admin/orgs/${org.orgId}/bridge-config`).catch(()=>null)
      const data = cfg?.data || cfg || {}
      setBridgeCred({ bridgeId:r.data.bridgeId, wsUrl:data.wsUrl||'', apiUrl:data.apiUrl||'', wsSecret:data.wsSecret||'' })
      onRefresh()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function connectBridge() {
    if (!connectBridgeId.trim()) return toast('Enter a Bridge ID', 'error')
    setBusy(true)
    try {
      await api.post(`/admin/orgs/${org.orgId}/bridge/connect`, { bridgeId:connectBridgeId.trim() })
      toast('Bridge connected!', 'success'); setShowBridgeConnect(false); setConnectBridgeId(''); onRefresh()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function showCredentials() {
    setBusy(true)
    try {
      const cfg = await api.get(`/admin/orgs/${org.orgId}/bridge-config`)
      const data = cfg?.data || cfg || {}
      setBridgeCred({ bridgeId:org.bridgeId, wsUrl:data.wsUrl||'', apiUrl:data.apiUrl||'', wsSecret:data.wsSecret||'' })
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function act(fn, successMsg) {
    setBusy(true)
    try { await fn(); if (successMsg) toast(successMsg, 'success'); onRefresh() }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const online = org.bridgeOnline || org.online

  const statusColor = !org.isActive ? '#f87171' : online ? '#34d399' : org.bridgeId ? '#5a5a7a' : '#fb923c'
  const statusLabel = !org.isActive ? 'Suspended' : online ? 'Online' : org.bridgeId ? 'Offline' : 'No Bridge'
  const statusIcon  = !org.isActive ? '⏸' : online ? '●' : org.bridgeId ? '○' : '!'

  return (
    <motion.div layout style={{
      background:'var(--bg-surface)', borderRadius:16, overflow:'hidden',
      border:`1px solid ${!org.isActive ? 'rgba(248,113,113,.2)' : 'var(--border)'}`,
      boxShadow: online ? '0 0 0 1px rgba(52,211,153,.08)' : '0 2px 12px rgba(0,0,0,.3)',
      transition:'box-shadow .2s, border-color .2s',
    }}>
      {/* Top accent bar — status color */}
      <div style={{ height:2, background:`linear-gradient(90deg,${statusColor}80,transparent)` }}/>

      <div style={{ padding:'14px 18px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>

          {/* Logo */}
          <div style={{ width:46, height:46, borderRadius:12, overflow:'hidden', flexShrink:0,
            background:`${statusColor}10`, border:`1.5px solid ${statusColor}30`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.375rem' }}>
            {org.logoUrl ? <img src={org.logoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : '🏢'}
          </div>

          {/* Main info */}
          <div style={{ flex:1, minWidth:0 }}>
            {/* Row 1: name + status badge */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
              <p style={{ fontSize:'1.0625rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>{org.name}</p>
              <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'2px 9px', borderRadius:99,
                background:`${statusColor}14`, color:statusColor, border:`1px solid ${statusColor}30`,
                display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:statusColor, display:'inline-block', flexShrink:0,
                  animation: (!org.isActive) ? 'offline-blink 3s ease-in-out infinite'
                            : online         ? 'pulse-dot 2s ease-in-out infinite'
                            : org.bridgeId   ? 'offline-blink 3s ease-in-out infinite'
                            : 'none' }}/>
                {statusLabel}
              </span>
              {!org.isActive && <span style={{ fontSize:'0.72rem', color:'#f87171', fontWeight:600 }}>⚠ Access restricted</span>}
            </div>

            {/* Row 2: meta chips */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
              {org.city && (
                <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4 }}>
                  📍 {org.city}{org.industry ? ` · ${org.industry}` : ''}
                </span>
              )}
              <span style={{ fontSize:'0.78rem', fontFamily:'monospace', color:'var(--text-dim)', background:'var(--bg-surface2)', padding:'2px 8px', borderRadius:6, border:'1px solid var(--border-soft)' }}>
                {org.orgId}
              </span>
              {org.ownerId && (
                <span style={{ fontSize:'0.78rem', fontFamily:'monospace', color:'var(--text-dim)', display:'flex', alignItems:'center', gap:4 }}>
                  👤 {org.ownerId.slice(-8)}
                </span>
              )}
            </div>

            {/* Row 3: bridge + devices info strip */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {org.bridgeId ? (
                <div style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 11px', borderRadius:9,
                  background: online ? 'rgba(52,211,153,.07)' : 'var(--bg-surface2)',
                  border:`1px solid ${online ? 'rgba(52,211,153,.25)' : 'rgba(90,90,122,.2)'}` }}>
                  <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {online && <div style={{ position:'absolute', width:8, height:8, borderRadius:'50%', background:'rgba(52,211,153,.4)', animation:'pulse-ring 2s ease-out infinite' }}/>}
                    <div style={{ width:8, height:8, borderRadius:'50%', background: online ? '#34d399' : '#5a5a7a',
                      animation: online ? 'pulse-dot 2s ease-in-out infinite' : 'offline-blink 3s ease-in-out infinite' }}/>
                  </div>
                  <div>
                    <p style={{ fontSize:'0.78rem', fontWeight:700, color: online ? '#34d399' : '#6a6a98', lineHeight:1.2 }}>
                      Bridge {online ? 'Online' : 'Offline'}
                    </p>
                    <p style={{ fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-dim)', lineHeight:1.2 }}>{org.bridgeName || org.bridgeId?.slice(-8)}</p>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 11px', borderRadius:9, background:'rgba(217,119,6,.06)', border:'1px solid rgba(217,119,6,.2)' }}>
                  <Server size={11} style={{ color:'#fb923c' }}/>
                  <span style={{ fontSize:'0.78rem', fontWeight:700, color:'#fb923c' }}>No Bridge</span>
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:8,
                background:'var(--bg-surface2)', border:'1px solid var(--border-soft)' }}>
                <Cpu size={11} style={{ color:'var(--text-muted)' }}/>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{org.deviceCount||0} device{org.deviceCount!==1?'s':''}</span>
              </div>
            </div>
          </div>

        </div>{/* end logo + info row */}

        {/* ── Control Groups ── */}
        <div style={{
          marginTop:14, paddingTop:12, borderTop:'1px solid var(--border)',
          display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-start',
        }}>

          {/* ── Organization ── */}
          <ControlGroup label="Organization">
            <ActionBtn label="Stats"         icon={BarChart2}  onClick={() => setStats(true)} color="var(--text-muted)" hoverColor="#58a6ff"/>
            <ActionBtn label="Edit"          icon={Edit3}       onClick={() => setEdit(true)}  color="var(--text-muted)" hoverColor="#facc15"/>
            <ActionBtn label="Machine Users" icon={Fingerprint} onClick={() => setMU(true)}    color="var(--text-muted)" hoverColor="#c084fc"/>
            <ActionBtn
              label={org.isActive ? 'Suspend' : 'Activate'}
              icon={org.isActive ? ShieldOff : ShieldCheck}
              onClick={() => org.isActive ? setSuspModal(true) : act(() => api.patch(`/admin/orgs/${org.orgId}/status`, {isActive:true}), 'Activated')}
              disabled={busy} color="var(--text-muted)"
              hoverColor={org.isActive ? '#f87171' : '#34d399'}
              danger={!!org.isActive}/>
            {isAdmin && <ActionBtn label="Delete" icon={Trash2} onClick={() => setDelConf(true)} color="var(--text-muted)" danger/>}
          </ControlGroup>

          {/* ── Bridge ── */}
          <ControlGroup label="Bridge" accent={online ? '#34d399' : undefined}>
            {!org.bridgeId && isAdmin && <>
              <ActionBtn label="Create Bridge"  icon={Plus}  onClick={createBridge}                    disabled={busy} color="var(--text-muted)" hoverColor="#34d399"/>
              <ActionBtn label="Connect Bridge" icon={Link2} onClick={() => setShowBridgeConnect(true)} disabled={busy} color="var(--text-muted)" hoverColor="#58a6ff"/>
            </>}
            {!org.bridgeId && !isAdmin && (
              <span style={{ fontSize:'0.75rem', color:'var(--text-dim)', padding:'5px 4px', fontStyle:'italic' }}>No bridge assigned</span>
            )}
            {org.bridgeId && <>
              <ActionBtn label="Credentials" icon={Key}       onClick={showCredentials}                                                                                       disabled={busy} color="var(--text-muted)" hoverColor="#facc15"/>
              {isAdmin && <>
                <ActionBtn label="Sync All"   icon={RotateCcw} onClick={() => act(() => api.post(`/admin/orgs/${org.orgId}/bridges/${org.bridgeId}/sync-all`), 'Sync All triggered ✓')} disabled={busy} color="var(--text-muted)" hoverColor="#58a6ff"/>
                <ActionBtn label="Restart"    icon={RotateCcw} onClick={() => act(() => api.post(`/admin/orgs/${org.orgId}/bridge/restart`), 'Bridge restarted')}                        disabled={busy} color="var(--text-muted)" hoverColor="#fb923c"/>
                <ActionBtn label="Disconnect" icon={WifiOff}   onClick={() => act(() => api.post(`/admin/orgs/${org.orgId}/bridge/disconnect`), 'Bridge disconnected')}                  disabled={busy} color="var(--text-muted)" hoverColor="#f87171"/>
              </>}
            </>}
          </ControlGroup>

          {/* ── Devices toggle ── */}
          <div style={{ marginLeft:'auto' }}>
            <ControlGroup label="Devices">
              <ActionBtn
                label={expanded ? 'Hide Devices' : `View Devices (${org.deviceCount||0})`}
                icon={expanded ? ChevronUp : ChevronDown}
                onClick={toggle}
                color={expanded ? '#58a6ff' : 'var(--text-muted)'}
                hoverColor="#58a6ff"/>
            </ControlGroup>
          </div>

        </div>
      </div>

      {/* Expanded devices */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }}
            exit={{ height:0, opacity:0 }} style={{ overflow:'hidden', borderTop:'1px solid var(--border)' }}>
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <Cpu size={13} style={{ color:'var(--text-dim)' }}/>
                <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Biometric Devices</p>
                <span style={{ fontSize:'0.72rem', color:'var(--text-dim)', background:'var(--bg-input)', padding:'1px 7px', borderRadius:99, border:'1px solid var(--border-soft)', fontFamily:'monospace' }}>
                  {devices.length}
                </span>
                {isAdmin && org.bridgeId && (
                  <ActionBtn label="Add Device" icon={Plus} onClick={() => setShowAddDevice(true)}
                    color="var(--text-muted)" hoverColor="#34d399" style={{ marginLeft:4 }}/>
                )}
              </div>
              {loadDev ? [1,2].map(i=><div key={i} className="h-12 shimmer rounded-lg"/>) :
               devices.length === 0 ? <p style={{ fontSize:'0.875rem', color:'var(--text-dim)', textAlign:'center', padding:'1rem' }}>No devices registered</p> :
               devices.map(d => <DeviceRow key={d.deviceId} dev={d} orgId={org.orgId} isAdmin={isAdmin} onRefresh={loadDevices}/>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      {bridgeCred && <BridgeCredModal info={bridgeCred} onClose={() => setBridgeCred(null)}/>}
      <AddDeviceModal open={showAddDevice} onClose={() => setShowAddDevice(false)} orgId={org.orgId}
        onSaved={loadDevices}/>

      {/* Connect existing bridge ID */}
      <Modal open={showBridgeConnect} onClose={() => setShowBridgeConnect(false)}
        title="Connect Bridge" description="Link an existing bridge ID to this organization" size="sm">
        <Input label="Bridge ID" value={connectBridgeId}
          onChange={e => setConnectBridgeId(e.target.value)}
          placeholder="br-xxxxxxxx"
          onKeyDown={e => e.key === 'Enter' && connectBridge()}/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:12, borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={() => setShowBridgeConnect(false)}>Cancel</Button>
          <Button onClick={connectBridge} loading={busy}>Connect</Button>
        </div>
      </Modal>

      <OrgStatsModal  open={showStats} onClose={() => setStats(false)} orgId={org.orgId}/>
      <EditOrgModal   open={showEdit}  onClose={() => setEdit(false)}  org={org} onSaved={() => { onRefresh() }}/>
      <MachineUsersModal open={showMU} onClose={() => setMU(false)}    orgId={org.orgId}/>

      <Modal open={suspModal} onClose={() => setSuspModal(false)} title="Suspend Organization" size="sm">
        <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', marginBottom:12 }}>Suspend <strong style={{ color:'var(--text-primary)' }}>{org.name}</strong>? Users lose access.</p>
        <Input label="Reason (optional)" value={suspReason} onChange={e => setSuspReason(e.target.value)} placeholder="Policy violation, payment issue…"/>
        <div className="flex justify-end gap-2 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={() => setSuspModal(false)}>Cancel</Button>
          <Button onClick={() => act(() => api.patch(`/admin/orgs/${org.orgId}/status`, { isActive: false, reason: suspReason }), 'Suspended').then(() => setSuspModal(false))} loading={busy}
            style={{ background:'#ef4444', color:'#fff' }}>Suspend</Button>
        </div>
      </Modal>

      <ConfirmModal open={delConfirm} onClose={() => setDelConf(false)} danger
        title="Delete Organization"
        message={`Delete "${org.name}" permanently? All devices, machine users and bridge records will be removed.`}
        onConfirm={() => act(() => api.delete(`/admin/orgs/${org.orgId}`), 'Organization deleted').then(() => setDelConf(false))}
        loading={busy}/>
    </motion.div>
  )
}

// Labelled action button
function ActionBtn({ label, icon: Icon, onClick, color, hoverColor, danger, disabled, title }) {
  const [hover, setHover] = React.useState(false)
  const base = color || 'var(--text-muted)'
  const hc   = danger ? '#f87171' : (hoverColor || 'var(--accent)')
  return (
    <button onClick={onClick} disabled={disabled} title={title||label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display:'inline-flex', alignItems:'center', gap:5,
        padding:'5px 10px', borderRadius:8,
        border:`1px solid ${hover ? (danger?'rgba(248,113,113,.3)':'var(--accent-border)') : 'var(--border)'}`,
        background: hover ? (danger?'rgba(248,113,113,.08)':'var(--accent-muted)') : 'transparent',
        color: hover ? hc : base,
        fontSize:'0.8125rem', fontWeight:500, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, transition:'all .15s', whiteSpace:'nowrap', flexShrink:0,
      }}>
      <Icon size={13}/>
      {label}
    </button>
  )
}

const iconBtn = { padding:6, borderRadius:6, background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', gap:3, fontSize:'0.75rem', transition:'color .15s' }

// ── Main Page ─────────────────────────────────────────────────────────────────
// Inject pulse/glow CSS once
if (typeof document !== 'undefined' && !document.getElementById('org-fx')) {
  const s = document.createElement('style'); s.id = 'org-fx'
  s.textContent = `
    @keyframes pulse-ring {
      0%   { transform:scale(1);   opacity:.8 }
      70%  { transform:scale(2.2); opacity:0  }
      100% { transform:scale(2.2); opacity:0  }
    }
    @keyframes pulse-dot {
      0%,100% { opacity:1 }
      50%     { opacity:.5 }
    }
    @keyframes offline-blink {
      0%,100% { opacity:.4 }
      50%     { opacity:.75 }
    }
    @keyframes glow-green {
      0%,100% { box-shadow: 0 0 6px 0px rgba(52,211,153,.5) }
      50%     { box-shadow: 0 0 16px 4px rgba(52,211,153,.2) }
    }
    @keyframes glow-red {
      0%,100% { box-shadow: 0 0 4px 0px rgba(248,113,113,.35) }
      50%     { box-shadow: 0 0 12px 3px rgba(248,113,113,.12) }
    }
  `
  document.head.appendChild(s)
}

export default function AdminOrganizations() {
  const { user, ready } = useAuth()
  const { toast } = useToast()
  const isAdmin = user?.role === 'admin'

  const [orgs,    setOrgs]   = useState([])
  const [loading, setLoad]   = useState(true)
  const [q,       setQ]      = useState('')
  const [filter,  setFilter] = useState('all')
  const [stats,   setStats]  = useState({ total:0, active:0, offline:0, noBridge:0 })

  async function load() {
    setLoad(true)
    try {
      const params = new URLSearchParams({ limit: 200 })
      if (q)                       params.set('q', q)
      if (filter === 'active')     params.set('isActive', 'true')
      if (filter === 'suspended')  params.set('isActive', 'false')
      const r = await api.get(`/admin/orgs?${params}`)
      let data = r.data || []
      if (filter === 'no-bridge')  data = data.filter(o => !o.bridgeId)
      if (filter === 'offline')    data = data.filter(o => o.bridgeId && !o.online && !o.bridgeOnline)
      setOrgs(data)
      // Compute stats from full unfiltered load
      const all = r.data || []
      setStats({
        total:    r.total || all.length,
        active:   all.filter(o => o.isActive).length,
        offline:  all.filter(o => o.bridgeId && !o.online && !o.bridgeOnline).length,
        noBridge: all.filter(o => !o.bridgeId).length,
        online:   all.filter(o => o.online || o.bridgeOnline).length,
      })
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready) load() }, [ready, filter])

  const FILTERS = [
    { id:'all',       label:'All',           count: stats.total    },
    { id:'active',    label:'Active',        count: stats.active   },
    { id:'suspended', label:'Suspended',     count: stats.total - stats.active },
    { id:'offline',   label:'Bridge Offline',count: stats.offline  },
    { id:'no-bridge', label:'No Bridge',     count: stats.noBridge },
  ]

  return (
    <div style={{ padding:'clamp(1rem, 4vw, 2.5rem)', maxWidth:1300, margin:'0 auto', display:'flex', flexDirection:'column', gap:'clamp(1rem, 3vw, 2rem)' }}>

      {/* Header */}
      <PageHeader title="Organizations" icon={Building2} iconColor="#58a6ff"
        subtitle={`${stats.total} total · ${stats.online||0} online · ${stats.offline} offline · ${stats.noBridge} no bridge`}>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={13}/></Button>
      </PageHeader>

      {/* Stat cards — same style as Users & Tickets */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
        {[
          { id:'all',       label:'Total',          value: stats.total,                    accent:'#58a6ff', icon: Building2  },
          { id:'active',    label:'Active',          value: stats.active,                   accent:'#34d399', icon: ShieldCheck },
          { id:'suspended', label:'Suspended',       value: stats.total - stats.active,     accent:'#f87171', icon: ShieldOff  },
          { id:'online',    label:'Bridge Online',   value: stats.online || 0,              accent:'#34d399', icon: Wifi       },
          { id:'offline',   label:'Bridge Offline',  value: stats.offline,                  accent:'#fb923c', icon: WifiOff    },
          { id:'no-bridge', label:'No Bridge',       value: stats.noBridge,                 accent:'#5a5a7a', icon: Server     },
        ].map((s, i) => (
          <StatCard key={s.id} label={s.label} value={s.value} icon={s.icon} accent={s.accent} index={i}
            active={filter === s.id} onClick={() => setFilter(filter === s.id ? 'all' : s.id)}/>
        ))}
      </div>

      {/* Search */}
      <SearchBox value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, org ID, city, bridge…"/>

      {/* List */}
      {loading ? (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>{[1,2,3].map(i=><div key={i} className="h-24 shimmer rounded-xl"/>)}</div>
      ) : orgs.length === 0 ? (
        <div className="card"><Empty icon={Building2} title="No organizations found" description="Try adjusting filters or search query."/></div>
      ) : (
        <motion.div layout style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {orgs.map(org => <OrgRow key={org.orgId} org={org} isAdmin={isAdmin} onRefresh={load}/>)}
        </motion.div>
      )}
    </div>
  )
}
