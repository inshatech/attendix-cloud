import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ticket, Plus, MessageSquare, Clock, CheckCircle2, Inbox, Zap, XCircle,
  AlertTriangle, List, AlarmClock, Send, RefreshCw, ChevronRight, User, Shield
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Empty } from '../components/ui/Empty'
import { useAuth } from '../store/auth'
import { useOrgContext } from '../store/context'
import { useToast } from '../components/ui/Toast'
import { UserPage, UserPageHeader, UserStatCard, UserAvatar } from '../components/ui/UserUI'
import api from '../lib/api'

const STATUS_META = {
  'open':        { color:'#3b82f6', bg:'rgba(59,130,246,.1)',  border:'rgba(59,130,246,.25)',  label:'Open'        },
  'assigned':    { color:'#f97316', bg:'rgba(249,115,22,.1)',  border:'rgba(249,115,22,.25)',  label:'Assigned'    },
  'in-progress': { color:'#a855f7', bg:'rgba(168,85,247,.1)',  border:'rgba(168,85,247,.25)',  label:'In Progress' },
  'waiting':     { color:'#eab308', bg:'rgba(234,179,8,.1)',   border:'rgba(234,179,8,.25)',   label:'Waiting'     },
  'resolved':    { color:'#22c55e', bg:'rgba(34,197,94,.1)',   border:'rgba(34,197,94,.25)',   label:'Resolved'    },
  'closed':      { color:'var(--text-muted)', bg:'var(--bg-surface2)', border:'var(--border)', label:'Closed'      },
}

const PRIORITY_META = {
  critical: { color:'#f87171', label:'Critical' },
  high:     { color:'#fb923c', label:'High'     },
  medium:   { color:'#facc15', label:'Medium'   },
  low:      { color:'var(--text-muted)', label:'Low' },
}

const CATEGORIES = ['general','billing','technical','device','bridge','attendance','feature','other']

