import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Cpu, Wifi, Calendar, Activity, Zap, RefreshCw,
  AlertTriangle, ArrowRight, Clock, CheckCircle2, Fingerprint,
  Users, BarChart2, Shield, Plus, Sparkles, ChevronRight, CalendarDays
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { UserPage, UserAvatar } from '../components/ui/UserUI'
import { useAuth } from '../store/auth'
import { useToast } from '../components/ui/Toast'
import { daysLeft, timeAgo, punchLabel } from '../lib/utils'
import api from '../lib/api'

// ── Ring progress ─────────────────────────────────────────────────────────────
function Ring({ used, max, label, accent='var(--accent)', size=64 }) {
  const r = size*0.38, circ = 2*Math.PI*r
  const pct = max > 0 ? Math.min(100,(used/max)*100) : 0
  const col = pct > 90 ? '#f87171' : pct > 70 ? '#fb923c' : accent
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <div style={{ position:'relative', width:size, height:size }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} stroke="var(--border)" strokeWidth={4.5} fill="none"/>
          <motion.circle cx={size/2} cy={size/2} r={r} stroke={col} strokeWidth={4.5} fill="none"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ}
            animate={{ strokeDashoffset: circ-(pct/100)*circ }}
            transition={{ duration:1.2, ease:'easeOut', delay:0.3 }}/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:size<60?'0.65rem':'0.75rem', fontWeight:800, fontFamily:'monospace', color:col }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <p style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--text-primary)', textAlign:'center' }}>{used}/{max>=99999?'∞':max}</p>
      <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon:Icon, accent, index=0, to, loading }) {
  const inner = (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.06 }}
      style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16,
        padding:'1.25rem', display:'flex', flexDirection:'column', gap:12,
        boxShadow:'var(--shadow-card)', position:'relative', overflow:'hidden',
        cursor:to?'pointer':'default', transition:'all .2s' }}
      whileHover={to?{ y:-2, boxShadow:'0 8px 32px rgba(0,0,0,.12)' }:{}}>
      <div style={{ position:'absolute', top:-16, right:-16, width:64, height:64, borderRadius:'50%',
        background:accent, opacity:.1, filter:'blur(14px)', pointerEvents:'none' }}/>
      <div style={{ width:40, height:40, borderRadius:12,
        background:`color-mix(in srgb, ${accent} 12%, transparent)`,
        border:`1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon size={18} style={{ color:accent }}/>
      </div>
      <div>
        {loading ? <div style={{ height:32, width:60, borderRadius:6 }} className="shimmer"/>
          : <p style={{ fontSize:'2rem', fontWeight:800, color:'var(--text-primary)', lineHeight:1, letterSpacing:'-0.02em' }}>{value??'—'}</p>}
        <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:600, marginTop:5,
          textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</p>
        {sub && <p style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginTop:3 }}>{sub}</p>}
      </div>
    </motion.div>
  )
  return to ? <Link to={to} style={{ textDecoration:'none' }}>{inner}</Link> : inner
}

// ── Live feed ─────────────────────────────────────────────────────────────────
function LiveFeed({ orgs }) {
  const [events, setEvents] = useState([])
  const esRef = useRef(null)
  useEffect(() => {
    const online = orgs.find(o => o.bridgeOnline && o.bridgeId)
    if (!online) return
    const es = new EventSource(`/api/${online.bridgeId}/attendance/realtime`)
    esRef.current = es
    es.onmessage = e => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'REALTIME_PUNCH')
          setEvents(p => [{ ...d.log, _k:Date.now(), _dev:d.deviceId }, ...p.slice(0,19)])
      } catch {}
    }
    return () => es.close()
  }, [orgs])

  if (!events.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'2rem 0', gap:10 }}>
      <div style={{ width:48, height:48, borderRadius:14, background:'var(--bg-surface2)',
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Activity size={22} style={{ color:'var(--text-dim)' }}/>
      </div>
      <p style={{ fontSize:'0.85rem', color:'var(--text-dim)', fontFamily:'monospace', textAlign:'center' }}>
        Waiting for live punches…
      </p>
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:300, overflowY:'auto' }}>
      <AnimatePresence>
        {events.map(ev => {
          const isIn = (ev.punchType??ev.punch_type) === 0
          const uid = ev.userId||ev.user_id||'?'
          return (
            <motion.div key={ev._k} initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10,
                background:'var(--bg-surface2)', border:'1px solid var(--border-soft)' }}>
              <UserAvatar name={String(uid)} size={32}/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:'0.875rem', color:'var(--text-primary)', fontWeight:600,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>User {uid}</p>
                <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'monospace' }}>
                  {punchLabel(ev.punchType??ev.punch_type)} · {ev._dev}
                </p>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
                <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'2px 8px', borderRadius:99,
                  background:isIn?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)',
                  color:isIn?'#16a34a':'#dc2626',
                  border:`1px solid ${isIn?'rgba(52,211,153,.25)':'rgba(248,113,113,.25)'}` }}>
                  {isIn?'▲ IN':'▼ OUT'}
                </span>
                <span style={{ fontSize:'0.7rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{timeAgo(ev.timestamp)}</span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ── New user onboarding screen ────────────────────────────────────────────────
function OnboardingView({ userName }) {
  const steps = [
    { icon:Building2, color:'var(--accent)', title:'Create your organization', desc:'Add your company — name, location, and industry.', to:'/organizations', cta:'Create Organization', done:false },
    { icon:Wifi,      color:'#34d399',       title:'Connect a Bridge',         desc:'Link your biometric device gateway to the cloud.', to:'/bridge-setup', cta:'Set Up Bridge', done:false },
    { icon:Users,     color:'#c084fc',       title:'Add employees',            desc:'Import or add your workforce with shifts and policies.', to:'/employees', cta:'Add Employees', done:false },
    { icon:Fingerprint,color:'#fb923c',      title:'Sync biometric machines',  desc:'Connect your attendance machines to start recording.', to:'/organizations', cta:'Add Machine', done:false },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>

      {/* Welcome hero */}
      <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}
        style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
          borderRadius:20, padding:'2.5rem', position:'relative', overflow:'hidden',
          boxShadow:'var(--shadow-card)' }}>
        {/* Accent glow */}
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%',
          background:'var(--accent-muted)', filter:'blur(50px)', pointerEvents:'none' }}/>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'5px 13px',
            borderRadius:99, background:'var(--accent-muted)', border:'1px solid var(--accent-border)',
            fontSize:'0.8rem', fontWeight:700, color:'var(--accent)', marginBottom:16 }}>
            <Sparkles size={13}/> Your account is ready
          </div>
          <h1 style={{ fontSize:'2rem', fontWeight:900, color:'var(--text-primary)',
            letterSpacing:'-0.04em', lineHeight:1.1, marginBottom:10 }}>
            Welcome, {userName}! 👋
          </h1>
          <p style={{ fontSize:'1rem', color:'var(--text-muted)', lineHeight:1.7, marginBottom:24, maxWidth:520 }}>
            You're one step away from your <strong style={{ color:'var(--text-primary)' }}>14-day free trial</strong>. 
            Create your first organization below to start — your trial clock begins the moment you do.
          </p>
          <Link to="/organizations">
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }}
              style={{ display:'inline-flex', alignItems:'center', gap:9, padding:'13px 24px',
                borderRadius:12, border:'none', fontWeight:800, fontSize:'1rem',
                background:'var(--accent)', color:'#fff', cursor:'pointer',
                boxShadow:'0 6px 20px var(--accent-muted)' }}>
              <Plus size={18}/> Create Your First Organization
            </motion.button>
          </Link>
        </div>
      </motion.div>

      {/* What you get banner */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
        {[
          { icon:Fingerprint, color:'var(--accent)',  t:'Biometric sync',     d:'Real-time attendance from any device' },
          { icon:BarChart2,   color:'#34d399',        t:'Smart reports',      d:'Daily, monthly, exportable reports'   },
          { icon:Users,       color:'#c084fc',        t:'Employee management',d:'Shifts, leaves, and HR policies'      },
          { icon:Shield,      color:'#fb923c',        t:'Secure & encrypted', d:'AES-256 + 2FA + role-based access'    },
        ].map((f,i) => (
          <motion.div key={f.t} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:.1+i*.06 }}
            style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14,
              padding:'16px', boxShadow:'var(--shadow-card)' }}>
            <div style={{ width:36, height:36, borderRadius:10, marginBottom:10,
              background:`color-mix(in srgb, ${f.color} 12%, transparent)`,
              border:`1px solid color-mix(in srgb, ${f.color} 22%, transparent)`,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <f.icon size={16} style={{ color:f.color }}/>
            </div>
            <p style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>{f.t}</p>
            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.5 }}>{f.d}</p>
          </motion.div>
        ))}
      </div>

      {/* Setup steps */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:18,
        overflow:'hidden', boxShadow:'var(--shadow-card)' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:'var(--accent-muted)',
            border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <CheckCircle2 size={14} style={{ color:'var(--accent)' }}/>
          </div>
          <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--text-primary)' }}>Setup checklist</p>
          <span style={{ fontSize:'0.75rem', padding:'2px 9px', borderRadius:99,
            background:'var(--bg-surface2)', border:'1px solid var(--border)',
            color:'var(--text-muted)', fontWeight:600, marginLeft:'auto' }}>0 / 4 done</span>
        </div>
        <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:4 }}>
          {steps.map((s,i) => (
            <Link key={s.title} to={s.to} style={{ textDecoration:'none' }}>
              <motion.div initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:.15+i*.07 }}
                style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 14px',
                  borderRadius:12, transition:'all .15s', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg-surface2)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{ width:38, height:38, borderRadius:11, flexShrink:0,
                  background:`color-mix(in srgb, ${s.color} 12%, transparent)`,
                  border:`1px solid color-mix(in srgb, ${s.color} 20%, transparent)`,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <s.icon size={17} style={{ color:s.color }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <span style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)' }}>
                      Step {i+1}: {s.title}
                    </span>
                    {i === 0 && (
                      <span style={{ fontSize:'0.7rem', padding:'1px 7px', borderRadius:99,
                        background:'var(--accent-muted)', color:'var(--accent)',
                        border:'1px solid var(--accent-border)', fontWeight:700 }}>Start here</span>
                    )}
                  </div>
                  <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>{s.desc}</p>
                </div>
                <ChevronRight size={15} style={{ color:'var(--text-dim)', flexShrink:0 }}/>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Org row ───────────────────────────────────────────────────────────────────
function OrgRow({ org, index }) {
  return (
    <motion.div initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:index*0.05 }}
      style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:12,
        background:'var(--bg-surface2)', border:'1px solid var(--border-soft)', marginBottom:6, transition:'all .15s' }}>
      <div style={{ width:38, height:38, borderRadius:10, overflow:'hidden', flexShrink:0,
        background:'var(--accent-muted)', border:'1px solid var(--accent-border)',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.25rem' }}>
        {org.logoUrl ? <img src={org.logoUrl} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/> : '🏢'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{org.name}</p>
        <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontFamily:'monospace', marginTop:2 }}>
          {org.bridgeId ? org.bridgeId.slice(0,14)+'…' : 'No bridge'} · {org.deviceCount||0} device{org.deviceCount!==1?'s':''}
        </p>
      </div>
      <div style={{ flexShrink:0 }}>
        {!org.isActive
          ? <span style={{ fontSize:'0.75rem', padding:'3px 10px', borderRadius:99, background:'rgba(248,113,113,.1)', color:'#dc2626', border:'1px solid rgba(248,113,113,.2)', fontWeight:600 }}>Suspended</span>
          : org.bridgeOnline
          ? <span style={{ fontSize:'0.75rem', padding:'3px 10px', borderRadius:99, background:'rgba(52,211,153,.1)', color:'#16a34a', border:'1px solid rgba(52,211,153,.2)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#16a34a' }}/>Online
            </span>
          : org.bridgeId
          ? <span style={{ fontSize:'0.75rem', padding:'3px 10px', borderRadius:99, background:'var(--bg-elevated)', color:'var(--text-muted)', border:'1px solid var(--border)', fontWeight:600 }}>Offline</span>
          : <span style={{ fontSize:'0.75rem', padding:'3px 10px', borderRadius:99, background:'rgba(251,146,60,.08)', color:'#d97706', border:'1px solid rgba(251,146,60,.2)', fontWeight:600 }}>No Bridge</span>}
      </div>
    </motion.div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, icon:Icon, accent, action, children }) {
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:18,
      overflow:'hidden', boxShadow:'var(--shadow-card)' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border-soft)',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8,
            background:`color-mix(in srgb, ${accent} 12%, transparent)`,
            border:`1px solid color-mix(in srgb, ${accent} 20%, transparent)`,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon size={14} style={{ color:accent }}/>
          </div>
          <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding:'12px 14px' }}>{children}</div>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, ready } = useAuth()
  const { toast }       = useToast()
  const [orgs,     setOrgs]     = useState([])
  const [sub,      setSub]      = useState(null)
  const [plan,     setPlan]     = useState(null)
  const [load,         setLoad]         = useState(true)
  const [empCount,     setEmpCount]     = useState(0)
  const [leaveSummary, setLeaveSummary] = useState([])

  async function doLoad() {
    setLoad(true)
    try {
      const [or, sr] = await Promise.allSettled([
        api.get('/organizations'),
        api.get('/subscriptions/my'),
      ])
      if (or.status === 'fulfilled') {
        const data = or.value.data || []
        setOrgs(data)
        if (data.length) {
          api.get(`/organizations/${data[0].orgId}/employees?limit=1`)
            .then(r => setEmpCount(r.total||0)).catch(()=>{})
          api.get(`/organizations/${data[0].orgId}/leave-summary`)
            .then(r => setLeaveSummary(r.data || [])).catch(()=>{})
        }
      }
      if (sr.status === 'fulfilled' && sr.value.data) {
        setSub(sr.value.data.subscription)
        setPlan(sr.value.data.plan)
      }
    } catch {}
    setLoad(false)
  }

  useEffect(() => { if (ready) doLoad() }, [ready])

  const totalDev  = orgs.reduce((s,o) => s+(o.deviceCount||0), 0)
  const onlineBr  = orgs.filter(o => o.bridgeOnline).length
  const days      = daysLeft(sub?.endDate)
  const hour      = new Date().getHours()
  const greet     = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dayAccent = days !== null ? (days <= 0 ? '#f87171' : days <= 7 ? '#fb923c' : '#34d399') : 'var(--accent)'

  // ── New user — no org, no subscription yet ──
  const isNewUser = !load && orgs.length === 0 && !sub

  return (
    <UserPage>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <motion.h1 initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
            style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)',
              letterSpacing:'-0.03em', lineHeight:1.1 }}>
            {greet}, {user?.name?.split(' ')[0]} 👋
          </motion.h1>
          <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.1 }}
            style={{ fontSize:'0.875rem', color:'var(--text-muted)', marginTop:5 }}>
            {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </motion.p>
        </div>
        <button onClick={doLoad}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:12,
            background:'var(--bg-surface)', border:'1px solid var(--border)', cursor:'pointer',
            color:'var(--text-muted)', fontSize:'0.875rem', fontWeight:600, transition:'all .15s' }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-muted)'}}>
          <RefreshCw size={14} style={{ animation:load?'spin 1s linear infinite':'none' }}/> Refresh
        </button>
      </div>

      {/* Loading shimmer */}
      {load && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height:120, borderRadius:16 }} className="shimmer"/>)}
        </div>
      )}

      {/* ── NEW USER ONBOARDING ── */}
      {!load && isNewUser && <OnboardingView userName={user?.name?.split(' ')[0] || 'there'}/>}

      {/* ── EXISTING USER DASHBOARD ── */}
      {!load && !isNewUser && <>

        {/* Expiry warning */}
        {sub && days !== null && days <= 7 && (
          <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
              padding:'14px 20px', borderRadius:16, flexWrap:'wrap',
              background:days<=0?'rgba(248,113,113,.06)':'rgba(251,146,60,.06)',
              border:`1px solid ${days<=0?'rgba(248,113,113,.2)':'rgba(251,146,60,.2)'}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9,
                background:days<=0?'rgba(248,113,113,.12)':'rgba(251,146,60,.12)',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <AlertTriangle size={15} style={{ color:days<=0?'#f87171':'#fb923c' }}/>
              </div>
              <div>
                <p style={{ fontSize:'0.9rem', fontWeight:700, color:days<=0?'#f87171':'#fb923c' }}>
                  {days<=0?'Subscription expired':`${sub.status==='trial'?'Trial':'Subscription'} expires in ${days} day${days!==1?'s':''}`}
                </p>
                <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:2 }}>
                  {days<=0?'Renew to restore device access.':'Renew early to avoid interruption.'}
                </p>
              </div>
            </div>
            <Link to="/subscription">
              <button style={{ padding:'8px 18px', borderRadius:10, fontWeight:700, fontSize:'0.875rem',
                background:days<=0?'rgba(248,113,113,.15)':'rgba(251,146,60,.15)',
                color:days<=0?'#f87171':'#fb923c',
                border:`1px solid ${days<=0?'rgba(248,113,113,.3)':'rgba(251,146,60,.3)'}`,
                cursor:'pointer' }}>
                Manage Plan →
              </button>
            </Link>
          </motion.div>
        )}

        {/* Stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 }}>
          <StatCard label="Organizations"  value={orgs.length}  sub={plan?`of ${plan.maxBridges}`:undefined} icon={Building2}   accent="var(--accent)"  index={0} to="/organizations"/>
          <StatCard label="Machines"       value={totalDev}     sub={plan?`of ${plan.maxDevices}`:undefined}  icon={Cpu}         accent="#c084fc"        index={1}/>
          <StatCard label="Online Bridges" value={onlineBr}     sub={`of ${orgs.length} total`}               icon={Wifi}        accent="#34d399"        index={2}/>
          <StatCard label="Days Left"      value={days??'—'}    sub={plan?.name||'No plan'}                   icon={Calendar}    accent={dayAccent}      index={3} to="/subscription"/>
        </div>

        {/* Main grid */}
        <div className="dash-main-grid">

          {/* Organizations */}
          <SectionCard title="Organizations" icon={Building2} accent="var(--accent)"
            action={
              <Link to="/organizations" style={{ display:'flex', alignItems:'center', gap:4,
                fontSize:'0.8125rem', fontWeight:600, color:'var(--accent)', textDecoration:'none' }}>
                View all <ArrowRight size={12}/>
              </Link>
            }>
            {orgs.length === 0
              ? <div style={{ textAlign:'center', padding:'2rem 0' }}>
                  <Building2 size={32} style={{ color:'var(--text-dim)', margin:'0 auto 10px' }}/>
                  <p style={{ fontSize:'0.875rem', color:'var(--text-dim)', marginBottom:14 }}>No organizations yet</p>
                  <Link to="/organizations">
                    <button style={{ padding:'8px 16px', borderRadius:9, background:'var(--accent)', color:'#fff', border:'none', fontWeight:700, cursor:'pointer', fontSize:'0.875rem' }}>
                      Create Organization
                    </button>
                  </Link>
                </div>
              : orgs.slice(0,5).map((org,i) => <OrgRow key={org.orgId} org={org} index={i}/>)
            }
          </SectionCard>

          {/* Plan usage */}
          <SectionCard title="Plan Usage" icon={Zap} accent="#d97706"
            action={
              <Link to="/subscription" style={{ display:'flex', alignItems:'center', gap:4,
                fontSize:'0.8125rem', fontWeight:600, color:'var(--accent)', textDecoration:'none' }}>
                Manage <ArrowRight size={12}/>
              </Link>
            }>
            {plan ? (
              <>
                <div style={{ display:'flex', justifyContent:'space-around', paddingBottom:20 }}>
                  <Ring used={orgs.length} max={plan.maxBridges}  label="Orgs"    accent="var(--accent)"/>
                  <Ring used={totalDev}    max={plan.maxDevices}   label="Devices" accent="#c084fc"/>
                  <Ring used={empCount}    max={plan.maxEmployees} label="Staff"   accent="#34d399"/>
                </div>
                {sub && (
                  <div style={{ padding:'14px 16px', borderRadius:12, background:'var(--bg-surface2)',
                    border:'1px solid var(--border-soft)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div>
                        <p style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)' }}>{plan.name} Plan</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'capitalize', marginTop:2 }}>
                          {sub.status} · {sub.billingCycle||'monthly'}
                        </p>
                      </div>
                      <span style={{ fontSize:'0.875rem', fontWeight:800, fontFamily:'monospace', color:dayAccent }}>
                        {days<=0?'Expired':`${days}d left`}
                      </span>
                    </div>
                    <div style={{ height:5, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
                      <motion.div style={{ height:'100%', borderRadius:99, background:dayAccent }}
                        initial={{ width:0 }}
                        animate={{ width:`${Math.max(4,100-Math.min(100,(days/(plan?.trialDays||30))*100))}%` }}
                        transition={{ duration:1, ease:'easeOut', delay:0.3 }}/>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'1.5rem 0' }}>
                <p style={{ fontSize:'0.9rem', color:'var(--text-dim)', marginBottom:14 }}>No active plan</p>
                <Link to="/subscription">
                  <button style={{ padding:'8px 16px', borderRadius:9, background:'var(--accent)', color:'#fff', border:'none', fontWeight:700, cursor:'pointer', fontSize:'0.875rem' }}>
                    View Plans
                  </button>
                </Link>
              </div>
            )}
          </SectionCard>

          {/* Live feed */}
          <SectionCard title="Live Feed" icon={Activity} accent="#34d399"
            action={orgs.some(o=>o.bridgeOnline) && (
              <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem', color:'#16a34a', fontWeight:600 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', animation:'pulse 2s infinite' }}/>
                Live
              </span>
            )}>
            <LiveFeed orgs={orgs}/>
          </SectionCard>
        </div>

        {/* Leave Balance Summary */}
        {leaveSummary.length > 0 && (() => {
          const withBalance = leaveSummary.filter(e => {
            const b = e.balance || {}
            return Object.values(b).some(v => (v||0) > 0)
          })
          if (!withBalance.length) return null
          const TYPES = ['casual','sick','earned','maternity','paternity','other']
          return (
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
              style={{ borderRadius:16, border:'1px solid var(--border)', background:'var(--bg-surface)', overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:9, background:'var(--accent-muted)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <CalendarDays size={15} style={{ color:'var(--accent)' }}/>
                  </div>
                  <div>
                    <p style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)' }}>Leave Balances</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{withBalance.length} employee{withBalance.length!==1?'s':''} with pending leave</p>
                  </div>
                </div>
                <Link to="/employees" style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.8125rem', fontWeight:600, color:'var(--accent)', textDecoration:'none' }}>
                  All Employees <ArrowRight size={12}/>
                </Link>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th className="tbl-head" style={{ textAlign:'left', padding:'8px 18px', paddingRight:8 }}>Employee</th>
                      {TYPES.map(t => <th key={t} className="tbl-head" style={{ padding:'8px 12px', textAlign:'center', textTransform:'capitalize', fontFamily:'monospace' }}>{t.substring(0,3)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {withBalance.slice(0, 8).map((e, i) => (
                      <tr key={e.employeeId} className="tbl-row" style={{ borderTop: i===0 ? 'none':'1px solid var(--tbl-border)' }}>
                        <td className="tbl-cell" style={{ padding:'8px 18px', paddingRight:8 }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                            <span style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-primary)' }}>{e.name}</span>
                            {e.department && <span style={{ fontSize:'0.6875rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{e.department}</span>}
                          </div>
                        </td>
                        {TYPES.map(t => {
                          const v = e.balance?.[t] || 0
                          return (
                            <td key={t} className="tbl-cell" style={{ padding:'8px 12px', textAlign:'center' }}>
                              <span style={{
                                fontSize:'0.8125rem', fontWeight:700, fontFamily:'monospace',
                                color: v > 10 ? '#22c55e' : v > 0 ? 'var(--accent)' : v < 0 ? '#ef4444' : 'var(--text-dim)',
                              }}>{v || '—'}</span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )
        })()}
      </>}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
      `}</style>
    </UserPage>
  )
}
