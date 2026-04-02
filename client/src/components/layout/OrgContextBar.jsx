import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Building2, Cpu, Server, ChevronDown, Wifi, WifiOff } from 'lucide-react'
import { useOrgContext } from '../../store/context'
import { useAuth } from '../../store/auth'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

export function OrgContextBar() {
  const { ready } = useAuth()
  const {
    orgs, orgId, deviceId,
    org: getOrg, orgDevices,
    setOrgs, selectOrg, selectDevice, setDevices,
  } = useOrgContext()

  const location  = useLocation()
  const fetchedRef = useRef(false)

  function fetchOrgs() {
    api.get('/organizations').then(r => {
      setOrgs(r.data || [])
      fetchedRef.current = true
    }).catch(() => { fetchedRef.current = true })
  }

  // Fetch on auth ready
  useEffect(() => {
    if (!ready) return
    fetchOrgs()
  }, [ready])

  // Re-fetch on every page navigation so new orgs/bridges appear immediately
  useEffect(() => {
    if (!ready || !fetchedRef.current) return
    fetchOrgs()
  }, [location.pathname])

  useEffect(() => {
    const org = getOrg()
    if (!org?.bridgeId) return
    api.get(`/organizations/${org.orgId}/devices`)
      .then(r => setDevices(org.bridgeId, r.data || []))
      .catch(() => {})
  }, [orgId])

  const org     = getOrg()
  const devices = orgDevices()


  const bridgeOnline = org?.bridgeOnline

  // While orgs loading or empty, show nothing (bar hides itself)
  if (!orgs.length) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      backdropFilter: 'blur(8px)',
      flexShrink: 0,
      overflowX: 'auto',
      height: 48,
    }}>

      {/* ── ORG ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px', height:'100%', borderRight:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ width:24, height:24, borderRadius:6, background:'rgba(88,166,255,.12)', border:'1px solid rgba(88,166,255,.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Building2 size={13} style={{ color:'#58a6ff' }}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', lineHeight:1 }}>
          <span style={{ fontSize:'0.6rem', fontFamily:'monospace', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Organization</span>
          <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
            <select
              value={orgId || ''}
              onChange={e => selectOrg(e.target.value)}
              style={{
                appearance:'none', background:'transparent', border:'none',
                color:'var(--text-primary)', fontSize:'0.8125rem', fontWeight:600,
                cursor:'pointer', paddingRight:16, outline:'none',
                maxWidth:180,
              }}
            >
              {orgs.map(o => <option key={o.orgId} value={o.orgId} style={{ background:'var(--bg-elevated)' }}>{o.name}</option>)}
            </select>
            <ChevronDown size={11} style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <span style={{ padding:'0 10px', color:'var(--text-dim)', fontSize:'1rem', flexShrink:0 }}>›</span>

      {/* ── BRIDGE ──────────────────────────────────────────────── */}
      {org?.bridgeId ? (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px', height:'100%', borderRight:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ width:24, height:24, borderRadius:6, background: bridgeOnline ? 'rgba(52,211,153,.1)' : 'rgba(255,255,255,.04)', border:`1px solid ${bridgeOnline ? 'rgba(52,211,153,.25)' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {bridgeOnline
              ? <Wifi size={13} style={{ color:'#34d399' }}/>
              : <WifiOff size={13} style={{ color:'#4a4a68' }}/>}
          </div>
          <div style={{ lineHeight:1 }}>
            <p style={{ fontSize:'0.6rem', fontFamily:'monospace', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Bridge</p>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:'0.8125rem', fontWeight:600, color: bridgeOnline ? '#d0d0e8' : '#5a5a7a', fontFamily:'monospace' }}>
                {org.bridgeId}
              </span>
              <span style={{ fontSize:'0.625rem', fontWeight:700, padding:'1px 7px', borderRadius:99,
                background: bridgeOnline ? 'rgba(52,211,153,.12)' : 'rgba(255,255,255,.05)',
                color: bridgeOnline ? '#34d399' : '#5a5a7a',
                border: `1px solid ${bridgeOnline ? 'rgba(52,211,153,.2)' : 'var(--border)'}`,
              }}>
                {bridgeOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px', height:'100%', borderRight:'1px solid var(--border)', flexShrink:0, opacity:0.5 }}>
          <Server size={13} style={{ color:'var(--text-muted)' }}/>
          <span style={{ fontSize:'0.75rem', color:'#fb923c', fontFamily:'monospace' }}>No Bridge</span>
        </div>
      )}

      {/* Arrow */}
      <span style={{ padding:'0 10px', color:'var(--text-dim)', fontSize:'1rem', flexShrink:0 }}>›</span>

      {/* ── DEVICE ──────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px', height:'100%', flexShrink:0 }}>
        <div style={{ width:24, height:24, borderRadius:6, background:'rgba(196,132,252,.1)', border:'1px solid rgba(196,132,252,.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Cpu size={13} style={{ color:'#c084fc' }}/>
        </div>
        <div style={{ lineHeight:1 }}>
          <p style={{ fontSize:'0.6rem', fontFamily:'monospace', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Device</p>
          <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
            <select
              value={deviceId || ''}
              onChange={e => selectDevice(e.target.value || null)}
              style={{
                appearance:'none', background:'transparent', border:'none',
                color:'var(--text-primary)', fontSize:'0.8125rem', fontWeight:600,
                cursor:'pointer', paddingRight:16, outline:'none',
                maxWidth:180,
              }}
            >
              <option value="" style={{ background:'var(--bg-elevated)' }}>All Devices</option>
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId} style={{ background:'var(--bg-elevated)' }}>
                  {d.name}{d.location ? ` · ${d.location}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={11} style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          </div>
        </div>
      </div>

      {/* ── Right stats ─────────────────────────────────────────── */}
      <div style={{ marginLeft:'auto', padding:'0 20px', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        {org?.deviceCount > 0 && (
          <div style={{ textAlign:'right', lineHeight:1 }}>
            <p style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-primary)', fontFamily:'monospace' }}>{org.deviceCount}</p>
            <p style={{ fontSize:'0.6rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:2 }}>
              Device{org.deviceCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
