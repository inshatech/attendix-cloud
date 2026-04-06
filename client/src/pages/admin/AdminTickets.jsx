import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ticket, Search, RefreshCw, MessageSquare, Clock,
  Send, AlertTriangle, CheckCircle2, User, Users,
  XCircle, Inbox, Zap, Filter, Plus, Lock,
  ChevronRight, Circle, ArrowUpRight
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Empty } from '../../components/ui/Empty'
import { useAuth } from '../../store/auth'
import { StatCard, SearchBox as UISearchBox } from '../../components/admin/AdminUI'
import { SearchBox } from '../../components/admin/AdminUI'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

const STATUS_META = {
  'open':        { color:'badge-blue',   label:'Open',        icon: Inbox,        bg:'rgba(88,166,255,.08)'  },
  'assigned':    { color:'badge-orange', label:'Assigned',    icon: User,         bg:'rgba(251,146,60,.08)'  },
  'in-progress': { color:'badge-accent', label:'In Progress', icon: Zap,          bg:'rgba(88,166,255,.08)'  },
  'waiting':     { color:'badge-yellow', label:'Waiting',     icon: Clock,        bg:'rgba(250,204,21,.08)'  },
  'resolved':    { color:'badge-green',  label:'Resolved',    icon: CheckCircle2, bg:'rgba(52,211,153,.08)'  },
  'closed':      { color:'badge-gray',   label:'Closed',      icon: XCircle,      bg:'rgba(148,163,184,.08)' },
}
const PRIORITY_STYLE = {
  'critical': { color:'#f87171', bg:'rgba(248,113,113,.12)', label:'Critical', dot:'#f87171' },
  'high':     { color:'#fb923c', bg:'rgba(251,146,60,.12)',  label:'High',     dot:'#fb923c' },
  'medium':   { color:'#facc15', bg:'rgba(250,204,21,.12)',  label:'Medium',   dot:'#facc15' },
  'low':      { color:'#94a3b8', bg:'rgba(148,163,184,.12)', label:'Low',      dot:'#94a3b8' },
}

