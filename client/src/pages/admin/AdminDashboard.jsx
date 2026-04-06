import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, CreditCard, Plug, Building2, Activity, Server,
  Cpu, RefreshCw, ArrowRight, CheckCircle2, XCircle,
  AlertTriangle, Clock, UserCheck, TrendingUp, Fingerprint,
  HardDrive, Zap, Shield, Wifi, WifiOff, Database, Ticket
} from 'lucide-react'
import { useAuth } from '../../store/auth'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent, index = 0, to }) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'relative overflow-hidden rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200',
        to && 'cursor-pointer hover:scale-[1.02]'
      )}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid var(--border)`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Accent glow top-right */}
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: accent, opacity: 0.08, filter: 'blur(20px)',
        pointerEvents: 'none',
      }}/>

      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `${accent}18`, border: `1px solid ${accent}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} style={{ color: accent }} />
      </div>

      {/* Value */}
      <div>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em' }}>
          {value ?? <span style={{ color: 'var(--text-dim)' }}>—</span>}
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </p>
        {sub && <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 3 }}>{sub}</p>}
      </div>
    </motion.div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, accent = '#58a6ff', action, children }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 20,
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={14} style={{ color: accent }}/>
          </div>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────
function Pill({ ok, label, pulse }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 99,
      background: ok ? 'rgba(52,211,153,.1)' : 'rgba(248,113,113,.1)',
      border: `1px solid ${ok ? 'rgba(52,211,153,.2)' : 'rgba(248,113,113,.2)'}`,
      fontSize: '0.8rem', fontWeight: 600, color: ok ? '#34d399' : '#f87171',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? '#34d399' : '#f87171', animation: pulse && ok ? 'pulse 2s infinite' : 'none' }}/>
      {label}
    </span>
  )
}

// ── Bar ───────────────────────────────────────────────────────────────────────
function Bar({ used, total, color }) {
  const pct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0
  const c = pct > 90 ? '#f87171' : pct > 70 ? '#fb923c' : color
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-surface2)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 99, background: c }}
        />
      </div>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── Metric row ────────────────────────────────────────────────────────────────
function MetricRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: highlight || '#c8c8e0', fontFamily: 'monospace' }}>{value ?? '—'}</span>
    </div>
  )
}

