import { useEffect } from 'react'
import { Building2, Cpu, Wifi, WifiOff, ChevronRight } from 'lucide-react'
import { useOrgContext } from "../../store/context"
import { useAuth } from '../../store/auth'
import { Badge } from './Badge'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

/**
 * OrgBar — renders a breadcrumb-style context selector:
 *   [Org dropdown]  →  [Device dropdown]
 *
 * Loads orgs + devices once, stores in context store.
 * All pages that use this share the same selection.
 */
export function OrgBar({ showDevice = false }) {
  const { ready } = useAuth()
  const {
    orgs, orgId, deviceId,
    org, orgDevices,
    setOrgs, selectOrg, selectDevice, setDevices,
  } = useOrgContext()

  // Load orgs once
  useEffect(() => {
    if (!ready || orgs.length > 0) return
    api.get('/organizations').then(r => {
      setOrgs(r.data || [])
    }).catch(() => {})
  }, [ready])

  // Load devices when org changes
  useEffect(() => {
    const currentOrg = org()
    if (!currentOrg?.bridgeId) return
    const bid = currentOrg.bridgeId
    api.get(`/organizations/${currentOrg.orgId}/devices`)
      .then(r => setDevices(bid, r.data || []))
      .catch(() => {})
  }, [orgId])

  const currentOrg     = org()
  const devices        = orgDevices()
  const isOnline       = currentOrg?.bridgeOnline

  if (!orgs.length) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Org selector */}
      <div className="flex items-center gap-2 card-sm px-3 py-2">
        <Building2 size={13} className="text-accent flex-shrink-0"/>
        {orgs.length === 1 ? (
          <span style={{ fontSize:"0.875rem", fontWeight:600, color:"var(--text-primary)" }}>{currentOrg?.name}</span>
        ) : (
          <select
            value={orgId || ''}
            onChange={e => selectOrg(e.target.value)}
            style={{ background:"transparent", fontSize:"0.875rem", fontWeight:600, color:"var(--text-primary)", outline:"none", cursor:"pointer", paddingRight:4, border:"none" }}
          >
            {orgs.map(o => (
              <option key={o.orgId} value={o.orgId} style={{ background:"var(--bg-elevated)" }}>{o.name}</option>
            ))}
          </select>
        )}
        {currentOrg && (
          <Badge variant={isOnline ? 'green' : 'gray'} dot className="text-[9px] flex-shrink-0">
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        )}
      </div>

      {/* Bridge info */}
      {currentOrg?.bridgeId && (
        <>
          <ChevronRight size={12} style={{ color:"var(--text-dim)", flexShrink:0 }}/>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-muted)", background:"var(--bg-surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"6px 12px" }}>
            {isOnline ? <Wifi size={12} className="text-emerald-400"/> : <WifiOff size={12}/>}
            <span style={{ color:"var(--text-muted)" }}>{currentOrg.bridgeId}</span>
          </div>
        </>
      )}

      {/* Device selector — optional */}
      {showDevice && devices.length > 0 && (
        <>
          <ChevronRight size={12} style={{ color:"var(--text-dim)", flexShrink:0 }}/>
          <div className="flex items-center gap-2 card-sm px-3 py-2">
            <Cpu size={13} className="text-accent flex-shrink-0"/>
            <select
              value={deviceId || ''}
              onChange={e => selectDevice(e.target.value || null)}
              style={{ background:"transparent", fontSize:"0.875rem", color:"var(--text-primary)", outline:"none", cursor:"pointer", paddingRight:4, border:"none" }}
            >
              <option value="" style={{ background:"var(--bg-elevated)" }}>All Devices</option>
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId} style={{ background:"var(--bg-elevated)" }}>
                  {d.name}{d.location ? ` · ${d.location}` : ''}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}