// ── Ticket detail modal ───────────────────────────────────────────────────────
function TicketModal({ ticket, currentUser, onClose, onUpdated }) {
  const { toast } = useToast()
  const [replyBody,  setReply]    = useState('')
  const [isInternal, setInternal] = useState(false)
  const [status,     setStatus]   = useState(ticket?.status || 'open')
  const [busy, setBusy] = useState(false)
  const messagesEnd = useRef(null)

  useEffect(() => {
    if (ticket) { setStatus(ticket.status); setReply(''); setInternal(false) }
  }, [ticket?.ticketId])

  useEffect(() => {
    setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [ticket?.messages?.length])

  if (!ticket) return null

  const pr = PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.medium
  const sm = STATUS_META[ticket.status] || STATUS_META.open

  async function sendReply() {
    if (!replyBody.trim()) return
    setBusy(true)
    try {
      const r = await api.post(`/admin/tickets/${ticket.ticketId}/reply`, { body: replyBody, isInternal })
      toast(isInternal ? 'Internal note added' : 'Reply sent', 'success')
      setReply(''); onUpdated(r)
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function changeStatus(newStatus) {
    setStatus(newStatus)
    setBusy(true)
    try {
      const r = await api.patch(`/admin/tickets/${ticket.ticketId}`, {
        status: newStatus,
        assignedTo:   currentUser.userId,
        assignedName: currentUser.name,
      })
      toast('Status updated', 'success'); onUpdated(r)
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function assignToMe() {
    setBusy(true)
    try {
      const r = await api.patch(`/admin/tickets/${ticket.ticketId}`, {
        status: 'in-progress',
        assignedTo:   currentUser.userId,
        assignedName: currentUser.name,
      })
      toast('Assigned to you', 'success'); onUpdated(r)
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const isAssignedToMe = ticket.assignedTo === currentUser?.userId

  return (
    <Modal open onClose={onClose} title="" size="xl">
      <div style={{ display:'flex', flexDirection:'column', gap:0, minHeight:'65vh' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom:20, paddingBottom:18, borderBottom:'1px solid var(--border)' }}>
          {/* ID + badges row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.8125rem', fontFamily:'monospace', fontWeight:600, color:'#58a6ff', background:'rgba(88,166,255,.1)', padding:'3px 10px', borderRadius:99, border:'1px solid rgba(88,166,255,.2)' }}>
              {ticket.ticketId}
            </span>
            <span className={cn('badge', sm.color)} style={{ fontSize:'0.8125rem' }}>{sm.label}</span>
            <span style={{ fontSize:'0.8125rem', fontWeight:700, color: pr.color, background: pr.bg, padding:'3px 10px', borderRadius:99, border:`1px solid ${pr.dot}40` }}>{pr.label}</span>
            <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', textTransform:'capitalize', background:'var(--bg-input)', padding:'3px 10px', borderRadius:99 }}>{ticket.category}</span>
          </div>

          {/* Subject */}
          <h2 style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em', marginBottom:10, lineHeight:1.3 }}>
            {ticket.subject}
          </h2>

          {/* Meta row */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 20px', fontSize:'0.875rem', color:'var(--text-muted)', marginBottom:14 }}>
            <span>From <strong style={{ color:'var(--text-primary)', fontWeight:600 }}>{ticket.userName}</strong></span>
            {ticket.assignedName && <span>Assigned to <strong style={{ color:'#58a6ff', fontWeight:600 }}>{ticket.assignedName}</strong></span>}
            <span>Created {new Date(ticket.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
          </div>

          {/* Action controls */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Status:</span>
              <select value={status} onChange={e => changeStatus(e.target.value)} disabled={busy}
                style={{ background:'var(--bg-surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-secondary)', fontSize:'0.875rem', fontWeight:500, padding:'6px 12px', cursor:'pointer', outline:'none' }}>
                {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button onClick={assignToMe} disabled={busy || isAssignedToMe}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8, border:'1px solid', fontWeight:600, fontSize:'0.875rem', cursor: isAssignedToMe ? 'default' : 'pointer', transition:'all .15s',
                borderColor: isAssignedToMe ? 'rgba(52,211,153,.3)' : 'rgba(88,166,255,.3)',
                background: isAssignedToMe ? 'rgba(52,211,153,.1)' : 'rgba(88,166,255,.1)',
                color: isAssignedToMe ? '#34d399' : '#58a6ff',
                opacity: busy ? 0.5 : 1 }}>
              {isAssignedToMe ? '✓ Assigned to me' : 'Assign to me'}
            </button>
          </div>
        </div>

        {/* ── Messages ── */}
        <div style={{ flex:1, overflowY:'auto', maxHeight:'42vh', display:'flex', flexDirection:'column', gap:12, marginBottom:16, paddingRight:2 }}>
          {ticket.messages?.map((m, i) => {
            const isUser    = m.authorRole === 'user'
            const isIntNote = m.isInternal
            const initials  = (m.authorName||'?')[0].toUpperCase()
            return (
              <motion.div key={m.messageId||i} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                style={{ display:'flex', gap:10, alignItems:'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>

                {/* Avatar */}
                <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'0.875rem', fontWeight:700,
                  background: isUser ? 'rgba(255,255,255,.07)' : isIntNote ? 'rgba(168,85,247,.15)' : 'rgba(88,166,255,.15)',
                  color:       isUser ? '#9090b8'              : isIntNote ? '#c084fc'               : '#58a6ff' }}>
                  {initials}
                </div>

                {/* Bubble */}
                <div style={{ maxWidth:'75%' }}>
                  {/* Name row */}
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5,
                    flexDirection: isUser ? 'row-reverse' : 'row' }}>
                    <span style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)' }}>
                      {m.authorName}
                    </span>
                    {!isUser && !isIntNote && (
                      <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'2px 8px', borderRadius:99,
                        background:'rgba(34,197,94,.1)', color:'#16a34a', border:'1px solid rgba(34,197,94,.2)',
                        display:'flex', alignItems:'center', gap:3 }}>
                        <CheckCircle2 size={9}/> Staff
                      </span>
                    )}
                    {isIntNote && (
                      <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'2px 8px', borderRadius:99,
                        background:'rgba(168,85,247,.12)', color:'#c084fc', border:'1px solid rgba(168,85,247,.25)' }}>
                        🔒 Internal
                      </span>
                    )}
                    <span style={{ fontSize:'0.75rem', color:'var(--text-dim)', fontFamily:'monospace' }}>
                      {new Date(m.createdAt||Date.now()).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </div>
                  {/* Bubble body */}
                  <div style={{
                    padding:'11px 15px',
                    borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                    background:   isIntNote ? 'rgba(168,85,247,.08)' : isUser ? 'var(--bg-surface2)' : 'rgba(88,166,255,.06)',
                    border:`1px solid ${isIntNote ? 'rgba(168,85,247,.25)' : isUser ? 'var(--border)' : 'rgba(88,166,255,.15)'}`,
                  }}>
                    <p style={{ fontSize:'0.9375rem', color: isIntNote ? '#c084fc' : 'var(--text-secondary)',
                      whiteSpace:'pre-wrap', lineHeight:1.7, margin:0 }}>
                      {m.body}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
          <div ref={messagesEnd}/>
        </div>

        {/* ── Reply box ── */}
        {ticket.status !== 'closed' && (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
            {/* Internal note toggle */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <button onClick={() => setInternal(false)}
                style={{ padding:'5px 14px', borderRadius:8, fontSize:'0.875rem', fontWeight:600, cursor:'pointer', border:'1px solid', transition:'all .15s',
                  background: !isInternal ? '#58a6ff' : 'transparent',
                  borderColor: !isInternal ? '#58a6ff' : 'rgba(255,255,255,.1)',
                  color: !isInternal ? '#fff' : 'var(--text-muted)' }}>
                💬 Reply to User
              </button>
              <button onClick={() => setInternal(true)}
                style={{ padding:'5px 14px', borderRadius:8, fontSize:'0.875rem', fontWeight:600, cursor:'pointer', border:'1px solid', transition:'all .15s',
                  background: isInternal ? 'rgba(168,85,247,.15)' : 'transparent',
                  borderColor: isInternal ? 'rgba(168,85,247,.4)' : 'var(--border)',
                  color: isInternal ? '#c084fc' : '#6868a0' }}>
                🔒 Internal Note
              </button>
            </div>
            <textarea value={replyBody} onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') sendReply() }}
              rows={4}
              placeholder={isInternal ? 'Write an internal note (only staff can see this)…' : 'Write a reply to the user… (Ctrl+Enter to send)'}
              style={{
                width:'100%', background:'var(--bg-input)',
                border:`1px solid ${isInternal ? 'rgba(168,85,247,.3)' : 'var(--border)'}`,
                borderRadius:10, padding:'12px 14px', color:'var(--text-primary)', fontSize:'0.9375rem',
                resize:'vertical', fontFamily:'inherit', outline:'none', lineHeight:1.6,
                minHeight:100,
              }}
              onFocus={e => e.target.style.borderColor = isInternal ? 'rgba(168,85,247,.6)' : '#58a6ff'}
              onBlur={e => e.target.style.borderColor = isInternal ? 'rgba(168,85,247,.3)' : 'var(--border)'}/>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <button onClick={sendReply} disabled={busy || !replyBody.trim()}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'9px 20px', borderRadius:10, fontWeight:700, fontSize:'0.9375rem',
                  border:'none', cursor:'pointer', transition:'all .15s',
                  background: isInternal ? 'rgba(168,85,247,.2)' : '#58a6ff',
                  color: isInternal ? '#c084fc' : '#fff',
                  opacity: (!replyBody.trim() || busy) ? 0.4 : 1,
                  boxShadow: !isInternal && replyBody.trim() ? '0 0 16px rgba(88,166,255,.3)' : 'none',
                }}>
                <Send size={15}/> {isInternal ? 'Add Internal Note' : 'Send Reply'}
              </button>
            </div>
          </div>
        )}
        {ticket.status === 'closed' && (
          <div style={{ textAlign:'center', padding:'12px', fontSize:'0.875rem', color:'var(--text-dim)', background:'var(--bg-surface2)', borderRadius:10, border:'1px solid var(--border-soft)' }}>
            This ticket is closed. Change status to reopen.
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── New ticket modal (staff can raise on behalf of user) ──────────────────────
function NewTicketModal({ open, onClose, onCreated, isStaff }) {
  const { toast } = useToast()
  const BLANK = { subject:'', body:'', category:'general', priority:'medium', targetUserId:'', targetUserName:'' }
  const [form, setForm] = useState(BLANK)
  const [users, setUsers]   = useState([])
  const [busy,  setBusy]    = useState(false)

  useEffect(() => {
    if (open) {
      setForm(BLANK) // ← always reset on open
      if (isStaff) api.get('/admin/users?limit=100').then(r => setUsers(r.data||[])).catch(()=>{})
    }
  }, [open])

  const sf = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit() {
    if (!form.subject.trim()) return toast('Subject is required', 'error')
    if (!form.body.trim())    return toast('Description is required', 'error')
    if (isStaff && !form.targetUserId) return toast('Select a user to raise ticket for', 'error')
    setBusy(true)
    try {
      await api.post('/tickets', form)
      toast('Ticket created', 'success'); onCreated(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={isStaff ? 'Raise Ticket on Behalf of User' : 'New Support Ticket'} size="md">
      <div className="">
        {isStaff && (
          <div>
            <label className="field-label">User *</label>
            <select className="field-input" value={form.targetUserId} onChange={e => {
              const u = users.find(u => u.userId === e.target.value)
              setForm(f => ({ ...f, targetUserId: e.target.value, targetUserName: u?.name || '' }))
            }}>
              <option value="">— Select user —</option>
              {users.filter(u => u.role === 'user').map(u => (
                <option key={u.userId} value={u.userId}>{u.name} ({u.email || u.mobile || u.userId})</option>
              ))}
            </select>
          </div>
        )}
        <Input label="Subject *" value={form.subject} onChange={sf('subject')} placeholder="Briefly describe the issue"/>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Category</label>
            <select className="field-input" value={form.category} onChange={sf('category')}>
              {['general','billing','technical','device','bridge','attendance','feature','other'].map(c => (
                <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase()+c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Priority</label>
            <select className="field-input" value={form.priority} onChange={sf('priority')}>
              {Object.entries(PRIORITY_STYLE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Description *</label>
          <textarea value={form.body} onChange={sf('body')} rows={4}
            placeholder="Describe the issue in detail…"
            className="field-input w-full" style={{ resize:'none', fontFamily:'inherit' }}/>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy}><Send size={13}/> Create Ticket</Button>
      </div>
    </Modal>
  )
}

// ── Ticket card ───────────────────────────────────────────────────────────────
function TicketCard({ ticket, onClick }) {
  const pr = PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.medium
  const sm = STATUS_META[ticket.status] || STATUS_META.open
  const age = Math.floor((Date.now() - new Date(ticket.createdAt)) / 3600000)
  const ageStr = age < 1 ? 'just now' : age < 24 ? `${age}h ago` : `${Math.floor(age/24)}d ago`

  return (
    <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
      onClick={onClick}
      style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:'1rem 1.125rem', cursor:'pointer', transition:'all .15s', borderLeft:`3px solid ${pr.dot}` }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      {/* Row 1 */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:8 }}>
        <p style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>
          {ticket.subject}
        </p>
        <span className={cn('badge flex-shrink-0', sm.color)} style={{ fontSize:'0.8125rem' }}>{sm.label}</span>
      </div>
      {/* Row 2 */}
      <p style={{ fontSize:'0.8125rem', fontFamily:'monospace', color:'var(--text-muted)', marginBottom:10 }}>
        {ticket.ticketId} · {ticket.userName}
      </p>
      {/* Row 3 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:'0.8125rem', fontWeight:700, color:pr.color, background:pr.bg, padding:'3px 9px', borderRadius:99, border:`1px solid ${pr.dot}30` }}>
            {pr.label}
          </span>
          <span style={{ fontSize:'0.8125rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{ticket.category}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {ticket.messages?.length > 1 && (
            <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:'0.8125rem', color:'var(--text-muted)' }}>
              <MessageSquare size={12}/>{ticket.messages.length}
            </span>
          )}
          <span style={{ fontSize:'0.8125rem', fontFamily:'monospace', color: ticket.assignedName ? '#58a6ff' : '#f87171' }}>
            {ticket.assignedName ? `→ ${ticket.assignedName.split(' ')[0]}` : 'Unassigned'}
          </span>
          <span style={{ fontSize:'0.8125rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{ageStr}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminTickets() {
  const { user, ready } = useAuth()
  const { toast } = useToast()
  const isAdmin = user?.role === 'admin'

  const [tickets,     setTickets]  = useState([])
  const [stats,       setStats]    = useState(null)
  const [loading,     setLoad]     = useState(true)
  const [selected,    setSelected] = useState(null)
  const [newModal,    setNewModal] = useState(false)
  const [filterStatus,setFS]       = useState('')
  const [filterPri,   setFP]       = useState('')
  const [q,           setQ]        = useState('')

  async function load() {
    setLoad(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      const [tr, sr] = await Promise.allSettled([
        api.get(`/admin/tickets?${params}&limit=200`),
        api.get('/admin/tickets/stats'),
      ])
      if (tr.status === 'fulfilled') setTickets(tr.value.data || [])
      if (sr.status === 'fulfilled') setStats(sr.value.data)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready) load() }, [ready, filterStatus])

  async function openTicket(t) {
    try {
      const r = await api.get(`/admin/tickets/${t.ticketId}`)
      setSelected(r.data)
    } catch(e) { toast(e.message, 'error') }
  }

  function handleUpdate(updated) {
    if (updated?.data) {
      setSelected(updated.data)
      setTickets(ts => ts.map(t => t.ticketId === updated.data.ticketId ? updated.data : t))
    }
    load()
  }

  const filtered = tickets.filter(t => {
    if (filterPri && t.priority !== filterPri) return false
    if (q && !t.subject.toLowerCase().includes(q.toLowerCase()) && !t.userName.toLowerCase().includes(q.toLowerCase()) && !t.ticketId.includes(q.toUpperCase())) return false
    return true
  })

  // Group for kanban
  const groups = {
    open:        filtered.filter(t => t.status === 'open'),
    'in-progress': filtered.filter(t => ['in-progress','assigned'].includes(t.status)),
    waiting:     filtered.filter(t => t.status === 'waiting'),
    resolved:    filtered.filter(t => ['resolved','closed'].includes(t.status)),
  }

  const groupMeta = {
    open:         { label:'Open',        color:'#58a6ff', icon: Inbox       },
    'in-progress':{ label:'In Progress', color:'#fb923c', icon: Zap         },
    waiting:      { label:'Waiting',     color:'#facc15', icon: Clock       },
    resolved:     { label:'Resolved',    color:'#34d399', icon: CheckCircle2},
  }

  const useKanban = !filterStatus && !filterPri && !q

  return (
    <div style={{ padding:'clamp(1rem, 4vw, 2.5rem)', maxWidth:1300, margin:'0 auto', display:'flex', flexDirection:'column', gap:'clamp(1rem, 3vw, 2rem)' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.03em', display:'flex', alignItems:'center', gap:10 }}>
            <Ticket size={28} style={{ color:'#58a6ff' }}/> Support Tickets
          </h1>
          <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginTop:5 }}>
            {stats?.unassigned > 0 && <span style={{ color:'#f87171' }}>{stats.unassigned} unassigned · </span>}
            {tickets.length} total tickets
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={13}/></Button>
          <Button size="sm" onClick={() => setNewModal(true)}><Plus size={13}/> Raise Ticket</Button>
        </div>
      </div>

      {/* Stats row — same StatCard style as Users page */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
          {Object.entries(STATUS_META).map(([k, v], i) => {
            const row   = stats.byStatus?.find(s => s._id === k)
            const count = row?.count || 0
            const accent = k==='open'?'#58a6ff':k==='assigned'?'#fb923c':k==='in-progress'?'#c084fc':k==='waiting'?'#facc15':k==='resolved'?'#34d399':'#94a3b8'
            return (
              <StatCard
                key={k}
                label={v.label}
                value={count}
                icon={v.icon}
                accent={accent}
                index={i}
                active={filterStatus === k}
                onClick={() => setFS(filterStatus === k ? '' : k)}
              />
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        <SearchBox value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets, users, IDs…"/>
        <select value={filterPri} onChange={e => setFP(e.target.value)} className="field-input" style={{ width:'auto' }}>
          <option value="">All Priorities</option>
          {Object.entries(PRIORITY_STYLE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(filterStatus || filterPri || q) && (
          <button onClick={() => { setFS(''); setFP(''); setQ('') }}
            style={{ padding:'0.5rem 0.875rem', borderRadius:8, background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.2)', fontSize:'0.875rem', cursor:'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Kanban or list */}
      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:'1rem' }}>
          {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height:200, borderRadius:10 }}/>)}
        </div>
      ) : useKanban ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:'1rem', alignItems:'start' }}>
          {Object.entries(groups).map(([key, items]) => {
            const gm = groupMeta[key]
            return (
              <div key={key} style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', boxShadow:'var(--shadow-card)' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, background:'var(--bg-surface2)' }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:`${gm.color}18`, border:`1px solid ${gm.color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <gm.icon size={14} style={{ color:gm.color }}/>
                  </div>
                  <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)', flex:1 }}>{gm.label}</span>
                  <span style={{ fontSize:'0.875rem', fontWeight:700, fontFamily:'monospace', background:'var(--bg-surface2)', color:items.length > 0 ? gm.color : 'var(--text-dim)', padding:'3px 10px', borderRadius:99 }}>{items.length}</span>
                </div>
                <div style={{ padding:'10px', display:'flex', flexDirection:'column', gap:8, minHeight:80 }}>
                  {items.length === 0
                    ? <p style={{ fontSize:'0.9rem', color:'var(--text-dim)', textAlign:'center', padding:'1.25rem 0' }}>No tickets</p>
                    : items.map(t => <TicketCard key={t.ticketId} ticket={t} onClick={() => openTicket(t)}/>)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {filtered.length === 0
            ? <div className="card"><Empty icon={Ticket} title="No tickets found" description="Try adjusting filters."/></div>
            : filtered.map(t => <TicketCard key={t.ticketId} ticket={t} onClick={() => openTicket(t)}/>)}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <TicketModal ticket={selected} currentUser={user} onClose={() => setSelected(null)} onUpdated={handleUpdate}/>
      )}
      <NewTicketModal open={newModal} onClose={() => setNewModal(false)} onCreated={load} isStaff={true}/>
    </div>
  )
}
