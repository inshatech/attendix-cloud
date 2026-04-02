import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CreditCard, CheckCircle2, XCircle, Zap, Calendar, Crown, ArrowRight, RefreshCw, Clock, Receipt } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../store/auth'
import { useToast } from '../components/ui/Toast'
import { UserPage, UserPageHeader, UserStatCard, UserFilterTabs } from '../components/ui/UserUI'
import { daysLeft, fmtDate, fmtINR, cn } from '../lib/utils'
import api from '../lib/api'

const FEATURES = [
  { key: 'realtimePunch',   label: 'Real-time punch events' },
  { key: 'whatsappOtp',     label: 'WhatsApp OTP'          },
  { key: 'bulkSms',         label: 'Bulk SMS'              },
  { key: 'advancedReports', label: 'Advanced reports'      },
  { key: 'apiAccess',       label: 'API access'            },
]

const STATUS_COLORS = {
  active:    { color:'#34d399', bg:'rgba(52,211,153,.1)',    label:'Active'    },
  trial:     { color:'#facc15', bg:'rgba(250,204,21,.1)',    label:'Trial'     },
  expired:   { color:'#f87171', bg:'rgba(248,113,113,.1)',   label:'Expired'   },
  cancelled: { color:'#94a3b8', bg:'rgba(148,163,184,.1)',   label:'Cancelled' },
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, currentPlanId, billing, onSelect, idx }) {
  const isCurrent = plan.planId === currentPlanId
  const price     = billing === 'yearly' ? plan.priceYearly : plan.priceMonthly
  const saving    = plan.priceMonthly > 0 && plan.priceYearly > 0
    ? Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100) : 0
  const accent    = plan.color || '#58a6ff'

  return (
    <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.07 }}
      style={{
        position:'relative', marginTop:20,  // space for the YOUR PLAN badge
        background:'var(--bg-surface)', borderRadius:16, padding:'1.5rem',
        display:'flex', flexDirection:'column', gap:18, overflow:'visible',
        border:`1px solid ${isCurrent ? accent+'55' : 'rgba(255,255,255,.07)'}`,
        boxShadow: isCurrent ? `0 0 28px ${accent}20` : 'var(--shadow-card)',
        transition:'all .2s',
      }}>
      {/* Accent bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, borderRadius:'16px 16px 0 0', background:`linear-gradient(90deg,${accent},transparent)` }}/>

      {/* YOUR PLAN / POPULAR badge — sits above the card */}
      {isCurrent && (
        <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', zIndex:10 }}>
          <span style={{ background:accent, color:'#fff', fontSize:'0.7rem', fontWeight:800, padding:'3px 14px', borderRadius:99, fontFamily:'monospace', letterSpacing:'0.06em', whiteSpace:'nowrap', boxShadow:`0 2px 12px ${accent}40` }}>
            YOUR PLAN
          </span>
        </div>
      )}

      {/* Header: icon + name */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {plan.icon ? (
          <div style={{ width:38, height:38, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.25rem', background:`${accent}18`, border:`1px solid ${accent}28`, flexShrink:0 }}>
            {plan.icon}
          </div>
        ) : plan.isTrial ? <Zap size={18} style={{ color:accent }}/> : <Crown size={18} style={{ color:accent }}/>}
        <div>
          <p style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-primary)' }}>{plan.name}</p>
          {plan.description && <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', marginTop:2 }}>{plan.description}</p>}
        </div>
      </div>

      {/* Price */}
      {plan.isTrial ? (
        <div>
          <p style={{ fontSize:'2rem', fontWeight:800, color:accent, lineHeight:1 }}>Free</p>
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:4, fontFamily:'monospace' }}>{plan.trialDays}-day trial</p>
        </div>
      ) : (
        <div>
          <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
            <p style={{ fontSize:'2rem', fontWeight:800, color:accent, lineHeight:1 }}>{fmtINR(price||0)}</p>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', fontFamily:'monospace' }}>/{billing==='yearly'?'yr':'mo'}</p>
          </div>
          {billing==='yearly' && saving>0 && <p style={{ fontSize:'0.8rem', color:'#34d399', marginTop:4, fontFamily:'monospace' }}>Save {saving}% vs monthly</p>}
        </div>
      )}

      {/* Limits */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {[{v:plan.maxBridges,l:'Orgs'},{v:plan.maxDevices,l:'Devices'},{v:plan.maxEmployees>=99999?'∞':plan.maxEmployees,l:'Staff'}].map(x=>(
          <div key={x.l} style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:10, padding:'8px', textAlign:'center' }}>
            <p style={{ fontWeight:800, color:accent, fontFamily:'monospace', fontSize:'1rem' }}>{x.v}</p>
            <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:3 }}>{x.l}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ display:'flex', flexDirection:'column', gap:7, flex:1 }}>
        {FEATURES.map(f => {
          // If features object is missing entirely, default all enabled. Otherwise use exact value.
          const enabled = plan.features == null ? true : !!plan.features[f.key]
          return (
            <div key={f.key} style={{ display:'flex', alignItems:'center', gap:8 }}>
              {enabled
                ? <CheckCircle2 size={14} style={{ color:accent, flexShrink:0 }}/>
                : <XCircle      size={14} style={{ color:'var(--text-dim)', flexShrink:0 }}/>}
              <span style={{ fontSize:'0.875rem', color:enabled?'var(--text-secondary)':'var(--text-dim)', textDecoration:enabled?'none':'line-through' }}>{f.label}</span>
            </div>
          )
        })}
      </div>

      {/* Button */}
      <button disabled={isCurrent}
        onClick={() => !isCurrent && onSelect(plan, plan.isTrial?'trial':billing)}
        style={{ width:'100%', padding:'11px', borderRadius:10, fontWeight:700, fontSize:'0.9375rem',
          cursor:isCurrent?'default':'pointer', border:'none', transition:'all .15s',
          background:isCurrent?'rgba(255,255,255,.07)':accent,
          color:isCurrent?'#5a5a7a':'#fff', opacity:isCurrent?0.7:1,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {isCurrent ? (plan.isTrial?'Current Trial':'Current Plan')
          : plan.isTrial ? 'Start Free Trial'
          : <><span>Subscribe</span><ArrowRight size={14}/></>}
      </button>
    </motion.div>
  )
}