// ── Link arrow button ─────────────────────────────────────────────────────────
function LinkBtn({ to, label }) {
  return (
    <Link to={to} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
      {label} <ArrowRight size={13}/>
    </Link>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, ready } = useAuth()
  const { toast }       = useToast()
  const [d, setD]       = useState(null)
  const [loading, setL] = useState(true)
  const [lastRef, setLR]= useState(null)
  const timer           = useRef(null)

  async function load(silent = false) {
    if (!silent) setL(true)
    try {
      const r = await api.get('/admin/stats')
      setD(r); setLR(new Date())
    } catch (e) { if (!silent) toast(e.message, 'error') }
    finally { setL(false) }
  }

  useEffect(() => {
    if (!ready) return
    load()
    timer.current = setInterval(() => load(true), 30000)
    return () => clearInterval(timer.current)
  }, [ready])

  const hour  = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const mongo = d?.system?.mongo?.state === 'connected'
  const plugOk  = d?.plugins?.filter(p => p.enabled && p.lastTestResult === 'ok').length || 0
  const plugErr = d?.plugins?.filter(p => p.enabled && p.lastTestResult && p.lastTestResult !== 'ok').length || 0

  return (
    <div style={{ padding: 'clamp(1rem, 4vw, 2.5rem)', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 3vw, 2rem)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {greet}, {user?.name?.split(' ')[0]} 👋
          </motion.h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Platform Admin
            {lastRef && <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>
              · updated {lastRef.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>}
          </p>
        </div>
        <button onClick={() => load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 12, background: 'var(--bg-surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(88,166,255,.1)'; e.currentTarget.style.color = '#58a6ff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface2)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Refresh
        </button>
      </div>

      {/* ── System health bar ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 20px', borderRadius: 16, background: mongo ? 'rgba(52,211,153,.04)' : 'rgba(248,113,113,.05)', border: `1px solid ${mongo ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.2)'}` }}>
        <Pill ok={mongo} label={`MongoDB · ${d?.system?.mongo?.state || '…'}`} pulse/>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <Pill ok label={`Uptime ${d?.system?.uptimeHuman || '…'}`}/>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <Pill ok={d?.infrastructure?.bridges?.online > 0} label={`Bridges ${d?.infrastructure?.bridges?.online ?? '…'}/${d?.infrastructure?.bridges?.total ?? '…'} online`}/>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <Pill ok={plugErr === 0} label={`Plugins ${plugOk} ok${plugErr > 0 ? ` · ${plugErr} failed` : ''}`}/>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <Pill ok label={`Node ${d?.system?.nodeVersion || '…'}`}/>
      </motion.div>

      {/* ── Stats grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {[
          { label: 'Total Users',    value: d?.users?.total,                      sub: `${d?.users?.active||0} active`,       icon: Users,       accent: '#58a6ff', to: '/admin/users'  },
          { label: 'Organizations',  value: d?.organizations?.total,              sub: `${d?.organizations?.active||0} active`,icon: Building2,   accent: '#34d399'                     },
          { label: 'Bridges',        value: d?.infrastructure?.bridges?.total,    sub: `${d?.infrastructure?.bridges?.online||0} online`,  icon: Wifi, accent: d?.infrastructure?.bridges?.online > 0 ? '#34d399' : '#5a5a7a' },
          { label: 'Devices',        value: d?.infrastructure?.devices?.total,    sub: `${d?.infrastructure?.devices?.enabled||0} enabled`, icon: Cpu,  accent: '#c084fc'                     },
          { label: 'Employees',      value: d?.employees?.total,                  sub: `${d?.employees?.active||0} active`,    icon: UserCheck,   accent: '#facc15'                     },
          { label: "Today's Punches",value: d?.attendance?.todayLogs,             sub: `${d?.attendance?.totalLogs?.toLocaleString()||0} total`, icon: Fingerprint, accent: '#fb923c'  },
          { label: 'Open Tickets',   value: d?.tickets?.open,                     sub: d?.tickets?.unassigned > 0 ? `${d.tickets.unassigned} unassigned` : 'all assigned', icon: Ticket, accent: d?.tickets?.unassigned > 0 ? '#f87171' : '#34d399', to: '/admin/tickets' },
        ].map((s, i) => <StatCard key={s.label} {...s} index={i}/>)}
      </div>

      {/* ── Main content grid ── */}
      <div className="admin-dash-grid">

        {/* ── Subscriptions ── */}
        <Section title="Subscriptions" icon={CreditCard} accent="#34d399" action={<LinkBtn to="/admin/plans" label="Plans"/>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { l: 'Active',  v: d?.subscriptions?.active,  c: '#34d399' },
              { l: 'Trial',   v: d?.subscriptions?.trial,   c: '#facc15' },
              { l: 'Expired', v: d?.subscriptions?.expired, c: '#f87171' },
              { l: 'Total',   v: d?.subscriptions?.total,   c: '#58a6ff' },
            ].map(s => (
              <div key={s.l} style={{ background: 'var(--bg-surface2)', borderRadius: 12, padding: '14px 12px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '1.6rem', fontWeight: 800, color: s.c, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.v ?? '—'}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</p>
              </div>
            ))}
          </div>
          {d?.subscriptions?.planBreakdown?.length > 0 && (
            <div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>By Plan</p>
              {(d.subscriptions.planBreakdown||[]).map((r,i) => (
                <div key={r._id ? `${r._id.planId}-${r._id.status}` : i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r._id.planId}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.78rem', padding: '2px 10px', borderRadius: 99, background: r._id.status === 'active' ? 'rgba(52,211,153,.1)' : 'rgba(250,204,21,.1)', color: r._id.status === 'active' ? '#34d399' : '#facc15', textTransform: 'capitalize' }}>{r._id.status}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', minWidth: 24, textAlign: 'right' }}>{r.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Users ── */}
        <Section title="Users" icon={Users} accent="#58a6ff" action={<LinkBtn to="/admin/users" label="Manage"/>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { l: 'Registered', v: d?.users?.total,        c: '#c8c8e0' },
              { l: 'Active',     v: d?.users?.active,       c: '#34d399' },
              { l: 'Locked',     v: d?.users?.locked,       c: d?.users?.locked > 0 ? '#f87171' : '#5a5a7a' },
              { l: 'New today',  v: d?.users?.newToday,     c: d?.users?.newToday > 0 ? '#facc15' : '#5a5a7a' },
            ].map(r => (
              <div key={r.l} style={{ background: 'var(--bg-surface2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: r.c, letterSpacing: '-0.02em', lineHeight: 1 }}>{r.v ?? '—'}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.l}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Recent Signups</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d?.users?.recent || []).slice(0, 4).map(u => (
              <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(88,166,255,.12)', border: '1px solid rgba(88,166,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#58a6ff', flexShrink: 0, overflow:'hidden' }}>
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : (u.name||'?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || u.mobile || u.userId}</p>
                </div>
                <span style={{ fontSize: '0.75rem', padding: '2px 9px', borderRadius: 99, background: u.role === 'admin' ? 'rgba(88,166,255,.12)' : 'rgba(255,255,255,.06)', color: u.role === 'admin' ? '#58a6ff' : '#7878a0', textTransform: 'capitalize', flexShrink: 0 }}>{u.role}</span>
              </div>
            ))}
            {!d?.users?.recent?.length && <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', textAlign: 'center', padding: 16 }}>No users yet</p>}
          </div>
        </Section>

        {/* ── System Health (right col) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Section title="System Health" icon={Activity} accent="#34d399">
            {/* MongoDB */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={15} style={{ color: mongo ? '#34d399' : '#f87171' }}/>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>MongoDB</span>
                </div>
                <Pill ok={mongo} label={d?.system?.mongo?.state || '…'} pulse/>
              </div>
              {d?.system?.mongo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <MetricRow label="Data size"   value={d.system.mongo.dataSize}    highlight={d.system.mongo.dataSize ? '#c8c8e0' : null}/>
                  <MetricRow label="Collections" value={d.system.mongo.collections} />
                  <MetricRow label="Indexes"     value={d.system.mongo.indexes}     />
                  <MetricRow label="Documents"   value={d.system.mongo.objects?.toLocaleString()} />
                </div>
              )}
            </div>

            {/* Node */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Zap size={15} style={{ color: '#58a6ff' }}/>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Node Process</span>
              </div>
              {d?.system && (
                <>
                  <MetricRow label="Version" value={d.system.nodeVersion}   highlight="#c8c8e0"/>
                  <MetricRow label="Uptime"  value={d.system.uptimeHuman}   highlight="#58a6ff"/>
                  <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Heap</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{d.system.memory.heapUsedMB}MB / {d.system.memory.heapTotalMB}MB</span>
                    </div>
                    <Bar used={d.system.memory.heapUsedMB} total={d.system.memory.heapTotalMB} color="#58a6ff"/>
                  </div>
                  <MetricRow label="RSS" value={`${d.system.memory.rssMB}MB`}/>
                </>
              )}
            </div>

            {/* OS */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <HardDrive size={15} style={{ color: '#c084fc' }}/>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Server OS</span>
              </div>
              {d?.system?.os && (
                <>
                  <MetricRow label="Platform" value={`${d.system.os.platform} / ${d.system.os.arch}`} highlight="#c8c8e0"/>
                  <MetricRow label="CPUs"     value={`${d.system.os.cpus} cores`}/>
                  <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>RAM</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{d.system.os.totalMemMB - d.system.os.freeMemMB}MB / {d.system.os.totalMemMB}MB</span>
                    </div>
                    <Bar used={d.system.os.totalMemMB - d.system.os.freeMemMB} total={d.system.os.totalMemMB} color="#c084fc"/>
                  </div>
                  <MetricRow label="Load avg" value={d.system.os.loadAvg?.join(' · ')}/>
                </>
              )}
            </div>
          </Section>

          {/* ── Plugins ── */}
          <Section title="Plugins" icon={Plug} accent="#fb923c" action={<LinkBtn to="/admin/plugins" label="Configure"/>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(d?.plugins || []).map((p,i) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.enabled ? '#34d399' : 'var(--text-dim)', flexShrink: 0, boxShadow: p.enabled ? '0 0 6px #34d39966' : 'none' }}/>
                  <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: p.enabled ? 'var(--text-primary)' : 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                  {p.lastTestResult === 'ok'
                    ? <span style={{ fontSize: '0.75rem', color: '#34d399', flexShrink: 0 }}>✓</span>
                    : p.lastTestResult
                      ? <span style={{ fontSize: '0.75rem', color: '#f87171', flexShrink: 0 }} title={p.lastTestResult}>✗</span>
                      : null}
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: p.enabled ? '#34d399' : '#3a3a5a', flexShrink: 0 }}>{p.enabled ? 'ON' : 'OFF'}</span>
                </div>
              ))}
              {!d?.plugins?.length && <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', textAlign: 'center', padding: 12 }}>No plugins found</p>}
            </div>
          </Section>
        </div>
      </div>

      {/* ── Infrastructure ── */}
      <Section title="Infrastructure" icon={Server} accent="#c084fc">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: d?.organizations?.top?.length ? 24 : 0 }}>
          {[
            { title: 'Bridges',       icon: Server,      accent: '#58a6ff', rows: [
              { l: 'Total',   v: d?.infrastructure?.bridges?.total   },
              { l: 'Online',  v: d?.infrastructure?.bridges?.online,  c: '#34d399' },
              { l: 'Offline', v: d?.infrastructure?.bridges?.offline, c: '#5a5a7a' },
            ]},
            { title: 'Devices',       icon: Cpu,         accent: '#c084fc', rows: [
              { l: 'Total',    v: d?.infrastructure?.devices?.total   },
              { l: 'Enabled',  v: d?.infrastructure?.devices?.enabled,  c: '#34d399' },
              { l: 'Disabled', v: d?.infrastructure?.devices?.disabled, c: '#5a5a7a' },
            ]},
            { title: 'Biometric Users', icon: Fingerprint, accent: '#facc15', rows: [
              { l: 'Total',    v: d?.infrastructure?.machineUsers?.total   },
              { l: 'Linked',   v: d?.infrastructure?.machineUsers?.linked,   c: '#34d399' },
              { l: 'Unlinked', v: d?.infrastructure?.machineUsers?.unlinked, c: d?.infrastructure?.machineUsers?.unlinked > 0 ? '#fb923c' : '#5a5a7a' },
            ]},
          ].map(col => (
            <div key={col.title} style={{ background: 'var(--bg-surface2)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <col.icon size={15} style={{ color: col.accent }}/>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{col.title}</span>
              </div>
              {col.rows.map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.l}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: r.c || '#c8c8e0', fontFamily: 'monospace' }}>{r.v ?? '—'}</span>
                </div>
              ))}
              {col.title === 'Biometric Users' && d?.infrastructure?.machineUsers?.total > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Bar used={d.infrastructure.machineUsers.linked} total={d.infrastructure.machineUsers.total} color="#34d399"/>
                </div>
              )}
            </div>
          ))}
        </div>

        {d?.organizations?.top?.length > 0 && (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Top Organizations by Devices</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(d.organizations?.top||[]).slice(0, 5).map(org => (
                <div key={org.orgId || org.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: org.bridgeOnline ? '#34d399' : 'var(--text-dim)', flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name}</span>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{org.bridgeId || 'no bridge'}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#58a6ff', flexShrink: 0 }}>{org.deviceCount || 0} dev</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
