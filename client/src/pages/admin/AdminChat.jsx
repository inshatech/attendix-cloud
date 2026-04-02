import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle, Send, Ticket, CheckCircle2, RefreshCw } from 'lucide-react'
import { AdminPage, PageHeader } from '../../components/admin/AdminUI'
import { useAuth } from '../../store/auth'
import { useToast } from '../../components/ui/Toast'
import api from '../../lib/api'

function fmtTime(d) {
  try { return new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) } catch { return '' }
}
function fmtAgo(d) {
  try {
    const s = Math.floor((Date.now()-new Date(d))/1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s/60)}m ago`
    return `${Math.floor(s/3600)}h ago`
  } catch { return '' }
}

// Inject CSS once
if (typeof document !== 'undefined' && !document.getElementById('adminchat-css')) {
  const s = document.createElement('style'); s.id = 'adminchat-css'
  s.textContent = `
    @keyframes ac-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .ac-input { resize:none; outline:none; background:transparent; width:100%; color:#e0e0f4; font-size:0.9rem; font-family:inherit; border:none; }
    .ac-input::placeholder { color:#4a4a68; }
    .ac-scroll::-webkit-scrollbar { width:3px; }
    .ac-scroll::-webkit-scrollbar-thumb { background:#1e1e30; border-radius:99px; }
  `
  document.head.appendChild(s)
}

export default function AdminChat() {
  const { user }  = useAuth()
  const { toast } = useToast()

  const [sessions,   setSessions]   = useState([])
  const [activeId,   setActiveId]   = useState(null)
  const [messages,   setMessages]   = useState([])
  const [text,       setText]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [loading,    setLoading]    = useState(true)

  const sessionsRef  = useRef([])   // always in sync with sessions state
  const activeIdRef  = useRef(null) // always in sync with activeId
  const sseRef       = useRef(null)
  const reconnTimer  = useRef(null)
  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const mountedRef   = useRef(true)

  // Keep refs in sync
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Active session object derived from sessions list
  const active = sessions.find(s => s.sessionId === activeId) || null

  useEffect(() => {
    loadSessions()
    startSSE()
    return () => {
      clearTimeout(reconnTimer.current)
      sseRef.current?.close()
    }
  }, []) // eslint-disable-line

  async function loadSessions() {
    setLoading(true)
    try {
      const r = await api.get('/admin/chat/sessions')
      // r = { status, data: [...] } after interceptor
      const list = Array.isArray(r?.data) ? r.data : []
      if (mountedRef.current) setSessions(list)
    } catch(e) {
      // Don't toast auth errors on load — just log
      console.warn('[AdminChat] loadSessions error:', e.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  function startSSE() {
    clearTimeout(reconnTimer.current)
    sseRef.current?.close()

    const token = sessionStorage.getItem('at') || ''
    let src
    try { src = new EventSource(`/admin/chat/stream?token=${token}`) }
    catch(e) { scheduleReconnect(); return }
    sseRef.current = src

    src.addEventListener('init', e => {
      try {
        const payload = JSON.parse(e.data)
        const list = Array.isArray(payload?.sessions) ? payload.sessions : []
        if (mountedRef.current) { setSessions(list); setLoading(false) }
      } catch {}
    })

    src.addEventListener('new_message', e => {
      try {
        const payload = JSON.parse(e.data)
        if (!payload?.sessionId) return
        const msg = payload.message  // may be undefined — guard below

        // Update sessions list
        setSessions(prev => {
          const list = Array.isArray(prev) ? [...prev] : []
          const idx  = list.findIndex(s => s.sessionId === payload.sessionId)
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              lastMsgAt:    new Date().toISOString(),
              unreadByAdmin: (list[idx].unreadByAdmin || 0) + 1,
            }
          } else if (payload.session) {
            list.unshift(payload.session)
          }
          return list.sort((a,b) => new Date(b.lastMsgAt)-new Date(a.lastMsgAt))
        })

        // Append to open pane
        if (msg?.msgId && activeIdRef.current === payload.sessionId) {
          setMessages(prev => {
            if (prev.some(m => m.msgId === msg.msgId)) return prev
            return [...prev, msg]
          })
        }
      } catch(err) {
        console.warn('[AdminChat] new_message parse error:', err.message)
      }
    })

    src.onerror = () => {
      src.close()
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (!mountedRef.current) return
    reconnTimer.current = setTimeout(() => {
      if (mountedRef.current) startSSE()
    }, 5000)
  }

  async function openSession(sessionId) {
    setActiveId(sessionId)
    setMessages([])
    try {
      const r = await api.get(`/admin/chat/${sessionId}`)
      const session = r?.data || r
      if (mountedRef.current) {
        setMessages(Array.isArray(session?.messages) ? session.messages : [])
        setSessions(prev => prev.map(s =>
          s.sessionId === sessionId ? {...s, unreadByAdmin:0} : s
        ))
      }
    } catch(e) { console.warn('[AdminChat] openSession error:', e.message) }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function send() {
    if (!text.trim() || !activeId || sending) return
    const body = text.trim()
    setText('')
    setSending(true)
    const opt = {
      msgId: `opt-${Date.now()}`, senderId: user?.userId,
      senderName: user?.name || 'Support', senderRole: 'admin',
      text: body, createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, opt])
    try {
      const r = await api.post(`/admin/chat/${activeId}/reply`, { text: body })
      const saved = r?.data || opt
      setMessages(prev => prev.map(m => m.msgId === opt.msgId ? saved : m))
    } catch(e) {
      toast(e.message, 'error')
      setMessages(prev => prev.filter(m => m.msgId !== opt.msgId))
      setText(body)
    } finally { setSending(false); inputRef.current?.focus() }
  }

  async function closeSession(sessionId) {
    try {
      await api.patch(`/admin/chat/${sessionId}/close`)
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId))
      if (activeId === sessionId) { setActiveId(null); setMessages([]) }
      toast('Session closed', 'success')
    } catch(e) { toast(e.message, 'error') }
  }

  const totalUnread = sessions.reduce((a, s) => a + (s.unreadByAdmin || 0), 0)

  return (
    <AdminPage>
      <PageHeader title="Live Chat" icon={MessageCircle} iconColor="#58a6ff"
        subtitle={`${sessions.length} conversations · ${totalUnread} unread`}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:99,
            background:'rgba(52,211,153,.1)', border:'1px solid rgba(52,211,153,.2)' }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#34d399',
              animation:'ac-pulse 2s ease-in-out infinite' }}/>
            <span style={{ fontSize:'0.8125rem', color:'#34d399', fontWeight:700 }}>Online</span>
          </div>
          <button onClick={loadSessions} title="Refresh"
            style={{ padding:'7px 10px', borderRadius:9, border:'1px solid rgba(255,255,255,.1)', background:'transparent', color:'var(--text-muted)', cursor:'pointer' }}>
            <RefreshCw size={14}/>
          </button>
        </div>
      </PageHeader>

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:16, height:'calc(100vh - 220px)', minHeight:500 }}>

        {/* Left: session list */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Conversations</p>
            {totalUnread > 0 && (
              <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'2px 8px', borderRadius:99,
                background:'rgba(248,113,113,.2)', color:'#f87171', border:'1px solid rgba(248,113,113,.3)' }}>
                {totalUnread} new
              </span>
            )}
          </div>
          <div className="ac-scroll" style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
                {[1,2,3].map(i => <div key={i} style={{ height:70, borderRadius:10, background:'var(--bg-input)' }}/>)}
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
                <MessageCircle size={32} style={{ color:'var(--text-dim)', margin:'0 auto 12px', display:'block' }}/>
                <p style={{ color:'var(--text-dim)', fontSize:'0.875rem' }}>No active chats</p>
                <p style={{ color:'var(--text-dim)', fontSize:'0.78rem', marginTop:4 }}>Users appear here when they message</p>
              </div>
            ) : sessions.map(s => {
              const isSelected = activeId === s.sessionId
              const hasUnread  = s.unreadByAdmin > 0
              return (
                <button key={s.sessionId} onClick={() => openSession(s.sessionId)}
                  style={{ width:'100%', padding:'12px 16px', textAlign:'left', border:'none', cursor:'pointer',
                    borderBottom:'1px solid rgba(255,255,255,.04)',
                    background: isSelected ? 'rgba(88,166,255,.1)' : 'transparent',
                    borderLeft: isSelected ? '3px solid #58a6ff' : '3px solid transparent',
                    transition:'background .15s' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:'rgba(88,166,255,.15)',
                      border:'1px solid rgba(88,166,255,.25)', display:'flex', alignItems:'center',
                      justifyContent:'center', fontSize:'0.875rem', fontWeight:700, color:'#58a6ff', flexShrink:0 }}>
                      {(s.userName||'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                        <p style={{ fontSize:'0.875rem', fontWeight: hasUnread ? 800 : 600,
                          color: hasUnread ? '#e0e0f4' : '#9090b8',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>
                          {s.userName || 'User'}
                        </p>
                        <p style={{ fontSize:'0.68rem', color:'var(--text-dim)', flexShrink:0 }}>{fmtAgo(s.lastMsgAt)}</p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
                        <p style={{ fontSize:'0.78rem', color:'var(--text-dim)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:170 }}>
                          {s.userEmail || s.orgId || 'No details'}
                        </p>
                        {hasUnread && (
                          <span style={{ width:18, height:18, borderRadius:'50%', background:'#58a6ff',
                            color:'#fff', fontSize:'0.625rem', fontWeight:900,
                            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {s.unreadByAdmin}
                          </span>
                        )}
                      </div>
                      {s.convertedToTicket && s.ticketId && (
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
                          <Ticket size={9} style={{ color:'#c084fc' }}/>
                          <span style={{ fontSize:'0.68rem', color:'#c084fc', fontFamily:'monospace' }}>{s.ticketId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: chat pane */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, border:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {!active ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
              <MessageCircle size={48} style={{ color:'var(--text-dim)' }}/>
              <p style={{ fontSize:'1rem', fontWeight:600, color:'var(--text-dim)' }}>Select a conversation</p>
              <p style={{ fontSize:'0.875rem', color:'var(--text-dim)' }}>Click a chat on the left to start replying</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'rgba(88,166,255,.15)',
                  border:'1px solid rgba(88,166,255,.25)', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:'1rem', fontWeight:700, color:'#58a6ff', flexShrink:0 }}>
                  {(active.userName||'U').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:'0.9375rem', fontWeight:800, color:'#e0e0f4', marginBottom:2 }}>{active.userName}</p>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {active.userEmail && <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{active.userEmail}</p>}
                    {active.orgId && <p style={{ fontSize:'0.75rem', color:'var(--text-dim)', fontFamily:'monospace' }}>{active.orgId}</p>}
                    {active.convertedToTicket && active.ticketId && (
                      <span style={{ fontSize:'0.72rem', color:'#c084fc', background:'rgba(192,132,252,.1)',
                        padding:'1px 8px', borderRadius:99, border:'1px solid rgba(192,132,252,.2)',
                        display:'inline-flex', alignItems:'center', gap:4 }}>
                        <Ticket size={9}/> {active.ticketId}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => closeSession(active.sessionId)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:9,
                    border:'1px solid rgba(248,113,113,.25)', background:'rgba(248,113,113,.08)',
                    color:'#f87171', cursor:'pointer', fontSize:'0.8125rem', fontWeight:600 }}>
                  <CheckCircle2 size={13}/> Close
                </button>
              </div>

              {/* Messages */}
              <div className="ac-scroll" style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10 }}>
                {messages.length === 0 && (
                  <p style={{ textAlign:'center', color:'var(--text-dim)', fontSize:'0.875rem', paddingTop:40 }}>No messages yet</p>
                )}
                {messages.map((m, i) => {
                  const isAdmin = m.senderRole === 'admin' || m.senderRole === 'support'
                  return (
                    <div key={m.msgId || i} style={{ display:'flex', flexDirection: isAdmin ? 'row-reverse' : 'row', alignItems:'flex-end', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'0.72rem', fontWeight:700,
                        background: isAdmin ? 'rgba(52,211,153,.15)' : 'rgba(88,166,255,.15)',
                        border:`1px solid ${isAdmin ? 'rgba(52,211,153,.3)' : 'rgba(88,166,255,.3)'}`,
                        color: isAdmin ? '#34d399' : '#58a6ff' }}>
                        {(m.senderName||'?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ maxWidth:'70%' }}>
                        <p style={{ fontSize:'0.68rem', color:'var(--text-dim)', marginBottom:3,
                          textAlign: isAdmin ? 'right' : 'left' }}>
                          {m.senderName} · {fmtTime(m.createdAt)}
                        </p>
                        <div style={{ padding:'10px 14px',
                          borderRadius: isAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          background: isAdmin ? 'rgba(52,211,153,.1)' : 'rgba(255,255,255,.06)',
                          border:`1px solid ${isAdmin ? 'rgba(52,211,153,.2)' : 'rgba(255,255,255,.08)'}` }}>
                          <p style={{ fontSize:'0.875rem', color:'#e0e0f4', lineHeight:1.5, wordBreak:'break-word' }}>{m.text}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef}/>
              </div>

              {/* Input */}
              <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:10,
                  background:'var(--bg-input)', border:'1px solid rgba(255,255,255,.1)',
                  borderRadius:14, padding:'10px 14px' }}
                  onFocusCapture={e=>e.currentTarget.style.borderColor='rgba(52,211,153,.4)'}
                  onBlurCapture={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.1)'}>
                  <textarea ref={inputRef} className="ac-input" rows={1} value={text}
                    onChange={e=>{ setText(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px' }}
                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
                    placeholder="Reply… (Enter to send)"
                    style={{ maxHeight:120 }}/>
                  <button onClick={send} disabled={!text.trim()||sending}
                    style={{ width:36, height:36, borderRadius:10, border:'none', flexShrink:0,
                      cursor: text.trim() ? 'pointer' : 'default', transition:'all .2s',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      background: text.trim() ? '#34d399' : 'rgba(255,255,255,.06)',
                      color: text.trim() ? 'var(--text-primary)' : 'var(--text-dim)',
                      boxShadow: text.trim() ? '0 4px 14px rgba(52,211,153,.35)' : 'none' }}>
                    <Send size={15}/>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminPage>
  )
}
