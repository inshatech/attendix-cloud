import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Ticket, ChevronDown, Sparkles, Clock } from 'lucide-react'
import { useAuth } from '../../store/auth'
import api from '../../lib/api'

function fmtTime(d) {
  try { return new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) } catch { return '' }
}

if (typeof document !== 'undefined' && !document.getElementById('cw-css')) {
  const s = document.createElement('style'); s.id = 'cw-css'
  s.textContent = `
    @keyframes cw-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.92)} }
    @keyframes cw-ring   { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.2);opacity:0} }
    @keyframes cw-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes cw-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes cw-shimmer{ 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    .cw-input { resize:none;outline:none;background:transparent;width:100%;color:#e8e8f8;font-size:0.9375rem;font-family:inherit;border:none;line-height:1.5; }
    .cw-input::placeholder { color:#3a3a58; }
    .cw-scroll::-webkit-scrollbar { width:2px; }
    .cw-scroll::-webkit-scrollbar-thumb { background:rgba(88,166,255,.2);border-radius:99px; }
    .cw-msg { animation: cw-fadein .2s ease-out; }
    .cw-send-btn:hover { transform:scale(1.05) !important; }
    .cw-send-btn:active { transform:scale(.95) !important; }
  `
  document.head.appendChild(s)
}

const QUICK_REPLIES = [
  'How do I link a biometric device?',
  'My attendance is not syncing',
  'Subscription & billing question',
  'I need technical support',
]