function StatusPill({ status }) {
  const s = STATUS_META[status] || STATUS_META.open
  return (
    <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'3px 10px', borderRadius:99,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`, whiteSpace:'nowrap' }}>
      {s.label}
    </span>
  )
}

function PriorityPill({ priority }) {
  const p = PRIORITY_META[priority] || PRIORITY_META.medium
  return (
    <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'3px 8px', borderRadius:6,
      background:'var(--bg-surface2)', color:p.color, border:'1px solid var(--border)',
      textTransform:'capitalize', whiteSpace:'nowrap' }}>
      {p.label}
    </span>
  )
}

// ── New Ticket Modal ──────────────────────────────────────────────────────────
function NewTicketModal({ open, onClose, orgId, onCreated }) {
  const [form, setForm] = useState({ subject:'', body:'', category:'general', priority:'medium', orgId:'' })
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) setForm({ subject:'', body:'', category:'general', priority:'medium', orgId: orgId||'' })
  }, [open])

  const sf = k => e => setForm(f => ({...f, [k]: e.target.value}))

  async function submit() {
    if (!form.subject.trim()) return toast('Subject is required', 'error')
    if (!form.body.trim())    return toast('Please describe your issue', 'error')
    setBusy(true)
    try {
      await api.post('/tickets', form)
      toast('Ticket submitted!', 'success'); onCreated(); onClose()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Support Ticket" description="Describe your issue and we'll get back to you" size="md">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <Input label="Subject *" value={form.subject} onChange={sf('subject')} placeholder="Briefly describe your issue"/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="field-label">Category</label>
            <select className="field-input" value={form.category} onChange={sf('category')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Priority</label>
            <select className="field-input" value={form.priority} onChange={sf('priority')}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Description *</label>
          <textarea value={form.body} onChange={sf('body')} rows={5}
            placeholder="Describe your issue in detail…"
            style={{ width:'100%', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 14px', color:'var(--text-primary)', fontSize:'0.9375rem', resize:'vertical', fontFamily:'inherit', outline:'none', lineHeight:1.6 }}
            onFocus={e => e.target.style.borderColor='var(--accent)'}
            onBlur={e => e.target.style.borderColor='var(--border)'}/>
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:12, borderTop:'1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy}><Send size={13}/> Submit Ticket</Button>
      </div>
    </Modal>
  )
}

// ── Ticket Detail Modal ───────────────────────────────────────────────────────
function TicketDetailModal({ open, onClose, ticketId, onUpdated }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [ticket, setTicket] = useState(null)
  const [reply,  setReply]  = useState('')
  const [busy,   setBusy]   = useState(false)

  useEffect(() => {
    if (!open || !ticketId) return
    setTicket(null)
    api.get(`/tickets/${ticketId}`).then(r => setTicket(r.data)).catch(e => toast(e.message, 'error'))
  }, [open, ticketId])

  async function sendReply() {
    if (!reply.trim()) return
    setBusy(true)
    try {
      const r = await api.post(`/tickets/${ticketId}/reply`, { body: reply })
      setTicket(r.data); setReply(''); onUpdated()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function closeTicket() {
    try {
      const r = await api.patch(`/tickets/${ticketId}/close`)
      setTicket(r.data); onUpdated()
    } catch(e) { toast(e.message, 'error') }
  }

  const canReply = ticket && !['closed'].includes(ticket.status)
  const messages = ticket?.messages?.filter(m => !m.isInternal) || []

  return (
    <Modal open={open} onClose={onClose} title={null} size="xl" noBodyPad>
      {!ticket ? (
        <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-dim)' }}>
          <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid var(--border)', borderTopColor:'var(--accent)', animation:'spin 1s linear infinite', margin:'0 auto 12px' }}/>
          Loading…
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', height:'80vh' }}>

          {/* ── Header ── */}
          <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', flexShrink:0,
            background:'var(--bg-surface2)' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                  <span style={{ fontSize:'0.75rem', fontFamily:'monospace', fontWeight:700,
                    color:'var(--accent)', background:'var(--accent-muted)',
                    padding:'3px 10px', borderRadius:99, border:'1px solid var(--accent-border)' }}>
                    {ticket.ticketId}
                  </span>
                  <StatusPill status={ticket.status}/>
                  <PriorityPill priority={ticket.priority}/>
                  <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', background:'var(--bg-elevated)',
                    padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)',
                    textTransform:'capitalize' }}>{ticket.category}</span>
                </div>
                <h2 style={{ fontSize:'1.125rem', fontWeight:800, color:'var(--text-primary)', lineHeight:1.3, marginBottom:6 }}>
                  {ticket.subject}
                </h2>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:'0.8125rem', color:'var(--text-muted)' }}>
                  <span>From <strong style={{ color:'var(--text-secondary)', fontWeight:600 }}>{ticket.userName}</strong></span>
                  {ticket.assignedName && <span>· Assigned to <strong style={{ color:'var(--accent)', fontWeight:600 }}>{ticket.assignedName}</strong></span>}
                  <span>· {new Date(ticket.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
                </div>
              </div>
              <button onClick={onClose}
                style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)',
                  background:'var(--bg-elevated)', display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', color:'var(--text-muted)', flexShrink:0 }}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-surface2)';e.currentTarget.style.color='var(--text-primary)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-elevated)';e.currentTarget.style.color='var(--text-muted)'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:12 }}>
            <AnimatePresence initial={false}>
              {messages.map((m, i) => {
                const isMe = m.authorId === user?.userId
                const isSupport = m.authorRole !== 'user'
                return (
                  <motion.div key={m.messageId||i}
                    initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                    style={{
                      display:'flex', gap:12, alignItems:'flex-start',
                      flexDirection: isMe ? 'row-reverse' : 'row',
                    }}>
                    <UserAvatar name={m.authorName||'?'} size={34}/>
                    <div style={{ flex:1, maxWidth:'80%' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6,
                        flexDirection: isMe ? 'row-reverse' : 'row' }}>
                        <span style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)' }}>
                          {isMe ? 'You' : m.authorName}
                        </span>
                        {isSupport && (
                          <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'2px 7px', borderRadius:99,
                            background:'rgba(34,197,94,.1)', color:'#16a34a', border:'1px solid rgba(34,197,94,.2)',
                            display:'flex', alignItems:'center', gap:3 }}>
                            <Shield size={10}/> Staff
                          </span>
                        )}
                        <span style={{ fontSize:'0.75rem', color:'var(--text-dim)', fontFamily:'monospace' }}>
                          {new Date(m.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </span>
                      </div>
                      <div style={{
                        padding:'12px 16px', borderRadius: isMe ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                        background: isMe ? 'var(--accent-muted)' : 'var(--bg-surface2)',
                        border: `1px solid ${isMe ? 'var(--accent-border)' : 'var(--border)'}`,
                      }}>
                        <p style={{ fontSize:'0.9375rem', color:'var(--text-secondary)', whiteSpace:'pre-wrap', lineHeight:1.7 }}>
                          {m.body}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            {messages.length === 0 && (
              <div style={{ textAlign:'center', padding:'2rem 0', color:'var(--text-dim)', fontSize:'0.875rem', fontFamily:'monospace' }}>
                No messages yet
              </div>
            )}
          </div>

          {/* ── Reply ── */}
          <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', background:'var(--bg-surface2)', flexShrink:0 }}>
            {canReply ? (
              <>
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3}
                  placeholder="Write a reply… (Ctrl+Enter to send)"
                  onKeyDown={e => { if (e.ctrlKey && e.key==='Enter') sendReply() }}
                  style={{ width:'100%', background:'var(--bg-elevated)', border:'1px solid var(--border)',
                    borderRadius:10, padding:'12px 14px', color:'var(--text-primary)', fontSize:'0.9375rem',
                    resize:'none', fontFamily:'inherit', outline:'none', lineHeight:1.6, marginBottom:10 }}
                  onFocus={e => e.target.style.borderColor='var(--accent)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'}/>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <button onClick={closeTicket}
                    style={{ padding:'8px 14px', borderRadius:8, background:'transparent',
                      border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:'0.875rem',
                      fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(34,197,94,.4)';e.currentTarget.style.color='#16a34a'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-muted)'}}>
                    <CheckCircle2 size={14}/> Mark Resolved
                  </button>
                  <button onClick={sendReply} disabled={busy || !reply.trim()}
                    style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 20px', borderRadius:10,
                      background:'var(--accent)', color:'#fff', fontSize:'0.9375rem', fontWeight:700,
                      border:'none', cursor: (!reply.trim()||busy) ? 'not-allowed' : 'pointer',
                      opacity: (!reply.trim()||busy) ? 0.4 : 1, transition:'all .15s',
                      boxShadow: reply.trim() ? '0 4px 14px var(--accent-muted)' : 'none' }}>
                    <Send size={15}/> Send Reply
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', fontSize:'0.8125rem', color:'var(--text-dim)',
                fontFamily:'monospace', padding:'8px 0' }}>
                This ticket is {ticket.status} — no further replies
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
    </Modal>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Tickets() {
  const { ready } = useAuth()
  const { orgId } = useOrgContext()
  const { toast } = useToast()

  const [tickets,  setTickets] = useState([])
  const [loading,  setLoad]    = useState(true)
  const [newModal, setNew]     = useState(false)
  const [detailId, setDetail]  = useState(null)
  const [filter,   setFilter]  = useState('')

  async function load() {
    setLoad(true)
    try {
      const r = await api.get('/tickets?limit=200')
      setTickets(r.data || [])
    } catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready) load() }, [ready])

  const open     = tickets.filter(t => ['open','in-progress','assigned','waiting'].includes(t.status)).length
  const resolved = tickets.filter(t => ['resolved','closed'].includes(t.status)).length

  const counts = {
    '':            tickets.length,
    'open':        tickets.filter(t => t.status === 'open').length,
    'in-progress': tickets.filter(t => ['in-progress','assigned'].includes(t.status)).length,
    'waiting':     tickets.filter(t => t.status === 'waiting').length,
    'resolved':    tickets.filter(t => t.status === 'resolved').length,
    'closed':      tickets.filter(t => t.status === 'closed').length,
  }

  const FILTERS = [
    { id:'',            label:'All',         icon: List         },
    { id:'open',        label:'Open',        icon: Inbox        },
    { id:'in-progress', label:'In Progress', icon: Zap          },
    { id:'waiting',     label:'Waiting',     icon: AlarmClock   },
    { id:'resolved',    label:'Resolved',    icon: CheckCircle2 },
    { id:'closed',      label:'Closed',      icon: XCircle      },
  ]

  const displayed = filter
    ? tickets.filter(t => filter === 'in-progress'
        ? ['in-progress','assigned'].includes(t.status)
        : t.status === filter)
    : tickets

  return (
    <UserPage>
      <UserPageHeader title="Support" icon={Ticket} iconColor="#58a6ff"
        subtitle={`${open} open · ${resolved} resolved`}>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={13}/></Button>
        <Button onClick={() => setNew(true)}><Plus size={15}/> New Ticket</Button>
      </UserPageHeader>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <UserStatCard label="Open"        value={counts['open']||0}        icon={Inbox}        accent="#3b82f6" index={0}/>
        <UserStatCard label="In Progress" value={counts['in-progress']||0} icon={Zap}          accent="#a855f7" index={1}/>
        <UserStatCard label="Waiting"     value={counts['waiting']||0}     icon={Clock}        accent="#eab308" index={2}/>
        <UserStatCard label="Resolved"    value={counts['resolved']||0}    icon={CheckCircle2} accent="#22c55e" index={3}/>
        <UserStatCard label="Closed"      value={counts['closed']||0}      icon={XCircle}      accent="var(--text-muted)" index={4}/>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
        {FILTERS.map(f => {
          const count = counts[f.id] ?? 0
          const active = filter === f.id
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 16px',
                fontSize:'0.8125rem', fontFamily:'monospace', fontWeight:600, whiteSpace:'nowrap',
                background:'transparent', cursor:'pointer',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                transition:'color .15s' }}>
              <f.icon size={13}/>
              {f.label}
              {count > 0 && (
                <span style={{ minWidth:20, height:20, padding:'0 5px', borderRadius:99,
                  background: active ? 'var(--accent)' : 'var(--bg-surface2)',
                  color: active ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                  fontSize:'0.7rem', fontWeight:700,
                  display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:90, borderRadius:14 }} className="shimmer"/>)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card" style={{ padding:'2rem' }}>
          <Empty icon={Ticket} title="No tickets"
            description="Create a support ticket if you're facing any issues."
            action={<Button onClick={() => setNew(true)}><Plus size={13}/> Create Ticket</Button>}/>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {displayed.map((t, i) => {
            const sm = STATUS_META[t.status] || STATUS_META.open
            const hasReplies = (t.messages?.filter(m => m.authorRole !== 'user').length || 0) > 0
            return (
              <motion.div key={t.ticketId} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.03 }}
                onClick={() => setDetail(t.ticketId)}
                style={{ background:'var(--bg-surface)', borderRadius:14, padding:'16px 20px',
                  cursor:'pointer', border:'1px solid var(--border)',
                  borderLeft:`3px solid ${sm.color}`, transition:'all .15s',
                  boxShadow:'var(--shadow-card)' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='var(--shadow-card)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    {/* Pills row */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:'0.7rem', fontFamily:'monospace', fontWeight:700,
                        color:'var(--text-muted)', background:'var(--bg-input)', padding:'2px 7px',
                        borderRadius:5, border:'1px solid var(--border)' }}>{t.ticketId}</span>
                      <StatusPill status={t.status}/>
                      <PriorityPill priority={t.priority}/>
                      <span style={{ fontSize:'0.7rem', color:'var(--text-dim)', textTransform:'capitalize' }}>{t.category}</span>
                      {hasReplies && (
                        <span style={{ fontSize:'0.7rem', fontWeight:600, color:'#16a34a',
                          background:'rgba(34,197,94,.08)', padding:'2px 7px', borderRadius:5,
                          border:'1px solid rgba(34,197,94,.2)' }}>Staff replied</span>
                      )}
                    </div>
                    {/* Subject */}
                    <p style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)', marginBottom:4, lineHeight:1.3 }}>
                      {t.subject}
                    </p>
                    {/* Meta */}
                    <div style={{ display:'flex', alignItems:'center', gap:12, fontSize:'0.8125rem', color:'var(--text-muted)' }}>
                      {t.assignedName && (
                        <span style={{ color:'var(--accent)', fontWeight:500 }}>→ {t.assignedName}</span>
                      )}
                      <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <MessageSquare size={12}/>{t.messages?.length||0}
                      </span>
                      <span style={{ fontFamily:'monospace' }}>
                        {new Date(t.updatedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color:'var(--text-dim)', flexShrink:0, marginTop:2 }}/>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <NewTicketModal open={newModal} onClose={() => setNew(false)} orgId={orgId} onCreated={load}/>
      <TicketDetailModal open={!!detailId} onClose={() => setDetail(null)} ticketId={detailId} onUpdated={load}/>
    </UserPage>
  )
}