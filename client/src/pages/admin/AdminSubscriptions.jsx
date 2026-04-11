import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  Trash2, Edit3, Receipt, Ban, RotateCcw, CalendarPlus, ChevronDown,
  ChevronUp, Zap, Bell, Activity, Filter
} from 'lucide-react'
import { Button }       from '../../components/ui/Button'
import { Input }        from '../../components/ui/Input'
import { Modal }        from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { AdminPage, PageHeader, StatCard, SectionCard, SearchBox } from '../../components/admin/AdminUI'
import { ActionBtn }    from '../../components/ui/ActionBtn'
import Pagination       from '../../components/ui/Pagination'
import { useAuth }      from '../../store/auth'
import { useToast }     from '../../components/ui/Toast'
import api              from '../../lib/api'

function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—' }
function fmtDT(d)    { return d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—' }
function fmtINR(n)   { return n > 0 ? `₹${Number(n).toLocaleString('en-IN')}` : '—' }
function daysLeft(d) { return d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null }

const GW_META = {
  razorpay: { label:'Razorpay',  color:'#2d82f5', icon:'💳' },
  phonepe:  { label:'PhonePe',   color:'#5f259f', icon:'📱' },
  paytm:    { label:'Paytm',     color:'#00b9f1', icon:'💰' },
  ccavenue: { label:'CCAvenue',  color:'#e8703a', icon:'🏦' },
  manual:   { label:'Manual',    color:'#94a3b8', icon:'✍️' },
  payment_gateway: { label:'Gateway', color:'#58a6ff', icon:'⚡' },
}
const STATUS_META = {
  active:    { color:'#34d399', bg:'rgba(52,211,153,.1)',   label:'Active',    icon:'✓' },
  trial:     { color:'#facc15', bg:'rgba(250,204,21,.1)',   label:'Trial',     icon:'⚡' },
  expired:   { color:'#f87171', bg:'rgba(248,113,113,.1)',  label:'Expired',   icon:'✗' },
  cancelled: { color:'#f87171', bg:'rgba(248,113,113,.07)', label:'Cancelled', icon:'✗' },
  suspended: { color:'#fb923c', bg:'rgba(251,146,60,.1)',   label:'Suspended', icon:'⏸' },
}
const EVENT_TYPES = {
  payment_received:       { label:'Payment Received',     color:'#34d399', icon:'💳' },
  subscription_cancelled: { label:'Subscription Cancelled',color:'#f87171', icon:'✗'  },
  subscription_refunded:  { label:'Refund Processed',     color:'#fb923c', icon:'↩'  },
  subscription_extended:  { label:'Subscription Extended', color:'#58a6ff', icon:'📅' },
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.expired
  return (
    <span style={{ padding:'3px 10px', borderRadius:99, fontSize:'0.8125rem', fontWeight:600, color:m.color, background:m.bg, whiteSpace:'nowrap' }}>
      {m.icon} {m.label}
    </span>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditSubModal({ open, sub, plans, onClose, onSaved }) {
  const { toast } = useToast()
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (sub) setForm({
      status:        sub.status,
      endDate:       sub.endDate?.slice(0,10) || '',
      notes:         sub.notes        || '',
      planId:        sub.planId,
      billingCycle:  sub.billingCycle  || 'monthly',
      paidAmount:    sub.paidAmount    || 0,
      gateway:       sub.gateway       || '',
      transactionId: sub.transactionId || '',
      paymentRef:    sub.paymentRef    || '',
    })
  }, [sub])

  const F = (label, key, type='text', ph='') => (
    <div>
      <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>{label}</label>
      <input type={type} value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:type==='number'?+e.target.value:e.target.value}))}
        placeholder={ph} className="field-input" style={{ width:'100%' }}/>
    </div>
  )

  async function save() {
    setBusy(true)
    try { await api.patch(`/admin/subscriptions/${sub.subscriptionId}`, form); toast('Updated','success'); onSaved() }
    catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Subscription" size="md">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Plan</label>
            <select value={form.planId||''} onChange={e=>setForm(f=>({...f,planId:e.target.value}))} className="field-input" style={{width:'100%'}}>
              {plans.map(p=><option key={p.planId} value={p.planId}>{p.icon||''} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Status</label>
            <select value={form.status||''} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="field-input" style={{width:'100%'}}>
              {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {F('Expiry Date','endDate','date')}
          {F('Paid Amount (₹)','paidAmount','number','0')}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Gateway</label>
            <select value={form.gateway||''} onChange={e=>setForm(f=>({...f,gateway:e.target.value}))} className="field-input" style={{width:'100%'}}>
              <option value="">— None —</option>
              {Object.entries(GW_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          {F('Transaction ID','transactionId','text','Gateway txn ID')}
        </div>
        {F('Payment Reference','paymentRef','text','Internal ref')}
        {F('Admin Notes','notes','text','Note…')}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Refund Modal ──────────────────────────────────────────────────────────────
function RefundModal({ open, sub, onClose, onDone }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ refundAmount:'', refundNotes:'' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (sub) setForm({ refundAmount:sub.paidAmount||'', refundNotes:'' }) }, [sub])

  const gw    = sub ? (GW_META[sub.gateway] || null) : null
  const noGw  = !sub?.gateway || sub?.gateway === 'manual'

  async function submit() {
    if (!form.refundAmount) return toast('Enter refund amount','error')
    setBusy(true)
    try {
      const r = await api.post(`/admin/subscriptions/${sub.subscriptionId}/refund`, form)
      const status = r.refund?.status
      toast(status === 'processed'
        ? `₹${form.refundAmount} refunded via ${gw?.label||sub.gateway} ✓`
        : `Refund submitted to ${gw?.label||sub.gateway} — processing…`, 'success')
      onDone()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Process Refund via Gateway" size="sm">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {noGw ? (
          <div style={{ padding:'14px 16px', borderRadius:12, background:'rgba(248,113,113,.06)', border:'1px solid rgba(248,113,113,.2)' }}>
            <p style={{ fontSize:'0.875rem', color:'#f87171', lineHeight:1.5, fontWeight:500 }}>
              ✗ No payment gateway on this subscription. The user paid manually or via an untracked method. Process the refund manually in your payment dashboard.
            </p>
          </div>
        ) : (
          <>
            <div style={{ padding:'12px 16px', borderRadius:12, background:`${gw?.color||'#58a6ff'}0f`, border:`1px solid ${gw?.color||'#58a6ff'}28`, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:'1.5rem' }}>{gw?.icon}</span>
              <div>
                <p style={{ fontSize:'0.9375rem', fontWeight:700, color:gw?.color, marginBottom:3 }}>{gw?.label} — Real Refund</p>
                <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', lineHeight:1.4 }}>
                  This calls the {gw?.label} refund API directly. Money goes back to the user's original payment method automatically.
                </p>
              </div>
            </div>
            <div style={{ padding:'10px 14px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)', fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace' }}>
              <span style={{ color:'var(--text-muted)' }}>Txn ID: </span>{sub?.transactionId || sub?.paymentRef || '—'}
            </div>
            <Input label={`Refund Amount (₹) — Paid: ₹${sub?.paidAmount||0}`} type="number"
              value={form.refundAmount} onChange={e=>setForm(f=>({...f,refundAmount:e.target.value}))}
              placeholder={`Max ₹${sub?.paidAmount||0}`}/>
            <Input label="Notes (optional)" value={form.refundNotes}
              onChange={e=>setForm(f=>({...f,refundNotes:e.target.value}))} placeholder="Reason for refund…"/>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} loading={busy} style={{ background:gw?.color||'#fb923c' }}>
                Refund via {gw?.label}
              </Button>
            </div>
          </>
        )}
        {noGw && <Button variant="secondary" onClick={onClose}>Close</Button>}
      </div>
    </Modal>
  )
}

// ── Extend Modal ──────────────────────────────────────────────────────────────
function ExtendModal({ open, sub, onClose, onDone }) {
  const { toast } = useToast()
  const [days, setDays]     = useState('30')
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)

  const newExpiry = sub ? new Date(Math.max(Date.now(), new Date(sub.endDate||Date.now()).getTime()) + (+days||0)*86400000) : null

  async function submit() {
    if (!days || +days <= 0) return toast('Enter days','error')
    setBusy(true)
    try {
      await api.post(`/admin/subscriptions/${sub.subscriptionId}/extend`, { days:+days, reason })
      toast(`Extended by ${days} days & user notified`,'success'); onDone()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Extend Subscription" size="sm">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <Input label="Extend by (days)" type="number" value={days} onChange={e=>setDays(e.target.value)} placeholder="30"/>
        {newExpiry && (
          <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(88,166,255,.06)', border:'1px solid rgba(88,166,255,.18)' }}>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>New expiry: <span style={{ color:'#58a6ff', fontFamily:'monospace', fontWeight:700 }}>{fmtDate(newExpiry)}</span></p>
          </div>
        )}
        <Input label="Reason (optional)" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Goodwill, promo, support credit…"/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Extend & Notify User</Button>
        </div>
      </div>
    </Modal>
  )
}


// ── Cancel Modal ──────────────────────────────────────────────────────────────
function CancelModal({ open, sub, onClose, onDone }) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.post(`/admin/subscriptions/${sub.subscriptionId}/cancel`, { reason: reason.trim() })
      toast('Cancelled & user notified', 'success'); onDone()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cancel Subscription" size="sm">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(248,113,113,.06)', border:'1px solid rgba(248,113,113,.2)' }}>
          <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)' }}>
            This will cancel <span style={{ color:'#f87171', fontWeight:700 }}>{sub?.planName || sub?.planId}</span> for <span style={{ fontWeight:700, color:'var(--text-primary)' }}>{sub?.userName || sub?.userId}</span> and notify them by email.
          </p>
        </div>
        <Input label="Reason (optional)" value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Non-payment, user request, fraud…"/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep Active</Button>
          <Button variant="danger" onClick={submit} loading={busy}>Confirm Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Subscription Row ──────────────────────────────────────────────────────────
function SubRow({ s, planMap, userMap, onEdit, onCancel, onRefund, onExtend, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const plan = planMap[s.planId] || {}
  const user = userMap[s.userId] || {}
  const d    = daysLeft(s.endDate)
  const gw   = GW_META[s.gateway] || null
  const sm   = STATUS_META[s.status] || STATUS_META.expired

  return (
    <>
      <motion.tr initial={{opacity:0}} animate={{opacity:1}}
        style={{ borderBottom: expanded ? 'none' : '1px solid rgba(255,255,255,.04)', cursor:'pointer', transition:'background .15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.02)'}
        onMouseLeave={e=>e.currentTarget.style.background=''}
        onClick={()=>setExpanded(x=>!x)}>

        {/* User */}
        <td style={{ padding:'11px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(88,166,255,.1)', border:'1px solid rgba(88,166,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.875rem', fontWeight:700, color:'#58a6ff', flexShrink:0 }}>
              {(user.name||s.userId||'?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{user.name||'Unknown'}</p>
              <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'monospace', marginTop:1 }}>{user.email||s.userId?.slice(-10)}</p>
            </div>
          </div>
        </td>

        {/* Plan */}
        <td style={{ padding:'11px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:'1rem', flexShrink:0 }}>{plan.icon||'📦'}</span>
            <div>
              <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-primary)' }}>{s.planName||s.planId}</p>
              <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{s.billingCycle}</p>
            </div>
          </div>
        </td>

        {/* Status */}
        <td style={{ padding:'11px 14px' }}><StatusPill status={s.status}/></td>

        {/* Period */}
        <td style={{ padding:'11px 14px' }}>
          <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace', whiteSpace:'nowrap' }}>{fmtDate(s.startDate)}</p>
          <p style={{ fontSize:'0.8125rem', color: d!==null&&d<=0?'#f87171':d!==null&&d<=7?'#facc15':'#9090b8', fontFamily:'monospace', marginTop:2, whiteSpace:'nowrap' }}>→ {fmtDate(s.endDate)}</p>
        </td>

        {/* Days left */}
        <td style={{ padding:'11px 14px' }}>
          <span style={{ fontSize:'0.875rem', fontWeight:700, fontFamily:'monospace', color:d===null?'#5a5a7a':d>7?'#34d399':d>0?'#facc15':'#f87171' }}>
            {d===null?'—':d>0?`${d}d`:'Expired'}
          </span>
        </td>

        {/* Amount */}
        <td style={{ padding:'11px 14px' }}>
          <p style={{ fontSize:'0.9rem', fontWeight:700, color:'#34d399', fontFamily:'monospace' }}>
            {s.paidAmount > 0 ? `₹${Number(s.paidAmount).toLocaleString('en-IN')}` : <span style={{color:'var(--text-muted)'}}>Free</span>}
          </p>
          {s.refundedAt && (
            <p style={{ fontSize:'0.72rem', color:'#fb923c', marginTop:2 }}>↩ ₹{s.refundAmount} refunded</p>
          )}
        </td>

        {/* Payment details */}
        <td style={{ padding:'11px 14px' }}>
          {gw ? (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:'0.95rem' }}>{gw.icon}</span>
              <div>
                <p style={{ fontSize:'0.8125rem', fontWeight:600, color:gw.color }}>{gw.label}</p>
                {s.transactionId && (
                  <p style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }} title={s.transactionId}>
                    {s.transactionId.slice(0,18)}{s.transactionId.length>18?'…':''}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <span style={{ fontSize:'0.8125rem', color:'var(--text-dim)' }}>—</span>
          )}
        </td>

        {/* Actions */}
        <td style={{ padding:'11px 14px' }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            <ActionBtn label="Edit"   icon={Edit3}        onClick={()=>onEdit(s)}    size="sm" hoverColor="#facc15"/>
            <ActionBtn label="Extend" icon={CalendarPlus} onClick={()=>onExtend(s)}  size="sm" hoverColor="#58a6ff"/>
            {s.paidAmount > 0 && !s.refundedAt && (
              <ActionBtn label="Refund" icon={RotateCcw} onClick={()=>onRefund(s)} size="sm" hoverColor="#fb923c"/>
            )}
            {s.status !== 'cancelled' && (
              <ActionBtn label="Cancel" icon={Ban} onClick={()=>onCancel(s)} size="sm" danger/>
            )}
            <ActionBtn label="Delete" icon={Trash2} onClick={()=>onDelete(s)} size="sm" danger/>
          </div>
        </td>

        {/* Expand toggle */}
        <td style={{ padding:'11px 10px', color:'var(--text-dim)' }} onClick={e=>{e.stopPropagation();setExpanded(x=>!x)}}>
          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </td>
      </motion.tr>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.tr key="exp" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <td colSpan={9} style={{ padding:'0 14px 14px', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
              <div style={{ background:'rgba(255,255,255,.02)', borderRadius:12, border:'1px solid var(--border-soft)', padding:14, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:10 }}>
                {[
                  { l:'User Name',       v: user.name||'—'                         },
                  { l:'Email',           v: user.email||'—',       mono:true        },
                  { l:'Mobile',          v: user.mobile||'—',      mono:true        },
                  { l:'Subscription ID', v: s.subscriptionId,      mono:true        },
                  { l:'Transaction ID',  v: s.transactionId||'—',  mono:true        },
                  { l:'Payment Ref',     v: s.paymentRef||'—',     mono:true        },
                  { l:'Gateway',         v: gw?`${gw.icon} ${gw.label}`:'Manual',  color: gw?.color },
                  { l:'Assigned By',     v: s.assignedBy||s.createdBy||'—'          },
                  { l:'Created',         v: fmtDT(s.createdAt)                      },
                  { l:'Last Updated',    v: fmtDT(s.updatedAt)                      },
                  ...(s.cancelledAt ? [{ l:'Cancelled At', v:fmtDT(s.cancelledAt), color:'#f87171' }] : []),
                  ...(s.refundedAt  ? [{ l:'Refunded At',  v:fmtDT(s.refundedAt),  color:'#fb923c' }] : []),
                  ...(s.refundRef   ? [{ l:'Refund Ref',   v:s.refundRef,           mono:true       }] : []),
                  ...(s.refundNotes ? [{ l:'Refund Notes', v:s.refundNotes                           }] : []),
                  ...(s.notes       ? [{ l:'Notes',        v:s.notes, span:true                      }] : []),
                ].map((item,i)=>(
                  <div key={i} style={{ background:'var(--bg-input)', borderRadius:9, padding:'10px 12px', gridColumn:item.span?'1 / -1':undefined }}>
                    <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>{item.l}</p>
                    <p style={{ fontSize:'0.875rem', fontWeight:600, color:item.color||(item.mono?'#9090b8':'#d0d0e8'), fontFamily:item.mono?'monospace':'inherit', wordBreak:'break-all', lineHeight:1.4 }}>{item.v}</p>
                  </div>
                ))}
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSubscriptions() {
  const { ready }  = useAuth()
  const { toast }  = useToast()
  const [subs,    setSubs]   = useState([])
  const [plans,   setPlans]  = useState([])
  const [users,   setUsers]  = useState({})
  const [events,  setEvents] = useState([])
  const [total,   setTotal]  = useState(0)
  const [loading, setLoad]   = useState(true)
  const [q,       setQ]      = useState('')
  const [statusF, setStatusF]= useState('')
  const [gwF,     setGwF]    = useState('')
  const [page,    setPage]   = useState(1)
  const [limit,   setLimit]  = useState(5)
  const [showEvt, setShowEvt]= useState(false)
  const [editing, setEdit]   = useState(null)
  const [refunding,setRefund]= useState(null)
  const [extending,setExtend]= useState(null)
  const [cancelSub,setCancelSub]= useState(null)
  const [deleting, setDel]   = useState(null)
  const [actBusy,  setActBusy]=useState(false)
  const sseRef = useRef(null)
  const planMap = Object.fromEntries(plans.map(p=>[p.planId,p]))

  async function doLoad() {
    setLoad(true)
    try {
      const params = new URLSearchParams({ page, limit })
      if (statusF) params.set('status', statusF)
      if (q)       params.set('userId', q)
      const [sr, pr, er] = await Promise.all([
        api.get(`/admin/subscriptions?${params}`),
        api.get('/admin/plans'),
        api.get('/admin/subscriptions/events'),
      ])
      const subsData = sr.data || []
      setSubs(subsData); setTotal(sr.total||0); setPlans(pr.data||[]); setEvents(er.data||[])
      // Batch-fetch user info for this page
      const uids = [...new Set(subsData.map(s=>s.userId).filter(Boolean))]
      if (uids.length) {
        const ur = await api.get(`/admin/users?limit=100`).catch(()=>({data:[]}))
        const um = Object.fromEntries((ur.data||[]).map(u=>[u.userId,u]))
        setUsers(prev=>({...prev,...um}))
      }
    } catch(e) { toast(e.message,'error') }
    finally { setLoad(false) }
  }

  // SSE real-time events
  useEffect(() => {
    if (!ready) return
    doLoad()
    try {
      const es = new EventSource('/api/admin/subscriptions/events/stream')
      es.onmessage = ev => {
        try {
          const evt = JSON.parse(ev.data)
          setEvents(prev=>[evt,...prev].slice(0,50))
          const meta = EVENT_TYPES[evt.type]
          if (meta) toast(`${meta.icon} ${meta.label}`, 'success')
        } catch {}
      }
      sseRef.current = es
    } catch {}
    return () => { sseRef.current?.close() }
  }, [ready])

  useEffect(() => { if (ready) doLoad() }, [page, limit, statusF, gwF])

  const active   = subs.filter(s=>s.status==='active').length
  const trial    = subs.filter(s=>s.status==='trial').length
  const expired  = subs.filter(s=>['expired','cancelled'].includes(s.status)).length
  const expiring = subs.filter(s=>{ const d=daysLeft(s.endDate); return d!==null&&d>=0&&d<=7&&s.status==='active' }).length
  const revenue  = subs.filter(s=>['active','trial'].includes(s.status)).reduce((a,s)=>a+(s.paidAmount||0),0)
  const gwPaid   = subs.filter(s=>s.gateway&&s.gateway!=='manual').length
  const pages    = Math.ceil(total/limit)
  const newEvts  = events.filter(e=>e.type==='payment_received').length

  function doCancel(sub) { setCancelSub(sub) }

  async function doDelete(sub) {
    setActBusy(true)
    try { await api.delete(`/admin/subscriptions/${sub.subscriptionId}`); toast('Deleted','success'); setDel(null); doLoad() }
    catch(e) { toast(e.message,'error') }
    finally { setActBusy(false) }
  }

  return (
    <AdminPage>
      <PageHeader title="Subscriptions" icon={Receipt} iconColor="#c084fc"
        subtitle={`${total} records · ₹${revenue.toLocaleString('en-IN')} active revenue`}>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setShowEvt(x=>!x)} style={{
            position:'relative', width:36, height:36, borderRadius:9,
            background: showEvt?'rgba(52,211,153,.1)':'transparent',
            border:`1px solid ${showEvt?'rgba(52,211,153,.3)':'rgba(255,255,255,.1)'}`,
            color: showEvt?'#34d399':'#6060a0', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Bell size={14}/>
            {newEvts > 0 && (
              <span style={{ position:'absolute', top:-5, right:-5, width:16, height:16, borderRadius:'50%', background:'#34d399', color:'#07070e', fontSize:'0.6rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {Math.min(newEvts,9)}
              </span>
            )}
          </button>
          <Button variant="secondary" onClick={doLoad}><RefreshCw size={14}/></Button>
        </div>
      </PageHeader>

      {/* Real-time events panel */}
      <AnimatePresence>
        {showEvt && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{ background:'rgba(10,10,20,.98)', border:'1px solid rgba(255,255,255,.08)', borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,.5)' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', gap:10 }}>
              <Activity size={14} style={{color:'#34d399'}}/>
              <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-secondary)' }}>Live Payment Activity</span>
              <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', marginLeft:'auto', fontFamily:'monospace' }}>{events.length} events</span>
            </div>
            <div style={{ maxHeight:260, overflowY:'auto' }}>
              {events.length === 0
                ? <p style={{ padding:'24px', textAlign:'center', color:'var(--text-dim)', fontSize:'0.875rem' }}>No payment events yet — they appear here in real time</p>
                : events.map((e,i)=>{
                    const meta = EVENT_TYPES[e.type] || { label:e.type, color:'var(--text-muted)', icon:'•' }
                    return (
                      <div key={i} style={{ padding:'10px 18px', borderBottom:'1px solid rgba(255,255,255,.04)', display:'flex', gap:12, alignItems:'flex-start' }}>
                        <span style={{ fontSize:'1.1rem', flexShrink:0, marginTop:1 }}>{meta.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span style={{ fontSize:'0.875rem', fontWeight:600, color:meta.color }}>{meta.label}</span>
                            {e.gateway && <span style={{ fontSize:'0.78rem', padding:'1px 8px', borderRadius:99, background:GW_META[e.gateway]?.color+'18'||'rgba(255,255,255,.06)', color:GW_META[e.gateway]?.color||'#5a5a7a' }}>{GW_META[e.gateway]?.icon} {GW_META[e.gateway]?.label||e.gateway}</span>}
                          </div>
                          <div style={{ display:'flex', gap:12, marginTop:4, fontSize:'0.78rem', color:'var(--text-muted)', fontFamily:'monospace', flexWrap:'wrap' }}>
                            {e.userId    && <span>User: …{e.userId.slice(-8)}</span>}
                            {e.planId    && <span>Plan: {e.planId}</span>}
                            {e.amount>0  && <span style={{color:'#34d399'}}>₹{e.amount}</span>}
                            {e.transactionId && <span>Txn: {String(e.transactionId).slice(0,20)}</span>}
                            {e.days      && <span>+{e.days} days</span>}
                            <span style={{marginLeft:'auto'}}>{e.timestamp?new Date(e.timestamp).toLocaleTimeString('en-IN'):''}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <StatCard label="Active"        value={active}   icon={CheckCircle2}  accent="#34d399" index={0} active={statusF==='active'}   onClick={()=>setStatusF(s=>s==='active'?'':'active')}/>
        <StatCard label="Trial"         value={trial}    icon={Zap}           accent="#facc15" index={1} active={statusF==='trial'}    onClick={()=>setStatusF(s=>s==='trial'?'':'trial')}/>
        <StatCard label="Expired/Canc." value={expired}  icon={XCircle}       accent="#f87171" index={2} active={statusF==='expired'}  onClick={()=>setStatusF(s=>s==='expired'?'':'expired')}/>
        <StatCard label="Expiring ≤7d"  value={expiring} icon={AlertTriangle} accent="#fb923c" index={3}/>
        <StatCard label="Via Gateway"   value={gwPaid}   icon={CreditCard}    accent="#c084fc" index={4}/>
        <StatCard label="Active Revenue" value={`₹${revenue.toLocaleString('en-IN')}`} icon={Receipt} accent="#58a6ff" index={5}/>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <SearchBox value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Search by User ID…"/>
        <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1)}} className="field-input" style={{width:'auto'}}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={gwF} onChange={e=>{setGwF(e.target.value);setPage(1)}} className="field-input" style={{width:'auto'}}>
          <option value="">All Gateways</option>
          {Object.entries(GW_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        {(q||statusF||gwF) && <ActionBtn label="Clear" icon={Filter} onClick={()=>{setQ('');setStatusF('');setGwF('')}} danger/>}
      </div>

      {/* Table */}
      <SectionCard title={`${total} subscriptions`} icon={Receipt} noPadding>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:960 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['User','Plan','Status','Period','Days Left','Amount','Payment','Actions',''].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({length:6}).map((_,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                      {Array.from({length:9}).map((_,j)=><td key={j} style={{padding:'12px 14px'}}><div style={{height:14,borderRadius:6,background:'var(--bg-surface2)',width:80}}/></td>)}
                    </tr>
                  ))
                : subs.length === 0
                  ? <tr><td colSpan={9} style={{padding:'3rem',textAlign:'center',color:'var(--text-dim)',fontSize:'0.9rem'}}>No subscriptions found</td></tr>
                  : subs.map((s,i)=>(
                      <SubRow key={s.subscriptionId||i} s={s} planMap={planMap} userMap={users}
                        onEdit={setEdit} onCancel={doCancel} onRefund={setRefund}
                        onExtend={setExtend} onDelete={setDel}/>
                    ))
              }
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Pagination */}
      <Pagination page={page} pages={pages} onPage={setPage} total={total} limit={limit}
        onLimit={n => { setLimit(n); setPage(1) }}/>

      {/* Modals */}
      <EditSubModal open={!!editing}   sub={editing}   plans={plans} onClose={()=>setEdit(null)}   onSaved={()=>{setEdit(null);doLoad()}}/>
      <RefundModal  open={!!refunding} sub={refunding}               onClose={()=>setRefund(null)} onDone={()=>{setRefund(null);doLoad()}}/>
      <ExtendModal  open={!!extending} sub={extending}               onClose={()=>setExtend(null)} onDone={()=>{setExtend(null);doLoad()}}/>
      <CancelModal  open={!!cancelSub} sub={cancelSub}               onClose={()=>setCancelSub(null)} onDone={()=>{setCancelSub(null);doLoad()}}/>
      <ConfirmModal open={!!deleting}  onClose={()=>setDel(null)} danger loading={actBusy}
        title="Delete Subscription" message={`Permanently delete subscription for ${deleting?.userId}?`}
        onConfirm={()=>doDelete(deleting)}/>
    </AdminPage>
  )
}