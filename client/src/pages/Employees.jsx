import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Plus, Search, Edit3, Trash2, RefreshCw, Eye,
  Mail, Phone, Briefcase, Building2, Clock,
  Cpu, Link2, Link2Off, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  UserCheck, UserX, UserMinus, Shield, Activity
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { ImageUpload } from '../components/ui/ImageUpload'
import { Empty } from '../components/ui/Empty'
import { useAuth } from '../store/auth'
import { useOrgContext } from '../store/context'
import { UserPage, UserStatCard, UserActionBtn, UserAvatar, UserPageHeader } from '../components/ui/UserUI'
import { useToast } from '../components/ui/Toast'
import { fmtDate, cn } from '../lib/utils'
import api from '../lib/api'

const STATUS_CLR = { active:'green', inactive:'gray', terminated:'red', resigned:'orange', absconded:'red' }
const TYPE_LBL   = { 'full-time':'Full Time','part-time':'Part Time','contract':'Contract','intern':'Intern','consultant':'Consultant' }
const DAYS       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const GENDER_CFG = {
  male:   { symbol:'♂', color:'#60a5fa', label:'Male'   },
  female: { symbol:'♀', color:'#f472b6', label:'Female' },
  other:  { symbol:'⚧', color:'#a78bfa', label:'Other'  },
}
function GenderIcon({ gender, style }) {
  const cfg = GENDER_CFG[gender]
  if (!cfg) return null
  return (
    <span title={cfg.label} style={{ fontSize:'0.85rem', lineHeight:1, color:cfg.color, flexShrink:0, ...style }}>
      {cfg.symbol}
    </span>
  )
}

const EMPTY = {
  firstName:'', lastName:'', employeeCode:'', gender:'', dateOfBirth:'', bloodGroup:'',
  email:'', mobile:'', mobile2:'', reportingTo:'',
  department:'', designation:'', employeeType:'full-time', branchLocation:'',
  joiningDate:'', confirmationDate:'', status:'active',
  shiftId:'', weeklyOffDays:[0], overtimeAllowed:false, graceMinutes:0, halfDayMinutes:240, fullDayMinutes:480,
  salary:'', salaryType:'monthly',
  panNumber:'', pfNumber:'', esiNumber:'', uanNumber:'',
  bankDetails:{ accountNumber:'', accountName:'', bankName:'', ifscCode:'', branchName:'', accountType:'savings' },
  address:{ line1:'', line2:'', city:'', state:'', pincode:'', country:'India' },
  emergencyContact:{ name:'', relationship:'', phone:'' },
  leaveBalance:{ casual:0, sick:0, earned:0, maternity:0, paternity:0, other:0 },
  notes:'',
}

// ── Checkbox helper ────────────────────────────────────────────────────────────
function CB({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div onClick={onChange}
        className={cn('w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0',
          checked ? 'bg-accent border-accent' : '')}>
        {checked && <CheckCircle2 size={10} className="text-white"/>}
      </div>
      <span style={{ fontSize:"0.875rem", color:"var(--text-secondary)" }}>{label}</span>
    </label>
  )
}