// ── Payment History Row ───────────────────────────────────────────────────────
function HistoryRow({ item, index }) {
  const ss = STATUS_COLORS[item.status] || STATUS_COLORS.expired
  return (
    <motion.tr initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.03 }}
      style={{ borderBottom:'1px solid rgba(255,255,255,.05)' }}>
      <td style={{ padding:'12px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', background:`${item.planColor||'#58a6ff'}15`, border:`1px solid ${item.planColor||'#58a6ff'}28`, flexShrink:0 }}>
            {item.planIcon||'📦'}
          </div>
          <div>
            <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--text-primary)' }}>{item.planName}</p>
            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontFamily:'monospace', textTransform:'capitalize' }}>{item.billingCycle}</p>
          </div>
        </div>
      </td>
      <td style={{ padding:'12px 16px' }}>
        <span style={{ padding:'3px 10px', borderRadius:99, fontSize:'0.8125rem', fontWeight:600, color:ss.color, background:ss.bg }}>
          {ss.label}
        </span>
      </td>
      <td style={{ padding:'12px 16px', fontSize:'0.875rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{fmtDate(item.startDate)}</td>
      <td style={{ padding:'12px 16px', fontSize:'0.875rem', color:'var(--text-muted)', fontFamily:'monospace' }}>{fmtDate(item.endDate)}</td>
      <td style={{ padding:'12px 16px', fontSize:'0.9rem', fontWeight:700, color:'#34d399', fontFamily:'monospace' }}>
        {item.paidAmount > 0 ? fmtINR(item.paidAmount) : <span style={{ color:'var(--text-muted)' }}>Free</span>}
      </td>
      <td style={{ padding:'12px 16px', maxWidth:160 }}>
        {item.paymentRef
          ? <span style={{ fontSize:'0.78rem', fontFamily:'monospace', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }} title={item.paymentRef}>{item.paymentRef}</span>
          : <span style={{ color:'var(--text-dim)' }}>—</span>}
      </td>
      <td style={{ padding:'12px 16px', fontSize:'0.8125rem', color:'var(--text-muted)' }}>
        {item.notes || '—'}
      </td>
    </motion.tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const GW_META = {
  razorpay: { label:'Razorpay',  icon:'💳', color:'#2d82f5', desc:'Cards, UPI, Netbanking, Wallets' },
  phonepe:  { label:'PhonePe',   icon:'📱', color:'#5f259f', desc:'UPI · PhonePe app'              },
  paytm:    { label:'Paytm',     icon:'💰', color:'#00b9f1', desc:'UPI, Wallets, Cards, EMI'       },
  ccavenue: { label:'CCAvenue',  icon:'🏦', color:'#e8703a', desc:'200+ payment options'           },
  cashfree: { label:'Cashfree',  icon:'💸', color:'#00C853', desc:'UPI, Cards, Netbanking, Wallets'},
}

// ── Checkout Modal — plan summary + coupon + gateway selector ────────────────
function CheckoutModal({ open, plan, cycle, gateways, onConfirm, onClose }) {
  const { toast } = useToast()
  const [coupon,    setCoupon]    = useState('')
  const [couponRes, setCouponRes] = useState(null)
  const [couponBusy,setCouponBusy]= useState(false)
  const [chosenGw,  setChosenGw]  = useState(null)
  const [paying,    setPaying]    = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setCoupon(''); setCouponRes(null); setChosenGw(null) }
  }, [open, plan?.planId, cycle])

  if (!open || !plan) return null

  const baseAmt  = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly
  const finalAmt = couponRes?.finalAmount ?? baseAmt
  const saving   = baseAmt - finalAmt
  const isFree   = couponRes?.discountType === 'trial_ext'

  async function applyCode() {
    if (!coupon.trim()) return
    setCouponBusy(true); setCouponRes(null)
    try {
      const r = await api.post('/subscriptions/validate-coupon', {
        code: coupon.trim(), planId: plan.planId, billingCycle: cycle, amount: baseAmt,
      })
      setCouponRes(r.data)
    } catch(e) { toast(e.message, 'error') }
    finally { setCouponBusy(false) }
  }

  function confirm() {
    if (!isFree && gateways.length > 1 && !chosenGw) return
    const gw = isFree ? null : (gateways.length === 1 ? gateways[0].id : chosenGw)
    onConfirm({ gateway: gw, couponCode: coupon.trim() || null })
  }

  const accent = plan.color || '#58a6ff'
  const canPay = isFree || gateways.length === 0 || gateways.length === 1 || chosenGw

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.72)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }} onClick={onClose}/>
      <div style={{ position:'relative', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:22, width:'100%', maxWidth:460, boxShadow:'0 24px 80px rgba(0,0,0,.7)', overflow:'hidden' }}>
        {/* Header accent */}
        <div style={{ height:3, background:`linear-gradient(90deg,${accent},${accent}88)` }}/>

        {/* Plan summary */}
        <div style={{ padding:'24px 24px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {plan.icon && (
                <div style={{ width:44, height:44, borderRadius:12, background:`${accent}15`, border:`1px solid ${accent}28`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.375rem' }}>
                  {plan.icon}
                </div>
              )}
              <div>
                <p style={{ fontSize:'1.125rem', fontWeight:800, color:'var(--text-primary)' }}>{plan.name}</p>
                <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', textTransform:'capitalize', marginTop:2 }}>{cycle} billing</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.2rem', padding:4 }}>✕</button>
          </div>

          {/* Price display */}
          <div style={{ padding:'16px 20px', borderRadius:14, background:'var(--bg-surface2)', border:'1px solid var(--border)', marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Order Total</p>
                <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                  {saving > 0 && (
                    <span style={{ fontSize:'1rem', color:'var(--text-dim)', textDecoration:'line-through' }}>₹{baseAmt.toLocaleString('en-IN')}</span>
                  )}
                  <span style={{ fontSize:'2rem', fontWeight:900, color: isFree ? '#c084fc' : accent, lineHeight:1 }}>
                    {isFree ? 'FREE' : `₹${finalAmt.toLocaleString('en-IN')}`}
                  </span>
                  {!isFree && <span style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>/{cycle==='yearly'?'yr':'mo'}</span>}
                </div>
                {isFree && <p style={{ fontSize:'0.875rem', color:'#c084fc', marginTop:4 }}>+{couponRes.trialDays} free days via coupon</p>}
              </div>
              {saving > 0 && !isFree && (
                <div style={{ padding:'6px 12px', borderRadius:99, background:'rgba(52,211,153,.12)', border:'1px solid rgba(52,211,153,.25)' }}>
                  <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'#34d399' }}>Save ₹{saving.toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Coupon input */}
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', marginBottom:8 }}>Coupon Code</p>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ position:'relative', flex:1 }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:'1rem', pointerEvents:'none' }}>🎟️</span>
                <input
                  value={coupon}
                  onChange={e=>{ setCoupon(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')); setCouponRes(null) }}
                  onKeyDown={e=>e.key==='Enter'&&applyCode()}
                  placeholder="Enter coupon code"
                  style={{ width:'100%', padding:'10px 12px 10px 38px', borderRadius:10, boxSizing:'border-box',
                    border:`1.5px solid ${couponRes?'rgba(52,211,153,.5)':'rgba(255,255,255,.1)'}`,
                    background: couponRes?'rgba(52,211,153,.05)':'rgba(255,255,255,.04)',
                    color:'var(--text-primary)', fontSize:'0.9375rem', fontFamily:'monospace',
                    letterSpacing:'0.06em', fontWeight:700, outline:'none' }}/>
              </div>
              <button onClick={couponRes?()=>{setCoupon('');setCouponRes(null)}:applyCode}
                disabled={!coupon.trim()||couponBusy}
                style={{ padding:'10px 18px', borderRadius:10, border:'none', fontWeight:700, fontSize:'0.875rem', cursor:(!coupon.trim()||couponBusy)?'default':'pointer', whiteSpace:'nowrap',
                  background: couponRes?'rgba(248,113,113,.12)':'rgba(88,166,255,.15)',
                  color: couponRes?'#f87171':'#58a6ff', opacity:(!coupon.trim()||couponBusy)?0.5:1 }}>
                {couponBusy?'…':couponRes?'✕ Remove':'Apply'}
              </button>
            </div>
            {couponRes && (
              <div style={{ marginTop:8, padding:'8px 12px', borderRadius:9, background:'rgba(52,211,153,.08)', border:'1px solid rgba(52,211,153,.2)', display:'flex', alignItems:'center', gap:8 }}>
                <span>🎉</span>
                <p style={{ fontSize:'0.875rem', color:'#34d399', fontWeight:600 }}>{couponRes.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* Gateway selector */}
        {!isFree && gateways.length > 0 && (
          <div style={{ padding:'0 24px 20px' }}>
            <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', marginBottom:10 }}>
              {gateways.length === 1 ? 'Payment via' : 'Choose payment method'}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {gateways.map(gw => {
                const m = GW_META[gw.id] || { label: gw.label || gw.id, icon:'💳', color: gw.color || '#58a6ff', desc:'' }
                const selected = gateways.length === 1 || chosenGw === gw.id
                return (
                  <button key={gw.id} onClick={()=>setChosenGw(gw.id)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:12, cursor:'pointer', transition:'all .15s', textAlign:'left', width:'100%', border:`1.5px solid ${selected?m.color+'60':'rgba(255,255,255,.07)'}`, background:selected?`${m.color}10`:'rgba(255,255,255,.02)' }}>
                    <span style={{ fontSize:'1.5rem', flexShrink:0 }}>{m.icon}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:'0.9375rem', fontWeight:700, color:selected?m.color:'var(--text-muted)', marginBottom:2 }}>{m.label}</p>
                      <p style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{m.desc}</p>
                    </div>
                    <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${selected?m.color:'rgba(255,255,255,.15)'}`, background:selected?m.color:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {selected && <div style={{ width:7, height:7, borderRadius:'50%', background:'#fff' }}/>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Confirm button */}
        <div style={{ padding:'0 24px 24px' }}>
          <button onClick={confirm} disabled={!canPay || paying}
            style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', fontWeight:800, fontSize:'1rem', cursor:(!canPay||paying)?'default':'pointer', transition:'all .2s',
              background: canPay ? `linear-gradient(135deg,${accent},${accent}cc)` : 'rgba(255,255,255,.06)',
              color: canPay ? '#fff' : '#4a4a68',
              boxShadow: canPay ? `0 4px 20px ${accent}40` : 'none',
              opacity: paying ? 0.7 : 1 }}>
            {paying ? 'Processing…'
              : isFree ? `🎁 Claim Free ${couponRes?.trialDays} Days`
              : !canPay ? 'Select a payment method'
              : `Pay ₹${finalAmt.toLocaleString('en-IN')} →`}
          </button>
          <p style={{ fontSize:'0.75rem', color:'var(--text-dim)', textAlign:'center', marginTop:10 }}>
            🔒 Secure · SSL encrypted · No hidden charges
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Add spin CSS once
if (typeof document !== 'undefined' && !document.getElementById('sub-spin')) {
  const s = document.createElement('style'); s.id = 'sub-spin'
  s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(s)
}

export default function Subscription() {
  const { ready } = useAuth()
  const { toast } = useToast()
  const location   = useLocation()
  const [sub,      setSub]      = useState(null)
  const [plan,     setPlan]     = useState(null)
  const [plans,    setPlans]    = useState([])
  const [history,  setHistory]  = useState([])
  const [billing,  setBilling]  = useState('monthly')
  const [loading,  setLoad]     = useState(true)
  const [activating,setActive]  = useState(false)
  const [tab,      setTab]      = useState('plans')
  const [gateways,  setGateways] = useState([])  // enabled payment gateways
  const [checkout,  setCheckout] = useState(null) // { plan, cycle } — checkout modal open

  async function load() {
    setLoad(true)
    const [sr, pr, hr, gr] = await Promise.allSettled([
      api.get('/subscriptions/my'),
      api.get('/subscriptions/plans'),
      api.get('/subscriptions/history'),
      api.get('/subscriptions/payment-gateways'),
    ])
    if (sr.status==='fulfilled' && sr.value.data) { setSub(sr.value.data.subscription); setPlan(sr.value.data.plan) }
    if (pr.status==='fulfilled') setPlans(pr.value.data||[])
    if (hr.status==='fulfilled') setHistory(hr.value.data||[])
    if (gr.status==='fulfilled') setGateways(gr.value.data||[])
    setLoad(false)
  }

  // Handle redirect back from payment gateway
  useEffect(() => {
    if (!ready) return
    const params    = new URLSearchParams(location.search)
    const payStatus = params.get('payment')
    const txnId     = params.get('txn') || params.get('transactionId') || params.get('merchantTransactionId')
    if (payStatus || txnId) window.history.replaceState({}, '', '/subscription')

    if (txnId) {
      // PhonePe/Paytm redirect — verify payment status via API before activating
      setActive(true)
      api.post('/webhooks/phonepe-redirect', { merchantTransactionId: txnId })
        .then(r => {
          if (r?.duplicate) toast('Subscription already active ✓', 'success')
          else toast('Subscription activated! 🎉', 'success')
          load()
        })
        .catch(e => {
          // Payment was not successful — do NOT activate
          toast(e.message || 'Payment was not completed. No charge made.', 'error')
          load()
        })
        .finally(() => setActive(false))
    } else if (payStatus === 'success') {
      // Razorpay handler fires this after popup success — wait for webhook
      toast('Payment received! Activating…', 'success')
      setActive(true)
      setTimeout(() => { load(); setActive(false) }, 3000)
    } else if (payStatus === 'pending') {
      // Generic gateway redirect — do nothing, let server-side webhook activate
      toast('Payment processing… your subscription will activate shortly.', 'info')
      setTimeout(() => load(), 4000)
    } else if (payStatus === 'cancelled') {
      toast('Payment cancelled. Your existing plan is unchanged.', 'error')
    } else if (payStatus === 'failed') {
      toast('Payment failed. Please try again.', 'error')
    }
    load()
  }, [ready])

  async function doPayment(selectedPlan, cycle, chosenGateway, passedCoupon) {
    try {
      const body = { planId:selectedPlan.planId, billingCycle:cycle }
      if (chosenGateway)          body.gateway    = chosenGateway
      if (passedCoupon?.trim())   body.couponCode = passedCoupon.trim()
      const r = await api.post('/subscriptions/initiate-payment', body)
      const d = r.data
      // trial_ext coupon — no payment, subscription already created
      if (d.gateway === 'trial_ext') {
        toast(d.message || `Trial extended by ${d.trialDays} days! 🎉`, 'success')
        load(); return
      }
      // Show coupon savings in toast
      if (d.coupon) toast(`Coupon applied — ${d.coupon.message}`, 'success')
      if (d.gateway === 'razorpay') {
        if (!window.Razorpay) {
          await new Promise((res,rej) => {
            const s = document.createElement('script'); s.src='https://checkout.razorpay.com/v1/checkout.js'
            s.onload=res; s.onerror=()=>rej(new Error('Failed to load Razorpay'))
            document.head.appendChild(s)
          })
        }
        new window.Razorpay({
          key: d.keyId, order_id: d.orderId, amount: d.amtPaise||d.amount*100, currency:'INR',
          name:'Attendix', description:`${selectedPlan.name} — ${cycle}`,
          notes:{ userId:d.userId||'', planId:selectedPlan.planId, billingCycle:cycle },
          handler:() => { toast('Payment successful! Activating subscription…','success'); setActive(true); setTimeout(()=>{load();setActive(false)},4000) },
          modal:{ ondismiss:()=>{ toast('Payment cancelled. No charge made.','error'); load() } },
        }).open()
      } else if (d.paymentUrl) {
        // Show discount toast before redirect
        if (d.coupon) toast(`🎟️ Coupon ${d.coupon.code} — saving ₹${d.coupon.discountAmount}`, 'success')
        window.location.href = d.paymentUrl
      } else if (d.gateway === 'ccavenue') {
        const form = document.createElement('form'); form.method='POST'; form.action=d.actionUrl
        ;[['encRequest',d.encRequest],['access_code',d.accessCode]].forEach(([n,v])=>{ const i=document.createElement('input'); i.type='hidden'; i.name=n; i.value=v; form.appendChild(i) })
        document.body.appendChild(form); form.submit()
      }
    } catch(e) {
      if (e.message?.includes('No payment gateway')) {
        try { await api.post('/subscriptions/subscribe',{planId:selectedPlan.planId,billingCycle:cycle}); toast(`Subscribed to ${selectedPlan.name}!`,'success'); load() }
        catch(e2) { toast(e2.message,'error') }
      } else { toast(e.message,'error') }
    }
  }

  // Entry point — show gateway picker if multiple gateways enabled, else pay directly


  async function handleSelect(selectedPlan, cycle) {
    if (selectedPlan.isTrial) {
      try { await api.post('/subscriptions/start-trial'); toast('Free trial started!','success'); load() }
      catch(e) { toast(e.message,'error') }
      return
    }
    // Always open checkout modal — single or multiple gateways
    setCheckout({ plan: selectedPlan, cycle })
  }

  const days = daysLeft(sub?.endDate)
  const ss   = STATUS_COLORS[sub?.status] || STATUS_COLORS.expired
  const maxEmp = plan?.maxEmployees>=99999?'∞':(plan?.maxEmployees??null)

  const TABS = [
    { id:'plans',   label:'Plans',            count:0 },
    { id:'history', label:'Payment History',  count:history.length },
  ]

  return (
    <UserPage>
      <UserPageHeader title="Subscription" icon={CreditCard} iconColor="#34d399" subtitle="Manage your plan and billing">
        <button onClick={load} style={{ width:36, height:36, borderRadius:9, background:'transparent', border:'1px solid rgba(255,255,255,.1)', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14}/>
        </button>
      </UserPageHeader>

      {/* Activating spinner */}
      {activating && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderRadius:14, background:'rgba(52,211,153,.06)', border:'1px solid rgba(52,211,153,.2)' }}>
          <div style={{ width:16, height:16, borderRadius:'50%', border:'2.5px solid #34d399', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
          <p style={{ fontSize:'0.9375rem', color:'#34d399', fontWeight:500 }}>Activating your subscription…</p>
        </div>
      )}

      {/* Stat cards */}
      {sub && !loading && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
          <UserStatCard label="Plan"       value={plan?.name||'—'}             icon={CreditCard}   accent={plan?.color||'#34d399'} index={0}/>
          <UserStatCard label="Status"     value={sub.status}                  icon={CheckCircle2} accent={ss.color}               index={1}/>
          <UserStatCard label="Days Left"  value={days<=0?'Expired':days}      icon={Calendar}     accent={days<=7?'#f87171':'#58a6ff'} index={2}/>
          <UserStatCard label="Expires"    value={fmtDate(sub.endDate)}        icon={Calendar}     accent="#5a5a7a"                 index={3}/>
          <UserStatCard label="Payments"   value={history.filter(h=>h.paidAmount>0).length} icon={Receipt} accent="#c084fc" index={4}/>
        </div>
      )}

      {/* Current plan banner */}
      {sub && !loading && (
        <div style={{ background:'var(--bg-surface)', border:`1px solid ${days<=7?'rgba(251,146,60,.25)':'rgba(255,255,255,.08)'}`, borderRadius:18, padding:'1.5rem', boxShadow:'0 4px 24px rgba(0,0,0,.3)', borderLeft:`4px solid ${plan?.color||'#34d399'}` }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:52, height:52, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', background:`${plan?.color||'#34d399'}15`, border:`1.5px solid ${plan?.color||'#34d399'}30`, flexShrink:0 }}>
                {plan?.icon||(sub.status==='trial'?'⚡':'👑')}
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                  <h3 style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--text-primary)' }}>{plan?.name||sub.planId}</h3>
                  <span style={{ padding:'3px 10px', borderRadius:99, fontSize:'0.8125rem', fontWeight:600, color:ss.color, background:ss.bg }}>{ss.label}</span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 16px', fontSize:'0.875rem', color:'var(--text-muted)' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:5 }}><Calendar size={13}/> Expires {fmtDate(sub.endDate)}</span>
                  <span style={{ fontWeight:600, color:days<=7?'#fb923c':(plan?.color||'#58a6ff') }}>
                    {days<=0?'Expired':`${days} day${days!==1?'s':''} remaining`}
                  </span>
                  {sub.paymentRef && <span style={{ fontFamily:'monospace', fontSize:'0.8rem' }}>Ref: {sub.paymentRef}</span>}
                </div>
              </div>
            </div>
            {plan && (
              <div style={{ display:'flex', gap:10 }}>
                {[{v:plan.maxBridges,l:'Orgs'},{v:plan.maxDevices,l:'Devices'},{v:maxEmp||plan.maxEmployees,l:'Staff'}].map(x=>(
                  <div key={x.l} style={{ textAlign:'center', background:'var(--bg-input)', border:'1px solid rgba(255,255,255,.08)', borderRadius:10, padding:'8px 14px' }}>
                    <p style={{ fontSize:'1.125rem', fontWeight:800, color:plan?.color||'#34d399', fontFamily:'monospace' }}>{x.v}</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:3 }}>{x.l}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Progress bar */}
          {sub.startDate && sub.endDate && (
            <div style={{ marginTop:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace', marginBottom:6 }}>
                <span>Started {fmtDate(sub.startDate)}</span><span>Ends {fmtDate(sub.endDate)}</span>
              </div>
              <div style={{ height:6, background:'var(--bg-surface2)', borderRadius:99, overflow:'hidden' }}>
                <motion.div style={{ height:'100%', borderRadius:99, background:days<=7?'#fb923c':(plan?.color||'#58a6ff') }}
                  initial={{ width:0 }}
                  animate={{ width:`${Math.max(5,100-Math.min(100,(days/(plan?.trialDays||30))*100))}%` }}
                  transition={{ duration:1, ease:'easeOut', delay:0.3 }}/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <UserFilterTabs tabs={TABS} active={tab} onChange={setTab}/>

      {/* Plans tab */}
      {tab === 'plans' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <h2 style={{ fontSize:'1.125rem', fontWeight:700, color:'var(--text-primary)' }}>Available Plans</h2>
            <div style={{ display:'flex', background:'var(--bg-surface2)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:4 }}>
              {['monthly','yearly'].map(b=>(
                <button key={b} onClick={()=>setBilling(b)}
                  style={{ padding:'6px 16px', borderRadius:9, fontSize:'0.875rem', fontWeight:600, cursor:'pointer', border:'none', transition:'all .15s',
                    background: billing===b?'#58a6ff':'transparent',
                    color: billing===b?'#fff':'#5a5a7a' }}>
                  {b==='yearly'?'Yearly · Save 20%':'Monthly'}
                </button>
              ))}
            </div>
          </div>

          {loading
            ? <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16, paddingTop:20 }}>{[1,2,3].map(i=><div key={i} style={{ height:420, borderRadius:16 }} className="shimmer"/>)}</div>
            : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16, paddingTop:20 }}>
                {plans.map((p,i)=><PlanCard key={p.planId} plan={p} currentPlanId={sub?.planId} billing={billing} onSelect={handleSelect} idx={i}/>)}
              </div>}
        </>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ background:'var(--bg-surface)', borderRadius:18, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,.25)' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:'rgba(192,132,252,.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Receipt size={14} style={{ color:'#c084fc' }}/>
            </div>
            <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-secondary)' }}>Payment History</span>
            <span style={{ marginLeft:'auto', fontSize:'0.8125rem', color:'var(--text-muted)' }}>{history.length} records</span>
          </div>
          {history.length === 0 ? (
            <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-dim)' }}>
              <Receipt size={36} style={{ margin:'0 auto 12px', opacity:.3 }}/>
              <p style={{ fontSize:'0.9rem' }}>No payment records yet</p>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border-soft)' }}>
                    {['Plan','Status','Started','Expires','Amount','Payment Ref','Notes'].map(h=>(
                      <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((item,i)=><HistoryRow key={item.subscriptionId||i} item={item} index={i}/>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <CheckoutModal
        open={!!checkout}
        gateways={gateways}
        plan={checkout?.plan}
        cycle={checkout?.cycle}
        onClose={() => setCheckout(null)}
        onConfirm={({ gateway, couponCode }) => {
          const { plan, cycle } = checkout
          setCheckout(null)
          doPayment(plan, cycle, gateway, couponCode)
        }}/>
    </UserPage>
  )
}
