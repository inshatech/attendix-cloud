import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Lock, Unlock, Key, Trash2, CreditCard, RefreshCw, User, Mail, Phone, Clock, Building2, CheckCircle2, XCircle, AlertTriangle, Ban, TrendingDown } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { ActionBtn } from '../../components/ui/ActionBtn'
import { AdminPage, PageHeader, StatCard, SectionCard, FilterTabs, SearchBox } from '../../components/admin/AdminUI'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../store/auth'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—' }
function fmtAgo(d) {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d)) / 86400000)
  if (days === 0) return 'Today'; if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`; return fmtDate(d)
}
function daysLeft(d) { return d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null }

const ROLE_ACCENT = { admin: '#c084fc', support: '#22d3ee', user: '#58a6ff' }
const SUB_STATUS = {
  active:  { color:'#34d399', bg:'rgba(52,211,153,.1)',  border:'rgba(52,211,153,.25)',  label:'Active'  },
  trial:   { color:'#facc15', bg:'rgba(250,204,21,.1)',  border:'rgba(250,204,21,.25)',  label:'Trial'   },
  expired: { color:'#f87171', bg:'rgba(248,113,113,.1)', border:'rgba(248,113,113,.25)', label:'Expired' },
  none:    { color:'var(--text-dim)', bg:'var(--bg-surface2)', border:'var(--border)', label:'No Plan' },
}

function SubPill({ sub, plans = [] }) {
  const s    = SUB_STATUS[sub?.status] || SUB_STATUS.none
  const days = sub ? daysLeft(sub.endDate) : null
  const name = sub ? (plans.find(p => p.planId === sub.planId)?.name || sub.planId?.slice(0,14) || 'Plan') : 'No Plan'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:99, background:s.bg, border:`1px solid ${s.border}`, fontSize:'0.875rem', fontWeight:600, color:s.color, whiteSpace:'nowrap' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
      {name}
      {days !== null && days >= 0 && <span style={{ opacity:0.65, fontWeight:400 }}>· {days}d</span>}
      {days !== null && days < 0  && <span style={{ opacity:0.65, fontWeight:400 }}>· expired</span>}
    </span>
  )
}

function UserDetailModal({ open, onClose, user, plans, onRefresh }) {
  const { toast } = useToast()
  const [detail,     setDetail]    = useState(null)
  const [subHistory, setSubHistory] = useState([])
  const [loading,    setLoad]       = useState(false)
  const [tab,        setTab]        = useState('overview')
  const [subForm,    setSubForm]    = useState({ planId:'', durationDays:30, notes:'' })
  const [busy,       setBusy]       = useState(false)
  const [editForm,   setEditForm]   = useState({ name:'', email:'', mobile:'', role:'' })
  const [editBusy,   setEditBusy]   = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setTab('overview'); setSubForm({ planId: plans[0]?.planId||'', durationDays:30, notes:'' })
    setEditForm({ name: user.name||'', email: user.email||'', mobile: user.mobile||'', role: user.role||'user' })
    setSubHistory([]); setLoad(true)
    // Fetch user detail first — always
    api.get(`/admin/users/${user.userId}`)
      .then(dr => setDetail(dr.data))
      .catch(e => toast(e.message,'error'))
      .finally(() => setLoad(false))
    // Fetch payment history separately — failure won't break modal
    api.get(`/admin/subscriptions?userId=${user.userId}&limit=50`)
      .then(hr => {
        const pm   = Object.fromEntries(plans.map(p=>[p.planId,p]))
        const hist = (hr.data||[]).map(s=>({ ...s,
          planName:  pm[s.planId]?.name  || s.planId,
          planIcon:  pm[s.planId]?.icon  || '📦',
          planColor: pm[s.planId]?.color || '#58a6ff',
        }))
        setSubHistory(hist)
      })
      .catch(() => {}) // non-critical
  }, [open, user?.userId])

  async function assignSub() {
    if (!subForm.planId) return toast('Select a plan','error')
    setBusy(true)
    try {
      await api.post(`/admin/users/${user.userId}/assign-subscription`, subForm)
      toast('Subscription assigned!','success'); onRefresh()
      const r = await api.get(`/admin/users/${user.userId}`); setDetail(r.data)
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function saveEdit() {
    setEditBusy(true)
    try {
      const body = {}
      if (editForm.name.trim()   && editForm.name.trim()   !== user.name)   body.name   = editForm.name.trim()
      if (editForm.email.trim()  && editForm.email.trim()  !== user.email)  body.email  = editForm.email.trim()
      if (editForm.mobile.trim() && editForm.mobile.trim() !== user.mobile) body.mobile = editForm.mobile.trim()
      if (editForm.role          && editForm.role           !== user.role)   body.role   = editForm.role
      if (!Object.keys(body).length) return toast('No changes made', 'error')
      await api.patch(`/admin/users/${user.userId}`, body)
      toast('User updated', 'success')
      onRefresh()
      onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setEditBusy(false) }
  }

  if (!user) return null
  const sub  = detail?.subscription || user.subscription
  const days = daysLeft(sub?.endDate)
  const ss   = SUB_STATUS[sub?.status] || SUB_STATUS.none
  const ra   = ROLE_ACCENT[user.role] || '#58a6ff'

  return (
    <Modal open={open} onClose={onClose} title={undefined} size="lg" noBodyPad>
      {/* Fixed header — user info */}
      <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:12 }}>
          <div style={{ width:60, height:60, borderRadius:'50%', background:`${ra}18`, border:`2.5px solid ${ra}45`, boxShadow:`0 0 16px ${ra}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.25rem', fontWeight:700, color:ra, flexShrink:0, overflow:'hidden' }}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : (user.name||'?')[0].toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              <p style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--text-primary)' }}>{user.name}</p>
              <span style={{ fontSize:'0.8125rem', padding:'3px 10px', borderRadius:99, background:`${ra}15`, color:ra, border:`1px solid ${ra}30`, fontWeight:600, textTransform:'capitalize' }}>{user.role}</span>
              {!user.isActive && <span style={{ fontSize:'0.8125rem', padding:'3px 10px', borderRadius:99, background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.25)', fontWeight:600 }}>Locked</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <ActionBtn label={user.isActive ? 'Lock' : 'Unlock'} icon={user.isActive ? Lock : Unlock}
              onClick={async () => { try { await api.post(`/admin/users/${user.userId}/lock`, { locked: user.isActive }); toast(`Account ${user.isActive?'locked':'unlocked'}`,'success'); onRefresh() } catch(e){toast(e.message,'error')} }}
              danger={user.isActive} hoverColor={user.isActive ? '#f87171' : '#34d399'}/>
            <ActionBtn label="Reset PW" icon={Key} hoverColor="#facc15"
              onClick={async () => { const pw = prompt(`New password for ${user.name} (min 8 chars):`); if (!pw || pw.length < 8) return toast('Too short','error'); try { await api.post(`/admin/users/${user.userId}/reset-password`, { newPassword: pw }); toast('Password reset','success') } catch(e){toast(e.message,'error')} }}/>
            <button onClick={onClose} style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-muted)', flexShrink:0, marginLeft:4 }}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-surface2)'; e.currentTarget.style.color='var(--text-primary)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-muted)'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 18px', paddingLeft:66 }}>
          {user.email  && <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.9375rem', color:'var(--text-secondary)' }}><Mail size={13} style={{ color:'#58a6ff' }}/>{user.email}</span>}
          {user.mobile && <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.9375rem', color:'var(--text-secondary)' }}><Phone size={13} style={{ color:'#34d399' }}/>{user.mobile}</span>}
          <span style={{ fontSize:'0.875rem', color:'var(--text-muted)', fontFamily:'monospace' }}>ID: {user.userId}</span>
        </div>
      </div>

      {/* Sticky tabs */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg-elevated)', flexShrink:0 }}>
        <FilterTabs tabs={[{id:'overview',label:'Overview'},{id:'edit',label:'Edit'},{id:'subscription',label:'Subscription'},{id:'sessions',label:'Sessions'}]} active={tab} onChange={setTab}/>
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px 24px' }}>
        {loading ? <div className="">{[1,2,3].map(i=><div key={i} className="h-12 shimmer rounded-xl"/>)}</div> : (<>
          {tab === 'overview' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'User ID',         value: user.userId,              mono:true  },
                { label:'Role',            value: user.role,                color: ra  },
                { label:'Organizations',   value: `${user.orgCount||0} orgs`            },
                { label:'Joined',          value: fmtDate(user.createdAt)               },
                { label:'Email',           value: user.email||'—',          mono:true  },
                { label:'Mobile',          value: user.mobile||'—',         mono:true  },
                { label:'Email Verified',  value: user.emailVerified  ? '✓ Verified' : '✗ Not verified', color: user.emailVerified  ? '#34d399' : '#f87171' },
                { label:'Mobile Verified', value: user.mobileVerified ? '✓ Verified' : '✗ Not verified', color: user.mobileVerified ? '#34d399' : '#f87171' },
              ].map(item => (
                <div key={item.label} style={{ background:'var(--bg-surface2)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px' }}>
                  <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>{item.label}</p>
                  <p style={{ fontSize:'1.0625rem', fontWeight:600, color: item.color || (item.mono ? 'var(--text-muted)' : 'var(--text-primary)'), fontFamily: item.mono ? 'monospace' : 'inherit', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }}>{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'edit' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <Input label="Full Name" value={editForm.name} onChange={e => setEditForm(f=>({...f, name:e.target.value}))} placeholder="Full name" icon={User}/>
              <Input label="Email Address" value={editForm.email} onChange={e => setEditForm(f=>({...f, email:e.target.value}))} placeholder="email@example.com" type="email" icon={Mail}/>
              <Input label="Mobile" value={editForm.mobile} onChange={e => setEditForm(f=>({...f, mobile:e.target.value}))} placeholder="+91 98765 43210" icon={Phone}/>
              <div>
                <label style={{ display:'block', fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', marginBottom:7, textTransform:'uppercase', letterSpacing:'0.06em' }}>Role</label>
                <div style={{ display:'flex', gap:8 }}>
                  {['user','support','admin'].map(r => (
                    <button key={r} onClick={() => setEditForm(f=>({...f, role:r}))}
                      style={{ flex:1, padding:'10px 12px', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:'0.875rem', textTransform:'capitalize', transition:'all .15s',
                        background: editForm.role===r ? `${ROLE_ACCENT[r]}18` : 'var(--bg-surface2)',
                        border: `2px solid ${editForm.role===r ? ROLE_ACCENT[r] : 'var(--border)'}`,
                        color: editForm.role===r ? ROLE_ACCENT[r] : 'var(--text-muted)',
                      }}>{r}</button>
                  ))}
                </div>
              </div>
              <Button onClick={saveEdit} loading={editBusy} style={{ width:'100%', marginTop:4 }}>
                Save Changes
              </Button>
            </div>
          )}

          {tab === 'subscription' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:'var(--bg-surface2)', border:`1px solid ${ss.border}`, borderRadius:14, padding:16, borderLeft:`3px solid ${ss.color}` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Current Plan</span>
                  <SubPill sub={sub} plans={plans}/>
                </div>
                {sub ? (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                    {[
                      { label:'Plan Name',   value: plans.find(p=>p.planId===sub.planId)?.name || sub.planId || '—' },
                      { label:'Status',      value: sub.status,                      color: ss.color },
                      { label:'Billing',     value: sub.billingCycle || '—',         mono:true  },
                      { label:'Started',     value: fmtDate(sub.startDate)                       },
                      { label:'Expires',     value: fmtDate(sub.endDate)                         },
                      { label:'Days Left',   value: days !== null ? (days >= 0 ? `${days} days` : 'Expired') : '—', color: days !== null ? (days > 7 ? '#34d399' : days > 0 ? '#facc15' : '#f87171') : '#5a5a7a' },
                      { label:'Assigned By', value: sub.assignedBy || 'User',        mono:true  },
                      { label:'Payment Ref', value: sub.paymentRef || '—',           mono:true  },
                      { label:'Notes',       value: sub.notes || '—',   span:true              },
                    ].map(item => (
                      <div key={item.label} style={{ background:'var(--bg-surface2)', borderRadius:10, padding:'12px 14px', gridColumn: item.span ? '1 / -1' : undefined }}>
                        <p style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>{item.label}</p>
                        <p style={{ fontSize:'1rem', fontWeight:600, color: item.color||(item.mono?'var(--text-muted)':'var(--text-primary)'), fontFamily:item.mono?'monospace':'inherit', overflow:'hidden', textOverflow:'ellipsis', whiteSpace: item.span ? 'normal' : 'nowrap', lineHeight:1.3, wordBreak:'break-all' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', textAlign:'center', padding:'12px 0' }}>No subscription assigned yet</p>}
              </div>

              <div style={{ background:'var(--bg-surface2)', border:'1px solid var(--border)', borderRadius:14, padding:16 }}>
                <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>Assign / Override Plan</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8, marginBottom:14 }}>
                  {plans.filter(p => p.isActive !== false).map(p => (
                    <button key={p.planId} onClick={() => setSubForm(f => ({...f, planId:p.planId}))}
                      style={{ padding:'10px 12px', borderRadius:10, border:`2px solid ${subForm.planId===p.planId ? 'var(--accent)' : 'var(--border)'}`, background: subForm.planId===p.planId ? 'var(--accent-muted)' : 'var(--bg-surface2)', cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                      {p.icon && <span style={{ fontSize:'1.125rem', display:'block', marginBottom:4 }}>{p.icon}</span>}
                      <p style={{ fontSize:'0.9rem', fontWeight:700, color: subForm.planId===p.planId ? 'var(--accent)' : 'var(--text-primary)' }}>{p.name}</p>
                      <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:2 }}>{p.priceMonthly > 0 ? `₹${p.priceMonthly}/mo` : 'Free'}</p>
                    </button>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                  <div>
                    <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:7 }}>Duration</label>
                    <div style={{ display:'flex', gap:6 }}>
                      {[7,30,90,365].map(d => (
                        <button key={d} onClick={() => setSubForm(f=>({...f,durationDays:d}))}
                          style={{ flex:1, padding:'7px 4px', borderRadius:8, border:`1px solid ${subForm.durationDays===d ? 'var(--accent)' : 'var(--border)'}`, background: subForm.durationDays===d ? 'var(--accent-muted)' : 'var(--bg-surface2)', color: subForm.durationDays===d ? 'var(--accent)' : 'var(--text-muted)', fontSize:'0.875rem', fontWeight:600, cursor:'pointer' }}>
                          {d===365 ? '1yr' : `${d}d`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input label="Notes" value={subForm.notes} onChange={e => setSubForm(f=>({...f,notes:e.target.value}))} placeholder="Promo, admin assigned…"/>
                </div>
                <Button onClick={assignSub} loading={busy} style={{ width:'100%' }}>
                  <CreditCard size={15}/> Assign {subForm.planId ? (plans.find(p=>p.planId===subForm.planId)?.name||'Plan') : 'Plan'} · {subForm.durationDays} days
                </Button>
              </div>

              {/* Payment History */}
              <div style={{ background:'var(--bg-surface2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'11px 16px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Payment History</span>
                  <span style={{ marginLeft:'auto', fontSize:'0.8125rem', color:'var(--text-muted)' }}>{subHistory.length} records</span>
                </div>
                {subHistory.length === 0
                  ? <p style={{ padding:'16px', textAlign:'center', fontSize:'0.875rem', color:'var(--text-dim)' }}>No payment records</p>
                  : <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom:'1px solid var(--border-soft)' }}>
                            {['Plan','Status','Period','Amount','Payment Ref','Notes'].map(h=>(
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {subHistory.map((s,i)=>{
                            const sc = {active:'#34d399',trial:'#facc15',expired:'#f87171',cancelled:'#94a3b8'}[s.status]||'#94a3b8'
                            return (
                              <tr key={s.subscriptionId||i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                                <td style={{ padding:'9px 12px' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <span style={{ fontSize:'0.95rem' }}>{s.planIcon}</span>
                                    <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)' }}>{s.planName}</span>
                                  </div>
                                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'monospace', textTransform:'capitalize', marginTop:2 }}>{s.billingCycle}</p>
                                </td>
                                <td style={{ padding:'9px 12px' }}>
                                  <span style={{ padding:'2px 8px', borderRadius:99, fontSize:'0.78rem', fontWeight:600, color:sc, background:`${sc}18` }}>{s.status}</span>
                                </td>
                                <td style={{ padding:'9px 12px', fontSize:'0.8rem', color:'var(--text-muted)', fontFamily:'monospace', whiteSpace:'nowrap' }}>
                                  {s.startDate?.slice(0,10)} → {s.endDate?.slice(0,10)}
                                </td>
                                <td style={{ padding:'9px 12px', fontWeight:700, fontFamily:'monospace', color:'#34d399' }}>
                                  {s.paidAmount > 0 ? `₹${Number(s.paidAmount).toLocaleString('en-IN')}` : <span style={{ color:'var(--text-muted)' }}>Free</span>}
                                </td>
                                <td style={{ padding:'9px 12px', maxWidth:140 }}>
                                  <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }} title={s.paymentRef}>{s.paymentRef||'—'}</span>
                                </td>
                                <td style={{ padding:'9px 12px', fontSize:'0.8rem', color:'var(--text-muted)', maxWidth:120 }}>
                                  {s.notes||'—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>}
              </div>
            </div>
          )}

          {tab === 'sessions' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <span style={{ fontSize:'0.9rem', color:'var(--text-muted)' }}>{detail?.sessions?.length||0} active sessions</span>
                <ActionBtn label="Clear All Sessions" icon={Trash2} danger
                  onClick={async () => { try { await api.delete(`/admin/users/${user.userId}/sessions`); toast('Sessions cleared','success'); const r = await api.get(`/admin/users/${user.userId}`); setDetail(r.data) } catch(e){toast(e.message,'error')} }}/>
              </div>
              {!(detail?.sessions?.length) ? (
                <p style={{ textAlign:'center', color:'var(--text-dim)', fontSize:'0.9rem', padding:'2rem' }}>No active sessions</p>
              ) : detail.sessions.map((s,i) => (
                <div key={i} style={{ background:'var(--bg-surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontSize:'0.9375rem', color:'var(--text-primary)', fontFamily:'monospace' }}>{s.deviceId||s.agent||`Session ${i+1}`}</p>
                    <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', marginTop:3 }}>Created: {fmtDate(s.createdAt)}</p>
                  </div>
                  <span style={{ fontSize:'0.8125rem', color:'#34d399', background:'rgba(52,211,153,.1)', padding:'3px 10px', borderRadius:99, fontWeight:600 }}>Active</span>
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
    </Modal>
  )
}

function UserRow({ u, plans, onRefresh, onDelete, index }) {
  const [open, setOpen] = useState(false)
  const sub  = u.subscription
  const days = daysLeft(sub?.endDate)
  const ra   = ROLE_ACCENT[u.role] || '#58a6ff'
  return (
    <>
      <motion.tr initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.03 }}
        className="tbl-row cursor-pointer" onClick={() => setOpen(true)}>
        <td className="tbl-cell">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:`${ra}15`, border:`1.5px solid ${ra}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9375rem', fontWeight:700, color:ra, flexShrink:0, overflow:'hidden' }}>
              {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : (u.name||'?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.name}</p>
              <p style={{ fontSize:'0.8125rem', color:'var(--text-dim)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email||u.mobile||u.userId}</p>
            </div>
          </div>
        </td>
        <td className="tbl-cell">
          <span style={{ fontSize:'0.875rem', padding:'3px 10px', borderRadius:99, background:`${ra}15`, color:ra, border:`1px solid ${ra}30`, fontWeight:600, textTransform:'capitalize' }}>{u.role}</span>
          {!u.isActive && <span style={{ display:'block', fontSize:'0.78rem', color:'#f87171', marginTop:4 }}>Locked</span>}
        </td>
        <td className="tbl-cell"><SubPill sub={sub} plans={plans}/></td>
        <td className="tbl-cell">
          {sub ? <div>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>{fmtDate(sub.startDate)}</p>
            <p style={{ fontSize:'0.8125rem', color: days!==null&&days<=7 ? '#d97706':'var(--text-dim)' }}>→ {fmtDate(sub.endDate)}</p>
          </div> : <span style={{ color:'var(--text-dim)' }}>—</span>}
        </td>
        <td className="tbl-cell">
          {days !== null ? (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99,
              background: days>7?'rgba(52,211,153,.08)':days>0?'rgba(250,204,21,.08)':'rgba(248,113,113,.08)',
              border:`1px solid ${days>7?'rgba(52,211,153,.2)':days>0?'rgba(250,204,21,.2)':'rgba(248,113,113,.2)'}` }}>
              <Clock size={11} style={{ color:days>7?'#34d399':days>0?'#facc15':'#f87171' }}/>
              <span style={{ fontSize:'0.875rem', fontWeight:700, color:days>7?'#34d399':days>0?'#facc15':'#f87171', fontFamily:'monospace' }}>{days>0?`${days}d`:'Expired'}</span>
            </span>
          ) : <span style={{ color:'var(--text-dim)' }}>—</span>}
        </td>
        <td className="tbl-cell"><span style={{ fontSize:'0.875rem', color:u.orgCount>0?'var(--text-secondary)':'var(--text-dim)', fontFamily:'monospace' }}>{u.orgCount||0} orgs</span></td>
        <td className="tbl-cell"><span style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>{fmtAgo(u.createdAt)}</span></td>
        <td className="tbl-cell" onClick={e=>e.stopPropagation()}>
          <div style={{ display:'flex', gap:4 }}>
            <ActionBtn label="View" icon={User} onClick={() => setOpen(true)} size="sm"/>
            <ActionBtn label="Delete" icon={Trash2} danger onClick={() => onDelete(u)} size="sm"/>
          </div>
        </td>
      </motion.tr>
      <UserDetailModal open={open} onClose={() => setOpen(false)} user={u} plans={plans} onRefresh={onRefresh}/>
    </>
  )
}

export default function AdminUsers() {
  const { ready } = useAuth()
  const { toast } = useToast()
  const [users,  setUsers] = useState([])
  const [total,  setTotal] = useState(0)
  const [page,   setPage]  = useState(1)
  const [q,      setQ]     = useState('')
  const [roleF,  setRoleF] = useState('')
  const [subF,   setSubF]  = useState('')
  const [load,   setLoad]  = useState(true)
  const [plans,  setPlans] = useState([])
  const [del,    setDel]   = useState(null)
  const [busy,   setBusy]  = useState(false)

  const active   = users.filter(u=>u.isActive).length
  const locked   = users.filter(u=>!u.isActive).length
  const subCount = users.filter(u=>u.subscription?.status==='active').length
  const trial    = users.filter(u=>u.subscription?.status==='trial').length
  const expired  = users.filter(u=>u.subscription?.status==='expired').length
  const noSub    = users.filter(u=>!u.subscription).length
  const expiring = users.filter(u=>{ const d=daysLeft(u.subscription?.endDate); return d!==null&&d>=0&&d<=7 }).length

  async function doLoad() {
    setLoad(true)
    try {
      const params = new URLSearchParams({ page, limit:50 })
      if (q)     params.set('q',    q)
      if (roleF) params.set('role', roleF)
      const [ur,pr] = await Promise.all([api.get(`/admin/users?${params}`), api.get('/admin/plans')])
      let data = ur.data||[]
      if (subF==='active')   data = data.filter(u=>u.subscription?.status==='active')
      if (subF==='trial')    data = data.filter(u=>u.subscription?.status==='trial')
      if (subF==='expired')  data = data.filter(u=>u.subscription?.status==='expired')
      if (subF==='none')     data = data.filter(u=>!u.subscription)
      if (subF==='expiring') data = data.filter(u=>{ const d=daysLeft(u.subscription?.endDate); return d!==null&&d>=0&&d<=7 })
      setUsers(data); setTotal(ur.total||0); setPlans(pr.data||[])
    } catch(e) { toast(e.message,'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready) doLoad() }, [ready, page, q, roleF, subF])

  const pages = Math.ceil(total/50)

  return (
    <AdminPage>
      <PageHeader title="Users" icon={Users} iconColor="#58a6ff" subtitle={`${total} total · ${active} active · ${locked} locked`}>
        <Button variant="secondary" onClick={doLoad}><RefreshCw size={14}/></Button>
      </PageHeader>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
        {[
          { label:'Active Subs',  value:subCount,  accent:'#34d399', filter:'active',   icon:CheckCircle2  },
          { label:'Trial',        value:trial,     accent:'#facc15', filter:'trial',    icon:Clock         },
          { label:'Expired',      value:expired,   accent:'#f87171', filter:'expired',  icon:XCircle       },
          { label:'No Plan',      value:noSub,     accent:'#5a5a7a', filter:'none',     icon:Ban           },
          { label:'Expiring ≤7d', value:expiring,  accent:'#fb923c', filter:'expiring', icon:AlertTriangle },
          { label:'All Users',    value:total,     accent:'#58a6ff', filter:'',         icon:Users         },
        ].map((s,i) => (
          <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} index={i}
            icon={s.icon} active={subF===s.filter} onClick={() => setSubF(subF===s.filter?'':s.filter)}/>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <SearchBox value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Search name, email, mobile, ID…"/>
        <select value={roleF} onChange={e=>setRoleF(e.target.value)} className="field-input" style={{ width:'auto' }}>
          <option value="">All Roles</option>
          <option value="user">User</option><option value="support">Support</option><option value="admin">Admin</option>
        </select>
        {(q||roleF||subF) && <ActionBtn label="Clear" icon={Trash2} danger onClick={() => {setQ('');setRoleF('');setSubF('')}}/>}
      </div>

      {/* Table */}
      <SectionCard title={`${users.length} users`} icon={Users} noPadding>
        <table style={{ width:'100%' }}>
          <thead><tr style={{ borderBottom:'1px solid var(--border-soft)' }}>
            {['User','Role','Subscription','Period','Days Left','Orgs','Joined',''].map(h => <th key={h} className="tbl-head">{h}</th>)}
          </tr></thead>
          <tbody>
            {load ? Array.from({length:6}).map((_,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                {Array.from({length:8}).map((_,j) => <td key={j} className="tbl-cell"><div className="h-5 shimmer rounded w-20"/></td>)}
              </tr>
            )) : users.map((u,i) => <UserRow key={u.userId} u={u} plans={plans} onRefresh={doLoad} onDelete={setDel} index={i}/>)}
          </tbody>
        </table>
        {!load && users.length===0 && <p style={{ textAlign:'center', padding:'3rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No users found</p>}
      </SectionCard>

      {pages>1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:10 }}>
          <Button variant="secondary" size="sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Prev</Button>
          <span style={{ fontSize:'0.9rem', color:'var(--text-muted)', alignSelf:'center', fontFamily:'monospace' }}>Page {page} / {pages}</span>
          <Button variant="secondary" size="sm" onClick={()=>setPage(p=>p+1)} disabled={page>=pages}>Next →</Button>
        </div>
      )}

      <ConfirmModal open={!!del} onClose={()=>setDel(null)} danger title="Delete User"
        message={`Delete "${del?.name}"? Cannot be undone.`} loading={busy}
        onConfirm={async () => { setBusy(true); try { await api.delete(`/admin/users/${del.userId}`); toast('Deleted','success'); setDel(null); doLoad() } catch(e){toast(e.message,'error')} finally{setBusy(false)} }}/>
    </AdminPage>
  )
}