export default function ChatWidget() {
  const { user, ready } = useAuth()
  const [open,       setOpen]    = useState(false)
  const [messages,   setMsgs]    = useState([])
  const [text,       setText]    = useState('')
  const [sending,    setSending] = useState(false)
  const [staffOnline,setStaff]   = useState(false)
  const [unread,     setUnread]  = useState(0)
  const [ticketId,   setTicketId]= useState(null)
  const [loading,    setLoading] = useState(false)
  const mountedRef = useRef(true)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const sseRef     = useRef(null)
  const reconnRef  = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Load session when opened
  useEffect(() => {
    if (!ready || !user || !open) return
    loadHistory()
    inputRef.current?.focus()
  }, [open])

  // SSE — connect once when user is ready
  useEffect(() => {
    if (!ready || !user) return
    startSSE()
    return () => { sseRef.current?.close(); clearTimeout(reconnRef.current) }
  }, [ready])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  useEffect(() => { if (open) setUnread(0) }, [open])

  function startSSE() {
    clearTimeout(reconnRef.current)
    sseRef.current?.close()
    const token = sessionStorage.getItem('at') || ''
    let src
    try { src = new EventSource(`/chat/stream?token=${token}`) }
    catch { reconnRef.current = setTimeout(startSSE, 6000); return }
    sseRef.current = src

    src.addEventListener('presence', e => {
      try { const d = JSON.parse(e.data); if (mountedRef.current) setStaff(!!d.staffOnline) } catch {}
    })
    src.addEventListener('new_message', e => {
      try {
        const d = JSON.parse(e.data)
        const msg = d?.message
        if (!msg) return
        if (mountedRef.current) {
          setMsgs(prev => prev.some(m => m.msgId === msg.msgId) ? prev : [...prev, msg])
          if (!open) setUnread(p => p + 1)
        }
      } catch {}
    })
    src.addEventListener('session_closed', () => {
      if (mountedRef.current) { setMsgs([]); setTicketId(null) }
    })
    src.onerror = () => {
      src.close()
      reconnRef.current = setTimeout(startSSE, 6000)
    }
  }

  async function loadHistory() {
    setLoading(true)
    try {
      const r = await api.get('/chat/session')
      const d = r?.data   // { ...session, staffOnline }
      if (!mountedRef.current || !d) return
      setStaff(!!d.staffOnline)
      setTicketId(d.ticketId || null)
      setMsgs(Array.isArray(d.messages) ? d.messages : [])
    } catch {}
    finally { if (mountedRef.current) setLoading(false) }
  }

  async function send(msgText) {
    const body = (msgText || text).trim()
    if (!body || sending) return
    setText('')
    setSending(true)

    const tempId = `opt-${Date.now()}`
    const optimistic = {
      msgId: tempId, senderId: user.userId, senderName: user.name||'You',
      senderRole: 'user', text: body, createdAt: new Date().toISOString(),
    }
    setMsgs(prev => [...prev, optimistic])

    try {
      const r = await api.post('/chat/message', { text: body })
      const d = r?.data    // { message, staffOnline, convertedToTicket, ticketId, autoReply }
      if (!mountedRef.current) return

      // Replace optimistic with server message
      const serverMsg = d?.message
      setMsgs(prev => prev.map(m =>
        m.msgId === tempId ? (serverMsg || { ...optimistic, msgId: tempId + '-s' }) : m
      ))

      if (d?.ticketId) setTicketId(d.ticketId)

      // Bot auto-reply when offline
      if (d?.autoReply) {
        setMsgs(prev => [...prev, {
          msgId: `bot-${Date.now()}`, senderId: 'bot',
          senderName: 'Support', senderRole: 'bot',
          text: d.autoReply, createdAt: new Date().toISOString(),
        }])
      }
    } catch {
      if (mountedRef.current) {
        setMsgs(prev => prev.filter(m => m.msgId !== tempId))
        setText(body)
      }
    } finally {
      if (mountedRef.current) setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  if (!ready || !user) return null

  const firstName = user.name?.split(' ')[0] || 'there'
  const hasMessages = messages.length > 0

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, y:16, scale:.96 }}
            animate={{ opacity:1, y:0,  scale:1   }}
            exit={{    opacity:0, y:16, scale:.96  }}
            transition={{ type:'spring', stiffness:320, damping:28 }}
            style={{
              position:'fixed', bottom:90, right:24, zIndex:9998,
              width:'min(400px, calc(100vw - 32px))', height:560,
              display:'flex', flexDirection:'column',
              borderRadius:24, overflow:'hidden',
              background:'linear-gradient(160deg,#0d0d1f 0%,#080814 100%)',
              border:'1px solid rgba(88,166,255,.18)',
              boxShadow:'0 32px 80px rgba(0,0,0,.8), 0 0 0 1px rgba(88,166,255,.06), inset 0 1px 0 rgba(255,255,255,.05)',
            }}>

            {/* Decorative top gradient */}
            <div style={{ position:'absolute', top:0, left:0, right:0, height:120, pointerEvents:'none',
              background:'radial-gradient(ellipse at 50% -20%, rgba(88,166,255,.12) 0%, transparent 70%)', zIndex:0 }}/>

            {/* Header */}
            <div style={{ position:'relative', zIndex:1, padding:'16px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              {/* Avatar with ring */}
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{ width:42, height:42, borderRadius:14,
                  background:'linear-gradient(135deg,rgba(88,166,255,.25),rgba(59,111,212,.15))',
                  border:'1px solid rgba(88,166,255,.35)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <MessageCircle size={18} style={{ color:'#58a6ff' }}/>
                </div>
                {/* Status dot */}
                <div style={{ position:'absolute', bottom:-1, right:-1,
                  width:12, height:12, borderRadius:'50%',
                  background: staffOnline ? '#34d399' : '#4a4a68',
                  border:'2px solid #080814',
                  animation: staffOnline ? 'cw-pulse 2s ease-in-out infinite' : 'none' }}>
                  {staffOnline && <div style={{ position:'absolute', inset:0, borderRadius:'50%',
                    background:'rgba(52,211,153,.6)', animation:'cw-ring 1.5s ease-out infinite' }}/>}
                </div>
              </div>

              <div style={{ flex:1 }}>
                <p style={{ fontSize:'1rem', fontWeight:800, color:'#f0f0ff', letterSpacing:'-0.01em', marginBottom:2 }}>
                  Support Chat
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontSize:'0.75rem', fontWeight:600,
                    color: staffOnline ? '#34d399' : '#5a5a7a' }}>
                    {staffOnline ? '● Team online — replies in seconds' : '● Team offline — message saved as ticket'}
                  </span>
                </div>
              </div>

              <button onClick={() => setOpen(false)}
                style={{ width:32, height:32, borderRadius:10, border:'1px solid rgba(255,255,255,.08)',
                  background:'rgba(255,255,255,.05)', color:'#5a5a7a', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.1)';e.currentTarget.style.color='#9090b8'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.05)';e.currentTarget.style.color='#5a5a7a'}}>
                <ChevronDown size={16}/>
              </button>
            </div>

            {/* Ticket banner */}
            {ticketId && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}}
                style={{ zIndex:1, padding:'7px 20px', background:'rgba(192,132,252,.08)',
                  borderBottom:'1px solid rgba(192,132,252,.15)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <Ticket size={12} style={{ color:'#c084fc', flexShrink:0 }}/>
                <p style={{ fontSize:'0.75rem', color:'#c084fc', fontWeight:600 }}>
                  Ticket <span style={{ fontFamily:'monospace' }}>{ticketId}</span> — we'll email you when we reply
                </p>
              </motion.div>
            )}

            {/* Messages area */}
            <div className="cw-scroll" style={{ flex:1, overflowY:'auto', padding:'16px 20px 8px', display:'flex', flexDirection:'column', gap:10, zIndex:1, position:'relative' }}>

              {/* Welcome state */}
              {!hasMessages && !loading && (
                <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.1}}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', textAlign:'center', gap:4 }}>
                  <div style={{ fontSize:'2.5rem', marginBottom:8, animation:'cw-float 3s ease-in-out infinite' }}>👋</div>
                  <p style={{ fontSize:'1.0625rem', fontWeight:800, color:'#e8e8f8', marginBottom:4 }}>
                    Hi {firstName}!
                  </p>
                  <p style={{ fontSize:'0.8125rem', color:'#5a5a7a', lineHeight:1.65, maxWidth:280, marginBottom:16 }}>
                    {staffOnline
                      ? "We're here to help! Ask us anything."
                      : "We're offline right now. Leave a message and we'll get back to you."}
                  </p>
                  {/* Quick reply chips */}
                  <div style={{ display:'flex', flexDirection:'column', gap:7, width:'100%' }}>
                    {QUICK_REPLIES.map((q,i) => (
                      <motion.button key={i} onClick={() => send(q)}
                        initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:.15+i*.06}}
                        style={{ padding:'9px 14px', borderRadius:12, border:'1px solid rgba(88,166,255,.2)',
                          background:'rgba(88,166,255,.06)', color:'#7eabff', fontSize:'0.8125rem',
                          fontWeight:600, cursor:'pointer', textAlign:'left', transition:'all .15s' }}
                        onMouseEnter={e=>{e.currentTarget.style.background='rgba(88,166,255,.12)';e.currentTarget.style.borderColor='rgba(88,166,255,.35)'}}
                        onMouseLeave={e=>{e.currentTarget.style.background='rgba(88,166,255,.06)';e.currentTarget.style.borderColor='rgba(88,166,255,.2)'}}>
                        {q}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Loading shimmer */}
              {loading && (
                <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:10 }}>
                  {[80,55,70].map((w,i) => (
                    <div key={i} style={{ height:36, width:`${w}%`, borderRadius:12,
                      background:'linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%)',
                      backgroundSize:'200% 100%', animation:'cw-shimmer 1.4s ease-in-out infinite',
                      alignSelf: i%2===0?'flex-start':'flex-end' }}/>
                  ))}
                </div>
              )}

              {/* Messages */}
              {messages.map((m, idx) => {
                const mine  = m.senderId === user?.userId
                const isBot = m.senderRole === 'bot'
                const isOpt = m.msgId?.startsWith('opt-')
                return (
                  <div key={m.msgId || idx} className="cw-msg"
                    style={{ display:'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems:'flex-end', gap:8 }}>
                    {!mine && (
                      <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                        background: isBot ? 'rgba(192,132,252,.15)' : 'linear-gradient(135deg,rgba(88,166,255,.2),rgba(59,111,212,.1))',
                        border:`1px solid ${isBot ? 'rgba(192,132,252,.3)' : 'rgba(88,166,255,.25)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem' }}>
                        {isBot ? '⚡' : '💬'}
                      </div>
                    )}
                    <div style={{ maxWidth:'78%' }}>
                      {!mine && <p style={{ fontSize:'0.69rem', color:'#4a4a68', marginBottom:4, paddingLeft:2 }}>{m.senderName}</p>}
                      <div style={{
                        padding:'10px 14px',
                        borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: mine
                          ? 'linear-gradient(135deg,rgba(88,166,255,.22),rgba(59,111,212,.18))'
                          : isBot ? 'rgba(192,132,252,.1)' : 'rgba(255,255,255,.06)',
                        border: mine
                          ? '1px solid rgba(88,166,255,.28)'
                          : isBot ? '1px solid rgba(192,132,252,.18)' : '1px solid rgba(255,255,255,.08)',
                        opacity: isOpt ? 0.7 : 1,
                        transition:'opacity .2s',
                      }}>
                        <p style={{ fontSize:'0.875rem', color:'#e8e8f8', lineHeight:1.55, wordBreak:'break-word' }}>{m.text}</p>
                      </div>
                      <p style={{ fontSize:'0.67rem', color:'#2a2a42', marginTop:4,
                        textAlign: mine ? 'right' : 'left' }}>
                        {fmtTime(m.createdAt)}{isOpt ? ' · sending…' : ''}
                      </p>
                    </div>
                  </div>
                )
              })}

              <div ref={bottomRef}/>
            </div>

            {/* Input bar */}
            <div style={{ padding:'12px 16px 14px', flexShrink:0, zIndex:1, borderTop:'1px solid rgba(255,255,255,.05)' }}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:8,
                background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)',
                borderRadius:16, padding:'10px 10px 10px 16px',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,.04)', transition:'border-color .2s, box-shadow .2s' }}
                onFocusCapture={e=>{e.currentTarget.style.borderColor='rgba(88,166,255,.4)';e.currentTarget.style.boxShadow='inset 0 1px 0 rgba(255,255,255,.04),0 0 0 3px rgba(88,166,255,.08)'}}
                onBlurCapture={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.1)';e.currentTarget.style.boxShadow='inset 0 1px 0 rgba(255,255,255,.04)'}}>
                <textarea ref={inputRef} className="cw-input" rows={1} value={text}
                  onChange={e => { setText(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,96)+'px' }}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder={staffOnline ? 'Ask anything…' : 'Type a message…'}
                  style={{ maxHeight:96 }}/>
                <motion.button
                  className="cw-send-btn"
                  onClick={() => send()}
                  disabled={!text.trim() || sending}
                  whileTap={{ scale: 0.92 }}
                  style={{
                    width:38, height:38, borderRadius:12, border:'none', flexShrink:0,
                    cursor: text.trim() && !sending ? 'pointer' : 'default',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all .2s',
                    background: text.trim() ? 'linear-gradient(135deg,#58a6ff,#3b6fd4)' : 'rgba(255,255,255,.06)',
                    color: text.trim() ? '#fff' : '#3a3a58',
                    boxShadow: text.trim() ? '0 4px 16px rgba(88,166,255,.4)' : 'none',
                  }}>
                  {sending
                    ? <div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', animation:'cw-ring 1s linear infinite' }}/>
                    : <Send size={15}/>}
                </motion.button>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:8 }}>
                {staffOnline
                  ? <><Sparkles size={10} style={{color:'#34d399'}}/><span style={{fontSize:'0.68rem',color:'#3a3a58'}}>Live chat · Enter to send</span></>
                  : <><Clock size={10} style={{color:'#4a4a68'}}/><span style={{fontSize:'0.68rem',color:'#3a3a58'}}>Creates a ticket · we'll reply by email</span></>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bubble button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale:1.08 }}
        whileTap={{ scale:.93 }}
        style={{
          position:'fixed', bottom:24, right:24, zIndex:9999,
          width:58, height:58, borderRadius:'50%',
          background: open ? 'rgba(12,12,28,.95)' : 'linear-gradient(135deg,#58a6ff 0%,#3b6fd4 100%)',
          border:`1.5px solid ${open ? 'rgba(88,166,255,.3)' : 'transparent'}`,
          boxShadow: open ? '0 4px 20px rgba(0,0,0,.5)' : '0 8px 32px rgba(88,166,255,.5), 0 2px 8px rgba(0,0,0,.4)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        }}>
        <AnimatePresence mode="wait">
          {open
            ? <motion.div key="x" initial={{rotate:-80,opacity:0}} animate={{rotate:0,opacity:1}} exit={{rotate:80,opacity:0}} transition={{duration:.18}}>
                <X size={22} style={{ color:'#7eabff' }}/>
              </motion.div>
            : <motion.div key="m" initial={{rotate:80,opacity:0}} animate={{rotate:0,opacity:1}} exit={{rotate:-80,opacity:0}} transition={{duration:.18}}>
                <MessageCircle size={22} style={{ color:'#fff' }}/>
              </motion.div>}
        </AnimatePresence>

        {/* Unread badge */}
        <AnimatePresence>
          {unread > 0 && !open && (
            <motion.div initial={{scale:0}} animate={{scale:1}} exit={{scale:0}}
              style={{ position:'absolute', top:-3, right:-3, minWidth:18, height:18, borderRadius:9,
                background:'#f87171', border:'2px solid #07070e', padding:'0 4px',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'0.6rem', fontWeight:900, color:'#fff' }}>
              {unread > 9 ? '9+' : unread}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Online dot */}
        {staffOnline && !open && (
          <div style={{ position:'absolute', bottom:1, right:1, width:13, height:13, borderRadius:'50%' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(52,211,153,.5)', animation:'cw-ring 1.5s ease-out infinite' }}/>
            <div style={{ position:'absolute', inset:'2px', borderRadius:'50%', background:'#34d399', border:'2px solid #07070e' }}/>
          </div>
        )}
      </motion.button>
    </>
  )
}