// ── Add / Edit employee modal ──────────────────────────────────────────────────
function EmployeeModal({ open, onClose, initial, orgId, shifts, onSaved }) {
  const [form,    setForm]    = useState(EMPTY)
  const [photo,   setPhoto]   = useState(null)
  const [tab,     setTab]     = useState('personal')
  const [busy,    setBusy]    = useState(false)
  const [muAll,   setMuAll]   = useState([])      // all org machine users
  const [muQ,     setMuQ]     = useState('')       // search query
  const [selMu,   setSelMu]   = useState(null)     // selected MachineUser to link on save
  const [muOpen,  setMuOpen]  = useState(false)    // dropdown open
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setTab('personal'); setPhoto(null); setSelMu(null); setMuQ(''); setMuOpen(false)
    // Load machine users for this org (both add and edit modes)
    if (orgId) {
      api.get(`/organizations/${orgId}/devices`).then(async dr => {
        const devices = dr.data || []
        if (!devices.length) return
        const org = await api.get(`/organizations/${orgId}`).catch(() => null)
        const bridgeId = org?.data?.bridgeId || org?.bridgeId
        if (!bridgeId) return
        // Fetch all machine users for each device in parallel
        const results = await Promise.allSettled(
          devices.map(dev =>
            api.get(`/organizations/${orgId}/devices/${dev.deviceId}/users`)
              .then(r => (r.data || []).map(mu => ({
                ...mu,
                orgId,
                bridgeId,
                deviceId:    dev.deviceId,
                deviceName:  dev.name   || dev.deviceId,
                deviceModel: dev.model  || '',
                bridgeName:  bridgeId,
              })))
          )
        )
        const all = results
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => r.value)
        // Deduplicate by uid+deviceId
        const seen = new Set()
        const deduped = all.filter(m => {
          const key = `${m.deviceId}-${m.uid}`
          if (seen.has(key)) return false
          seen.add(key); return true
        })
        setMuAll(deduped)
      }).catch(() => {})
    }
    setForm(initial ? {
      ...EMPTY, ...initial,
      bankDetails:      { ...EMPTY.bankDetails,      ...(initial.bankDetails      || {}) },
      address:          { ...EMPTY.address,          ...(initial.address          || {}) },
      emergencyContact: { ...EMPTY.emergencyContact, ...(initial.emergencyContact || {}) },
      leaveBalance:     { ...EMPTY.leaveBalance,     ...(initial.leaveBalance     || {}) },
      dateOfBirth:      initial.dateOfBirth?.split('T')[0]      || '',
      joiningDate:      initial.joiningDate?.split('T')[0]      || '',
      confirmationDate: initial.confirmationDate?.split('T')[0] || '',
      salary: initial.salary ?? '',
    } : EMPTY)
  }, [open, initial])

  const sf  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const sfe = k => e => sf(k, e.target.value)
  const sfb = k => e => setForm(f => ({ ...f, bankDetails:      { ...f.bankDetails,      [k]: e.target.value } }))
  const sfa = k => e => setForm(f => ({ ...f, address:          { ...f.address,          [k]: e.target.value } }))
  const sfec= k => e => setForm(f => ({ ...f, emergencyContact: { ...f.emergencyContact, [k]: e.target.value } }))
  const sflb= (k,v)  => setForm(f => ({ ...f, leaveBalance:     { ...f.leaveBalance,     [k]: Number(v)      } }))
  const toggleOff = i => { const c=form.weeklyOffDays||[]; sf('weeklyOffDays', c.includes(i)?c.filter(x=>x!==i):[...c,i]) }

  async function save() {
    if (!form.firstName.trim()) return toast('First name is required', 'error')
    setBusy(true)
    try {
      let emp
      if (initial?.employeeId) {
        const r = await api.patch(`/organizations/${orgId}/employees/${initial.employeeId}`, form)
        emp = r.data
      } else {
        const r = await api.post(`/organizations/${orgId}/employees`, form)
        emp = r.data
      }
      if (photo) {
        await api.post(`/organizations/${orgId}/employees/${emp.employeeId}/photo`, { image: photo })
          .catch(e => toast(`Photo: ${e.message}`, 'warning'))
      }
      // Link selected MachineUser to the employee (both add and edit modes)
      if (selMu) {
        const linkOrgId = selMu.orgId || orgId
        await api.post(`/organizations/${linkOrgId}/employees/${emp.employeeId}/link-machine`, {
          bridgeId: selMu.bridgeId, deviceId: selMu.deviceId, uid: selMu.uid,
        }).catch(e => toast(`Machine link: ${e.message}`, 'warning'))
      }
      toast(initial ? 'Employee updated' : 'Employee added', 'success')
      onSaved(); onClose()
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const TABS = ['personal','employment','payroll','leave','address']

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Employee' : 'Add Employee'} size="xl">
      <div style={{ display:"flex", gap:4, borderBottom:"1px solid var(--border)", marginTop:-8, overflowX:"auto", flexShrink:0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 text-xs font-mono font-semibold capitalize whitespace-nowrap border-b-2 transition-colors',
              tab===t ? 'text-accent border-accent' : 'text-muted border-transparent')}>
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto max-h-[62vh] pr-1">

        {/* PERSONAL */}
        {tab === 'personal' && <>
          {/* MachineUser picker — link a machine user (add or edit) */}
          {(
            <div className="relative">
              <label className="field-label flex items-center gap-1.5"><Cpu size={11}/> Link Biometric Machine User</label>
              <div className="relative">
                <input
                  className="field-input pr-8"
                  placeholder="Search by name, UID or card no…"
                  value={selMu ? `${selMu.name || 'UID '+selMu.uid} · ${selMu.bridgeName || selMu.bridgeId} → ${selMu.deviceName || selMu.deviceId}` : muQ}
                  onChange={e => { setMuQ(e.target.value); setSelMu(null); setMuOpen(true) }}
                  onFocus={() => setMuOpen(true)}
                  onBlur={() => setTimeout(() => setMuOpen(false), 150)}
                />
                {selMu && (
                  <button onClick={() => { setSelMu(null); setMuQ('') }}
                    style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", fontSize:"0.75rem", background:"none", border:"none", cursor:"pointer" }}>✕</button>
                )}
              </div>
              {muOpen && (
                <div style={{ position:"absolute", zIndex:50, width:"100%", marginTop:4, background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:14, boxShadow:"var(--shadow-modal)", maxHeight:192, overflowY:"auto" }}>
                  {muAll
                    .filter(m => {
                      if (!muQ) return true
                      const q = muQ.toLowerCase()
                      return (m.name||'').toLowerCase().includes(q)
                        || String(m.uid).includes(q)
                        || (m.cardno||'').toLowerCase().includes(q)
                        || m.deviceId.toLowerCase().includes(q)
                    })
                    .map((m, i) => (
                      <button key={i} type="button"
                        onClick={() => {
                          setSelMu(m)
                          setMuOpen(false)
                          setMuQ('')
                          // Auto-fill name fields from machine user
                          if (m.name) {
                            const parts = m.name.trim().split(' ')
                            sf('firstName', parts[0] || '')
                            sf('lastName',  parts.slice(1).join(' ') || '')
                          }
                        }}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"10px 12px", textAlign:"left", background:"transparent", border:"none", borderBottom:"1px solid var(--border)", cursor:"pointer" }} className="transition-colors hover:bg-surface2 border-b-0 40 last:border-0">
                        <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                          <Cpu size={12} className="text-accent"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize:"0.875rem", color:"var(--text-primary)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name || `UID ${m.uid}`}{m.cardno ? <span style={{ color:"var(--text-muted)", fontWeight:400 }}> · {m.cardno}</span> : ''}</p>
                          <p style={{ fontSize:"0.625rem", fontFamily:"monospace", color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            <span className="text-accent">{m.bridgeName || m.bridgeId}</span>
                            {' → '}
                            <span style={{ color:"var(--text-secondary)" }}>{m.deviceName || m.deviceId}</span>
                            {m.deviceModel ? <span style={{ color:"var(--text-dim)" }}> ({m.deviceModel})</span> : ''}
                            {' · UID '}{m.uid}
                            {m.deviceLocation ? <span style={{ color:"var(--text-dim)" }}> · {m.deviceLocation}</span> : ''}
                          </p>
                        </div>
                        {m.employee
                          ? <span className="text-[10px] text-orange-400 font-mono flex-shrink-0 whitespace-nowrap">linked</span>
                          : <span className="text-[10px] text-emerald-400 font-mono flex-shrink-0 whitespace-nowrap">free</span>}
                      </button>
                    ))}
                  {muAll.length === 0 && (
                    <p style={{ fontSize:"0.75rem", color:"var(--text-dim)", fontFamily:"monospace", textAlign:"center", padding:"16px 12px" }}>
                      No unlinked machine users found. Sync devices first.
                    </p>
                  )}
                </div>
              )}
              {selMu && (
                <p className="text-[10px] font-mono text-accent mt-1">
                  ✓ Will link: <strong>{selMu.name || 'UID '+selMu.uid}</strong> · {selMu.bridgeName || selMu.bridgeId} → {selMu.deviceName || selMu.deviceId} (UID {selMu.uid})
                </p>
              )}
            </div>
          )}

          <div className="flex gap-5 items-start">
            <div className="flex-shrink-0">
              <label className="field-label block text-center mb-1.5">Photo</label>
              <ImageUpload value={photo || initial?.photoUrl} onChange={setPhoto}
                onRemove={photo ? () => setPhoto(null) : undefined}
                shape="circle" hint="200×200 · max 5MB"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-2 gap-3">
                <Input label="First Name *" value={form.firstName} onChange={sfe('firstName')} placeholder="Jane"/>
                <Input label="Last Name"    value={form.lastName}  onChange={sfe('lastName')}  placeholder="Smith"/>
              </div>
              <Input label="Employee Code" value={form.employeeCode} onChange={sfe('employeeCode')} placeholder="Auto-generated if blank"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Gender</label>
              <select className="field-input" value={form.gender} onChange={sfe('gender')}>
                <option value="">— Select —</option>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
            <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={sfe('dateOfBirth')}/>
            <div>
              <label className="field-label">Blood Group</label>
              <select className="field-input" value={form.bloodGroup} onChange={sfe('bloodGroup')}>
                <option value="">—</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email"           icon={Mail}  value={form.email}   onChange={sfe('email')}   placeholder="jane@company.com" type="email"/>
            <Input label="Mobile"          icon={Phone} value={form.mobile}  onChange={sfe('mobile')}  placeholder="+91 98765 43210"  type="tel"/>
          </div>
          <Input label="Alternate Mobile" value={form.mobile2} onChange={sfe('mobile2')} placeholder="Optional"/>
        </>}

        {/* EMPLOYMENT */}
        {tab === 'employment' && <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Department"  icon={Building2} value={form.department}  onChange={sfe('department')}  placeholder="HR, IT, Finance…"/>
            <Input label="Designation" icon={Briefcase} value={form.designation} onChange={sfe('designation')} placeholder="Manager, Engineer…"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Employee Type</label>
              <select className="field-input" value={form.employeeType} onChange={sfe('employeeType')}>
                {Object.entries(TYPE_LBL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Status</label>
              <select className="field-input" value={form.status} onChange={sfe('status')}>
                {['active','inactive','terminated','resigned','absconded'].map(s=>(
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Joining Date"      type="date" value={form.joiningDate}       onChange={sfe('joiningDate')}/>
            <Input label="Confirmation Date" type="date" value={form.confirmationDate}  onChange={sfe('confirmationDate')}/>
            <Input label="Branch / Location" value={form.branchLocation} onChange={sfe('branchLocation')} placeholder="HQ, Mumbai…"/>
          </div>
          <Input label="Reporting Manager (Employee Code)" value={form.reportingTo} onChange={sfe('reportingTo')} placeholder="EMP001"/>

          <div>
            <label className="field-label flex items-center gap-1.5"><Clock size={11}/> Assigned Shift</label>
            <select className="field-input" value={form.shiftId} onChange={sfe('shiftId')}>
              <option value="">— No shift assigned —</option>
              {shifts.map(s=>(
                <option key={s.shiftId} value={s.shiftId}>
                  {s.name}{s.code?` (${s.code})`:''} · {s.defaultInTime}–{s.defaultOutTime}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Weekly Off Days <span style={{ fontWeight:400, color:"var(--text-muted)" }}>(overrides shift setting)</span></label>
            <div className="flex gap-1.5">
              {DAYS.map((d,i)=>(
                <button key={i} type="button" onClick={()=>toggleOff(i)}
                  style={{
                    width:36, height:36, borderRadius:8, fontSize:'0.625rem', fontFamily:'monospace',
                    fontWeight:700, transition:'all .15s', cursor:'pointer',
                    background:(form.weeklyOffDays||[]).includes(i)?'rgba(248,113,113,.1)':'var(--bg-surface2)',
                    border:`1px solid ${(form.weeklyOffDays||[]).includes(i)?'rgba(248,113,113,.3)':'var(--border)'}`,
                    color:(form.weeklyOffDays||[]).includes(i)?'#f87171':'var(--text-muted)',
                  }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Late Grace (min)"  type="number" value={form.graceMinutes}   onChange={e=>sf('graceMinutes',  Number(e.target.value))} placeholder="0"/>
            <Input label="Half-Day (min)"    type="number" value={form.halfDayMinutes} onChange={e=>sf('halfDayMinutes',Number(e.target.value))} placeholder="240"/>
          </div>
          <CB checked={form.overtimeAllowed} onChange={()=>sf('overtimeAllowed',!form.overtimeAllowed)} label="Overtime allowed"/>
          <Input label="Notes" value={form.notes} onChange={sfe('notes')} placeholder="Internal remarks…"/>
        </>}

        {/* PAYROLL */}
        {tab === 'payroll' && <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Salary" type="number" value={form.salary} onChange={sfe('salary')} placeholder="25000"/>
            <div>
              <label className="field-label">Salary Type</label>
              <select className="field-input" value={form.salaryType} onChange={sfe('salaryType')}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PAN Number" value={form.panNumber} onChange={sfe('panNumber')} placeholder="ABCDE1234F"/>
            <Input label="UAN (EPF)"  value={form.uanNumber} onChange={sfe('uanNumber')} placeholder="100XXXXXXXXX"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PF Number"  value={form.pfNumber}  onChange={sfe('pfNumber')}  placeholder="KN/BN/1234567"/>
            <Input label="ESI Number" value={form.esiNumber} onChange={sfe('esiNumber')} placeholder="1234567890"/>
          </div>
          <p className="field-label mt-1">Bank Details</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Account Number" value={form.bankDetails.accountNumber} onChange={sfb('accountNumber')} placeholder="0000 0000 0000"/>
            <Input label="Account Name"   value={form.bankDetails.accountName}   onChange={sfb('accountName')}   placeholder="Jane Smith"/>
            <Input label="Bank Name"      value={form.bankDetails.bankName}      onChange={sfb('bankName')}      placeholder="SBI, HDFC…"/>
            <Input label="IFSC Code"      value={form.bankDetails.ifscCode}      onChange={sfb('ifscCode')}      placeholder="SBIN0001234"/>
            <Input label="Branch"         value={form.bankDetails.branchName}    onChange={sfb('branchName')}    placeholder="Koramangala"/>
            <div>
              <label className="field-label">Account Type</label>
              <select className="field-input" value={form.bankDetails.accountType} onChange={sfb('accountType')}>
                <option value="savings">Savings</option>
                <option value="current">Current</option>
              </select>
            </div>
          </div>
        </>}

        {/* LEAVE */}
        {tab === 'leave' && <>
          <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", fontFamily:"monospace" }}>Annual leave entitlements (days per year)</p>
          <div className="grid grid-cols-3 gap-3">
            {Object.keys(EMPTY.leaveBalance).map(k=>(
              <Input key={k} label={k.charAt(0).toUpperCase()+k.slice(1)+' Leave'} type="number"
                value={form.leaveBalance[k]} onChange={e=>sflb(k,e.target.value)} placeholder="0"/>
            ))}
          </div>
        </>}

        {/* ADDRESS */}
        {tab === 'address' && <>
          <p className="field-label">Residential Address</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input label="Line 1" value={form.address.line1} onChange={sfa('line1')} placeholder="House/Flat, Street"/>
            </div>
            <Input label="Line 2"  value={form.address.line2}   onChange={sfa('line2')}   placeholder="Area, Locality"/>
            <Input label="City"    value={form.address.city}    onChange={sfa('city')}    placeholder="Bangalore"/>
            <Input label="State"   value={form.address.state}   onChange={sfa('state')}   placeholder="Karnataka"/>
            <Input label="Pincode" value={form.address.pincode} onChange={sfa('pincode')} placeholder="560001"/>
          </div>
          <p className="field-label mt-1">Emergency Contact</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Name"         value={form.emergencyContact.name}         onChange={sfec('name')}         placeholder="John Smith"/>
            <Input label="Relationship" value={form.emergencyContact.relationship} onChange={sfec('relationship')} placeholder="Spouse, Parent…"/>
            <Input label="Phone"        value={form.emergencyContact.phone}        onChange={sfec('phone')}        placeholder="+91…" type="tel"/>
          </div>
        </>}
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:12, borderTop:"1px solid var(--border)", flexShrink:0 }}>
        <div className="flex gap-1.5">
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={tab===t?'bg-accent scale-125':''}/>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{initial?'Update Employee':'Add Employee'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Employee detail + machine link modal ───────────────────────────────────────
function DetailModal({ open, onClose, emp, orgId, onRefresh }) {
  const [detail,   setDetail]   = useState(null)
  const [muList,   setMuList]   = useState([])
  const [loading,  setLoad]     = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [tab,      setTab]      = useState('machines')
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !emp) return
    setTab('machines'); loadAll()
  }, [open, emp])

  async function loadAll() {
    setLoad(true)
    try {
      // Fetch employee detail + org devices in parallel
      const [dr, devR, orgR] = await Promise.allSettled([
        api.get(`/organizations/${orgId}/employees/${emp.employeeId}`),
        api.get(`/organizations/${orgId}/devices`),
        api.get(`/organizations/${orgId}`),
      ])
      if (dr.status === 'fulfilled') setDetail(dr.value.data)

      // Fetch machine users per device using bridgeId + deviceId
      if (devR.status === 'fulfilled' && orgR.status === 'fulfilled') {
        const devices   = devR.value.data || []
        const bridgeId  = orgR.value.data?.bridgeId || orgR.value.bridgeId
        if (devices.length && bridgeId) {
          const results = await Promise.allSettled(
            devices.map(dev =>
              api.get(`/organizations/${orgId}/devices/${dev.deviceId}/users`)
                .then(r => (r.data || []).map(mu => ({
                  ...mu,
                  orgId,
                  bridgeId,
                  deviceId:   dev.deviceId,
                  deviceName: dev.name || dev.deviceId,
                })))
            )
          )
          const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value)
          // Deduplicate
          const seen = new Set()
          setMuList(all.filter(m => {
            const key = `${m.deviceId}-${m.uid}`
            if (seen.has(key)) return false
            seen.add(key); return true
          }))
        }
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  async function link(mu) {
    setLinkBusy(true)
    try {
      await api.post(`/organizations/${orgId}/employees/${emp.employeeId}/link-machine`,
        { bridgeId: mu.bridgeId, deviceId: mu.deviceId, uid: mu.uid })
      toast(`UID ${mu.uid} linked`, 'success')
      loadAll(); onRefresh()
    } catch (e) { toast(e.message, 'error') }
    finally { setLinkBusy(false) }
  }

  async function unlink(mu) {
    setLinkBusy(true)
    try {
      await api.delete(`/organizations/${orgId}/employees/${emp.employeeId}/link-machine`,
        { data: { bridgeId: mu.bridgeId, deviceId: mu.deviceId, uid: mu.uid } })
      toast(`UID ${mu.uid} unlinked`, 'success')
      loadAll(); onRefresh()
    } catch (e) { toast(e.message, 'error') }
    finally { setLinkBusy(false) }
  }

  const linked    = muList.filter(m => m.userId === emp?.employeeId)
  const available = muList.filter(m => !m.userId)

  return (
    <Modal open={open} onClose={onClose}
      title={emp ? (emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim()) : ''}
      description={emp?.employeeCode || emp?.employeeId} size="lg">

      <div style={{ display:"flex", gap:4, borderBottom:"1px solid var(--border)", marginTop:-8 }}>
        {['machines','details'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding:'8px 16px', fontSize:'0.75rem', fontFamily:'monospace', fontWeight:600,
              textTransform:'capitalize', borderBottom:`2px solid ${tab===t?'var(--accent)':'transparent'}`,
              color: tab===t ? 'var(--accent)' : 'var(--text-muted)',
              background:'transparent', cursor:'pointer', transition:'all .15s',
            }}>
            {t === 'machines' ? `Biometric Machines (${linked.length})` : 'Details'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-lg"/>)}</div>
      ) : tab === 'machines' ? (
        <div className="">
          {/* Linked */}
          <div>
            <p className="field-label mb-2">Linked to this employee</p>
            {linked.length === 0 ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"32px 0", color:"var(--text-muted)", border:"1px dashed var(--border)", borderRadius:12, gap:8 }}>
                <Cpu size={28} className="opacity-30"/>
                <p className="text-sm">No machines linked yet</p>
                <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", textAlign:"center" }}>Link a machine below so attendance records map to this employee</p>
              </div>
            ) : (
              <div className="" style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {linked.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/20">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                      <Cpu size={14} className="text-accent"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize:"0.875rem", fontWeight:600, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"monospace" }}>{m.deviceId}</p>
                      <p style={{ fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-muted)" }}>
                        UID: {m.uid}{m.name ? ` · ${m.name}` : ''}{m.cardno ? ` · Card: ${m.cardno}` : ''}
                      </p>
                    </div>
                    <Badge variant="green" dot>Linked</Badge>
                    <button onClick={() => unlink(m)} disabled={linkBusy}
                      className="btn-icon btn-sm hover:text-red-400 hover:bg-red-500/10" title="Unlink">
                      <Link2Off size={13}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available to link */}
          <div>
            <p className="field-label mb-2">Available Machine Users · {available.length} unlinked</p>
            {available.length === 0 ? (
              <p style={{ fontSize:"0.75rem", color:"var(--text-dim)", fontFamily:"monospace", textAlign:"center", padding:"16px 0" }}>
                No unlinked machine users found.<br/>Sync device users from Organizations → Machines → Sync.
              </p>
            ) : (
              <div style={{ maxHeight:'13rem', overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                {available.map((m, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:10, borderRadius:8, background:"var(--bg-surface2)", border:"1px solid var(--border)", transition:"all .15s" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:"var(--bg-elevated)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Cpu size={12} style={{ color:"var(--text-muted)" }}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize:"0.75rem", fontWeight:600, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name || `UID ${m.uid}`}</p>
                      <p style={{ fontSize:"0.625rem", fontFamily:"monospace", color:"var(--text-dim)" }}>
                        {m.deviceId} · UID {m.uid}{m.cardno ? ` · ${m.cardno}` : ''}
                        {m.employee ? <span style={{ color:"#d97706" }}> · linked to {m.employee.displayName || m.employee.firstName}</span> : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => link(m)} loading={linkBusy}>
                      <Link2 size={11}/> Link
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Details tab */
        detail && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <UserAvatar name={detail.displayName||detail.firstName||'?'} photoUrl={detail.photoUrl} size={64}/>
              <div>
                <p style={{ fontSize:"1.125rem", fontWeight:700, color:"var(--text-primary)" }}>{detail.displayName || `${detail.firstName} ${detail.lastName||''}`}</p>
                <p style={{ fontSize:"0.875rem", color:"var(--text-muted)" }}>{detail.designation} · {detail.department}</p>
                <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap", alignItems:"center" }}>
                  <Badge variant={STATUS_CLR[detail.status]||'gray'} dot className="capitalize">{detail.status}</Badge>
                  {detail.shift && (
                    <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-secondary)" }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: detail.shift.color || '#58a6ff' }}/>
                      {detail.shift.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                { l:'Employee Code', v: detail.employeeCode },
                { l:'Employee Type', v: TYPE_LBL[detail.employeeType] },
                { l:'Joining Date',  v: fmtDate(detail.joiningDate) },
                { l:'Email',         v: detail.email },
                { l:'Mobile',        v: detail.mobile },
                { l:'Branch',        v: detail.branchLocation },
                { l:'Salary',        v: detail.salary ? `₹${Number(detail.salary).toLocaleString('en-IN')} /${detail.salaryType}` : '—' },
                { l:'PAN',           v: detail.panNumber },
                { l:'PF No.',        v: detail.pfNumber },
                { l:'UAN',           v: detail.uanNumber },
              ].map(r => (
                <div key={r.l} style={{ display:"flex", flexDirection:"column", gap:2, padding:10, borderRadius:8, background:"var(--bg-surface2)", border:"1px solid var(--border)" }}>
                  <span style={{ fontSize:"0.6875rem", fontFamily:"monospace", color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:600 }}>{r.l}</span>
                  <span style={{ fontSize:"0.875rem", fontWeight:500, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:1 }}>{r.v || '—'}</span>
                </div>
              ))}
            </div>

            {detail.shift && (
              <div style={{ padding:"12px 16px", borderRadius:12, background:"var(--accent-muted)", border:"1px solid var(--accent-border)", fontSize:"0.75rem", display:"flex", flexDirection:"column", gap:4 }}>
                <p style={{ fontWeight:700, color:"var(--accent)", fontSize:"0.8125rem" }}>Shift: {detail.shift.name}</p>
                <p style={{ color:"var(--text-muted)" }}>{detail.shift.defaultInTime} – {detail.shift.defaultOutTime} · {detail.shift.durationMinutes} min</p>
                <p style={{ color:"var(--text-muted)" }}>Off: {DAYS.filter((_,i)=>(detail.shift.weeklyOffDays||[]).includes(i)).join(', ')||'None'}</p>
                {detail.shift.breaks?.length > 0 && (
                  <p style={{ color:"var(--text-muted)" }}>Break: {detail.shift.breaks.map(b=>`${b.label} ${b.startTime}–${b.endTime}`).join(' · ')}</p>
                )}
              </div>
            )}

            {/* Leave balances */}
            {detail.leaveBalance && (
              <div>
                <p style={{ fontSize:"0.8125rem", fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Leave Balance</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(detail.leaveBalance).map(([k,v]) => v > 0 && (
                    <div key={k} style={{ background:"var(--bg-surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"8px 14px", textAlign:"center" }}>
                      <p style={{ color:"var(--accent)", fontWeight:700, fontFamily:"monospace", fontSize:"1rem" }}>{v}</p>
                      <p style={{ fontSize:"0.5625rem", color:"var(--text-muted)", textTransform:"capitalize" }}>{k}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      <div style={{ display:"flex", justifyContent:"flex-end", paddingTop:8, borderTop:"1px solid var(--border)" }}>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}

// ── Table row ──────────────────────────────────────────────────────────────────
function fmtAgo(date) {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return new Date(date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
}

function EmpRow({ emp, onEdit, onDelete, onView }) {
  return (
    <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }} className="tbl-row">
      <td className="tbl-cell">
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <UserAvatar name={emp.displayName||emp.firstName||'?'} photoUrl={emp.photoUrl} size={36}/>
          <div className="min-w-0">
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <p style={{ fontWeight:600, color:"var(--text-primary)", fontSize:"0.875rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim()}
              </p>
              <GenderIcon gender={emp.gender}/>
            </div>
            <p style={{ fontSize:"0.625rem", fontFamily:"monospace", color:"var(--text-muted)" }}>{emp.employeeCode}</p>
          </div>
        </div>
      </td>
      <td className="tbl-cell">
        <p style={{ fontSize:"0.875rem", color:"var(--text-secondary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.designation || '—'}</p>
        <p style={{ fontSize:"0.625rem", color:"var(--text-muted)" }}>{emp.department || '—'}</p>
      </td>
      <td className="tbl-cell">
        <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.mobile || emp.email || '—'}</p>
      </td>
      <td className="tbl-cell">
        {emp.shift
          ? <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.75rem" }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: emp.shift.color||'#58a6ff' }}/>
              <span style={{ color:"var(--text-secondary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.shift.name}</span>
            </span>
          : <span style={{ color:"var(--text-dim)", fontSize:"0.75rem" }}>—</span>}
      </td>
      <td className="tbl-cell">
        {emp.machineCount > 0 ? (
          <div>
            <span className="flex items-center gap-1.5 text-xs text-accent font-mono">
              <Cpu size={11}/>{emp.machineCount} machine{emp.machineCount!==1?'s':''}
            </span>
            {emp.lastSync && (
              <p className="text-[9px] font-mono mt-0.5" style={{ color:'var(--text-muted)' }}>
                synced {fmtAgo(emp.lastSync)}
              </p>
            )}
          </div>
        ) : (
          <button onClick={() => onView(emp)}
            className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-mono transition-colors">
            <AlertTriangle size={10}/> Link machine
          </button>
        )}
      </td>
      <td className="tbl-cell">
        {emp.lastPunch ? (
          <div>
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color:'#34d399' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', display:'inline-block' }}/>
              {new Date(emp.lastPunch).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
            </span>
            <p className="text-[9px] font-mono mt-0.5" style={{ color:'var(--text-muted)' }}>
              {fmtAgo(emp.lastPunch)}
            </p>
          </div>
        ) : (
          <span className="text-[10px] font-mono" style={{ color:'var(--text-dim)' }}>No punches</span>
        )}
      </td>
      <td className="tbl-cell">
        <Badge variant={STATUS_CLR[emp.status]||'gray'} dot className="capitalize">{emp.status}</Badge>
      </td>
      <td className="tbl-cell">
        <div style={{ display:'flex', gap:5 }}>
          <UserActionBtn label="View"   icon={Eye}   onClick={() => onView(emp)}   hoverColor="#58a6ff"/>
          <UserActionBtn label="Edit"   icon={Edit3} onClick={() => onEdit(emp)}   hoverColor="#facc15"/>
          <UserActionBtn label="Delete" icon={Trash2} onClick={() => onDelete(emp)} danger/>
        </div>
      </td>
    </motion.tr>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Employees() {
  const { ready } = useAuth()
  const { toast } = useToast()

  const { orgId } = useOrgContext()
  const [shifts,      setShifts]    = useState([])
  const [emps,        setEmps]      = useState([])
  const [total,       setTotal]     = useState(0)
  const [page,        setPage]      = useState(1)
  const [q,           setQ]         = useState('')
  const [fDept,       setFDept]     = useState('')
  const [fShift,      setFShift]    = useState('')
  const [fStatus,     setFStatus]   = useState('active')
  const [fLinked,     setFLinked]   = useState('')   // 'linked' | 'unlinked' | ''
  const [loading,     setLoad]      = useState(false)
  const [empStats,    setEmpStats]  = useState(null)
  const [plan,        setPlan]      = useState(null)
  const [modal,       setModal]     = useState(false)
  const [editing,     setEdit]      = useState(null)
  const [viewing,     setView]      = useState(null)
  const [delTarget,   setDel]       = useState(null)
  const [delBusy,     setDelBusy]   = useState(false)
  const [depts,       setDepts]     = useState([])

  // orgs loaded by OrgContextBar in AppShell — no local load needed

  async function loadMeta(oid) {
    const [sr, dr, stats, subr] = await Promise.allSettled([
      api.get(`/organizations/${oid}/shifts`),
      api.get(`/organizations/${oid}/employees/meta/departments`),
      api.get(`/organizations/${oid}/employees/meta/stats`),
      api.get('/subscriptions/my'),
    ])
    if (sr.status==='fulfilled')   setShifts(sr.value.data || [])
    if (dr.status==='fulfilled')   setDepts(dr.value.data?.departments || [])
    if (stats.status==='fulfilled') setEmpStats(stats.value.data)
    if (subr.status==='fulfilled' && subr.value.data?.plan) setPlan(subr.value.data.plan)
  }

  async function load(oid = orgId) {
    if (!oid) return
    setLoad(true)
    try {
      const p = new URLSearchParams({ page, limit:50 })
      if (q)      p.set('q', q)
      if (fDept)  p.set('department', fDept)
      if (fShift) p.set('shiftId', fShift)
      if (fStatus)p.set('status', fStatus)
      const r = await api.get(`/organizations/${oid}/employees?${p}`)
      const data = r.data||[]
      const filtered = fLinked === 'linked'   ? data.filter(e => e.machineCount > 0)
                     : fLinked === 'unlinked' ? data.filter(e => !e.machineCount || e.machineCount === 0)  // employees with no machine
                     : data
      setEmps(filtered); setTotal(fLinked ? filtered.length : r.total||0)
    } catch (e) { toast(e.message,'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready && orgId) { load(orgId); loadMeta(orgId) } }, [ready, orgId])

  useEffect(() => { if (orgId) load(orgId) }, [page, q, fDept, fShift, fStatus, fLinked])

  async function deleteEmp() {
    if (!delTarget) return
    setDelBusy(true)
    try {
      await api.delete(`/organizations/${orgId}/employees/${delTarget.employeeId}`)
      toast('Employee deleted','success'); setDel(null); load()
    } catch (e) { toast(e.message,'error') }
    finally { setDelBusy(false) }
  }

  const pages = Math.ceil(total/50)

  return (
    <UserPage>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.03em', display:'flex', alignItems:'center', gap:10 }}>
            <Users size={26} style={{ color:'#58a6ff' }}/> Employees
          </h1>
          <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginTop:6 }}>{total} employees · HR management</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="secondary" size="sm" onClick={()=>load()}><RefreshCw size={13}/></Button>
          <Button onClick={()=>{ setEdit(null); setModal(true) }}><Plus size={15}/> Add Employee</Button>
        </div>
      </div>

      {/* Stat cards */}
      {(() => {
        const maxEmp = plan?.maxEmployees >= 99999 ? '∞' : (plan?.maxEmployees ?? null)
        const s = empStats
        return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
            {/* Total employees vs plan limit */}
            <UserStatCard label="Employees"
              value={s ? `${s.total}${maxEmp ? ` / ${maxEmp}` : ''}` : total}
              sub={maxEmp ? `${maxEmp} permitted` : undefined}
              icon={Users} accent="#58a6ff" index={0}
              active={!fStatus && !fLinked}
              onClick={() => { setFStatus(''); setFLinked(''); setPage(1) }}/>
            {/* Active */}
            <UserStatCard label="Active"
              value={s?.active ?? '…'}
              icon={UserCheck} accent="#34d399" index={1}
              active={fStatus==='active' && !fLinked}
              onClick={() => { setFStatus(fStatus==='active'?'':'active'); setFLinked(''); setPage(1) }}/>
            {/* Inactive */}
            <UserStatCard label="Inactive"
              value={s?.inactive ?? '…'}
              icon={UserMinus} accent="#5a5a7a" index={2}
              active={fStatus==='inactive'}
              onClick={() => { setFStatus(fStatus==='inactive'?'':'inactive'); setFLinked(''); setPage(1) }}/>
            {/* Machine users: linked / total on device */}
            <UserStatCard label="Linked Users"
              value={s ? `${s.muLinked ?? 0} / ${s.muTotal ?? 0}` : '…'}
              sub={s ? `of ${s.muTotal ?? 0} on device` : undefined}
              icon={Cpu} accent="#c084fc" index={3}
              active={fLinked==='linked'}
              onClick={() => { setFLinked(fLinked==='linked'?'':'linked'); setFStatus(''); setPage(1) }}/>
            {/* Biometric records with no employee mapped yet */}
            <UserStatCard label="Pending Link"
              value={s ? (s.muUnlinked ?? 0) : '…'}
              sub={s ? `${s.muUnlinked ?? 0} of ${s.muTotal ?? 0} unlinked` : undefined}
              icon={Shield} accent="#fb923c" index={4}
              active={fLinked==='unlinked'}
              onClick={() => { setFLinked(fLinked==='unlinked'?'':'unlinked'); setFStatus(''); setPage(1) }}/>
            {/* Terminated / resigned */}
            <UserStatCard label="Terminated"
              value={s?.terminated ?? '…'}
              icon={UserX} accent="#f87171" index={5}
              active={fStatus==='terminated'}
              onClick={() => { setFStatus(fStatus==='terminated'?'':'terminated'); setFLinked(''); setPage(1) }}/>
          </div>
        )
      })()}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search name, code, email…" icon={Search} value={q}
          onChange={e=>{ setQ(e.target.value); setPage(1) }} className="w-56"/>
        <select value={fStatus} onChange={e=>{ setFStatus(e.target.value); setPage(1) }} className="field-input w-auto text-xs">
          <option value="">All Statuses</option>
          {['active','inactive','terminated','resigned'].map(s=>(
            <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
          ))}
        </select>
        {depts.length > 0 && (
          <select value={fDept} onChange={e=>{ setFDept(e.target.value); setPage(1) }} className="field-input w-auto text-xs">
            <option value="">All Departments</option>
            {depts.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {shifts.length > 0 && (
          <select value={fShift} onChange={e=>{ setFShift(e.target.value); setPage(1) }} className="field-input w-auto text-xs">
            <option value="">All Shifts</option>
            {shifts.map(s=><option key={s.shiftId} value={s.shiftId}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div style={{ background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden", overflowX:"auto", boxShadow:"var(--shadow-card)" }}>
        <table style={{ width:"100%", minWidth:720 }}>
          <thead>
            <tr className="tbl-row">
              <th className="tbl-head">Employee</th>
              <th className="tbl-head">Role / Dept</th>
              <th className="tbl-head">Contact</th>
              <th className="tbl-head">Shift</th>
              <th className="tbl-head">Biometric</th>
              <th className="tbl-head">Last Punch</th>
              <th className="tbl-head">Status</th>
              <th className="tbl-head">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid var(--border-soft)" }}>
                    {Array.from({length:7}).map((_,j)=>(
                      <td key={j} className="tbl-cell"><div className="h-4 shimmer rounded w-24"/></td>
                    ))}
                  </tr>
                ))
              : emps.map(emp=>(
                  <EmpRow key={emp.employeeId} emp={emp}
                    onView={e=>setView(e)}
                    onEdit={e=>{ setEdit(e); setModal(true) }}
                    onDelete={e=>setDel(e)}/>
                ))}
          </tbody>
        </table>
        {!loading && emps.length === 0 && (
          <Empty icon={Users} title="No employees found"
            description="Add your first employee or adjust the filters."
            action={<Button onClick={()=>{ setEdit(null); setModal(true) }} size="sm"><Plus size={13}/> Add Employee</Button>}/>
        )}
      </div>

      {pages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <Button variant="secondary" size="sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Prev</Button>
          <span style={{ fontSize:"0.875rem", color:"var(--text-muted)", fontFamily:"monospace" }}>Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" onClick={()=>setPage(p=>p+1)} disabled={page>=pages}>Next →</Button>
        </div>
      )}

      <EmployeeModal open={modal} onClose={()=>setModal(false)} initial={editing}
        orgId={orgId} shifts={shifts} onSaved={()=>{ load(); loadMeta(orgId) }}/>
      <DetailModal open={!!viewing} onClose={()=>setView(null)}
        emp={viewing} orgId={orgId} onRefresh={()=>load()}/>
      <ConfirmModal open={!!delTarget} onClose={()=>setDel(null)} onConfirm={deleteEmp} loading={delBusy} danger
        title="Delete Employee"
        message={`Delete "${delTarget?.displayName||delTarget?.firstName}"? All machine links will be removed.`}/>
    </UserPage>
  )
}