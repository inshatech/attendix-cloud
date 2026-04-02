import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Tag, Plus, Edit3, Trash2, RefreshCw, Users, CheckCircle2, XCircle, Clock, Percent, DollarSign, Gift } from 'lucide-react'
import { Button }       from '../../components/ui/Button'
import { Input }        from '../../components/ui/Input'
import { Modal }        from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { AdminPage, PageHeader, StatCard, SectionCard, SearchBox } from '../../components/admin/AdminUI'
import { ActionBtn }    from '../../components/ui/ActionBtn'
import { useAuth }      from '../../store/auth'
import { useToast }     from '../../components/ui/Toast'
import api              from '../../lib/api'

function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—' }
function fmtDT(d)    { return d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Never' }
function isExpired(c){ return c.validTo && new Date(c.validTo) < Date.now() }
function isExhausted(c){ return c.maxUses !== null && c.usedCount >= c.maxUses }

const TYPE_META = {
  percentage: { label:'Percentage',    icon: Percent,     color:'#58a6ff', fmt: v => `${v}% off`        },
  flat:       { label:'Flat Amount',   icon: DollarSign,  color:'#34d399', fmt: v => `₹${v} off`        },
  trial_ext:  { label:'Trial Extension',icon: Gift,       color:'#c084fc', fmt: v => `+${v} free days`  },
}

// ── Coupon form modal ─────────────────────────────────────────────────────────
function CouponModal({ open, coupon, plans, onClose, onSaved }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    code:'', description:'', discountType:'percentage', discountValue:'',
    maxDiscount:'', minAmount:'', maxUses:'', maxUsesPerUser:'1',
    validFrom: new Date().toISOString().slice(0,10), validTo:'',
    applicablePlans:[], applicableCycles:['both'], isActive:true,
  })

  useEffect(() => {
    if (coupon) {
      setForm({
        code:            coupon.code,
        description:     coupon.description     || '',
        discountType:    coupon.discountType,
        discountValue:   String(coupon.discountValue),
        maxDiscount:     coupon.maxDiscount      != null ? String(coupon.maxDiscount) : '',
        minAmount:       coupon.minAmount        ? String(coupon.minAmount) : '',
        maxUses:         coupon.maxUses          != null ? String(coupon.maxUses) : '',
        maxUsesPerUser:  String(coupon.maxUsesPerUser ?? 1),
        validFrom:       coupon.validFrom?.slice(0,10) || new Date().toISOString().slice(0,10),
        validTo:         coupon.validTo?.slice(0,10) || '',
        applicablePlans: coupon.applicablePlans  || [],
        applicableCycles:coupon.applicableCycles || ['both'],
        isActive:        coupon.isActive !== false,
      })
    } else {
      setForm({ code:'', description:'', discountType:'percentage', discountValue:'',
        maxDiscount:'', minAmount:'', maxUses:'', maxUsesPerUser:'1',
        validFrom: new Date().toISOString().slice(0,10), validTo:'',
        applicablePlans:[], applicableCycles:['both'], isActive:true })
    }
  }, [coupon, open])

  const F = (label, key, type='text', ph='') => (
    <div>
      <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>{label}</label>
      <input type={type} value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
        placeholder={ph} className="field-input" style={{ width:'100%' }}/>
    </div>
  )

  async function save() {
    if (!form.code || !form.discountValue) return toast('Code and value required','error')
    setBusy(true)
    try {
      const body = {
        ...form,
        discountValue:  Number(form.discountValue),
        maxDiscount:    form.maxDiscount    ? Number(form.maxDiscount)   : null,
        minAmount:      form.minAmount      ? Number(form.minAmount)     : 0,
        maxUses:        form.maxUses        ? Number(form.maxUses)       : null,
        maxUsesPerUser: form.maxUsesPerUser ? Number(form.maxUsesPerUser): 1,
        validTo:        form.validTo || null,
      }
      if (coupon) { await api.patch(`/admin/coupons/${coupon.couponId}`, body) }
      else        { await api.post('/admin/coupons', body) }
      toast(coupon ? 'Coupon updated' : 'Coupon created', 'success'); onSaved()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  const tm = TYPE_META[form.discountType] || TYPE_META.percentage

  return (
    <Modal open={open} onClose={onClose} title={coupon ? 'Edit Coupon' : 'Create Coupon'} size="lg">
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* Type selector */}
        <div>
          <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:8 }}>Discount Type</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {Object.entries(TYPE_META).map(([k,v]) => (
              <button key={k} onClick={()=>setForm(f=>({...f,discountType:k}))}
                style={{ padding:'12px 10px', borderRadius:12, border:`1px solid ${form.discountType===k?v.color+'50':'rgba(255,255,255,.08)'}`, background:form.discountType===k?`${v.color}10`:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                <v.icon size={18} style={{ color:form.discountType===k?v.color:'var(--text-muted)' }}/>
                <span style={{ fontSize:'0.8125rem', fontWeight:700, color:form.discountType===k?v.color:'var(--text-muted)' }}>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Coupon Code</label>
            <input value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')}))}
              placeholder="e.g. WELCOME50" className="field-input" style={{ width:'100%', fontFamily:'monospace', letterSpacing:'0.1em', fontWeight:700 }}/>
          </div>
          <div>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>
              {form.discountType==='percentage'?'Discount %':form.discountType==='flat'?'Discount Amount (₹)':'Free Days'}
            </label>
            <input type="number" value={form.discountValue} onChange={e=>setForm(f=>({...f,discountValue:e.target.value}))}
              placeholder={form.discountType==='percentage'?'e.g. 20':form.discountType==='flat'?'e.g. 200':'e.g. 7'}
              className="field-input" style={{ width:'100%' }}/>
          </div>
        </div>

        {form.discountType==='percentage' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {F('Max Discount Cap (₹) — optional','maxDiscount','number','e.g. 500 — cap the max saving')}
            {F('Min Order Amount (₹)','minAmount','number','e.g. 1000')}
          </div>
        )}

        {form.discountType==='flat' && F('Min Order Amount (₹)','minAmount','number','e.g. 500')}

        {F('Description (shown to user)','description','text','e.g. Welcome discount for new users')}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {F('Total Usage Limit (blank=unlimited)','maxUses','number','e.g. 100')}
          {F('Per-User Limit','maxUsesPerUser','number','1 = one-time use per user')}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {F('Valid From','validFrom','date')}
          {F('Valid To (blank=no expiry)','validTo','date')}
        </div>

        {/* Billing cycle restriction */}
        <div>
          <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:8 }}>Applicable Billing Cycles</label>
          <div style={{ display:'flex', gap:8 }}>
            {['both','monthly','yearly'].map(cy => (
              <button key={cy} onClick={()=>setForm(f=>({...f,applicableCycles:[cy]}))}
                style={{ padding:'7px 16px', borderRadius:99, border:`1px solid ${form.applicableCycles[0]===cy?'rgba(88,166,255,.4)':'rgba(255,255,255,.08)'}`, background:form.applicableCycles[0]===cy?'rgba(88,166,255,.12)':'transparent', color:form.applicableCycles[0]===cy?'#58a6ff':'#5a5a7a', fontWeight:600, cursor:'pointer', fontSize:'0.875rem', textTransform:'capitalize' }}>
                {cy==='both'?'Both':'Only '+cy}
              </button>
            ))}
          </div>
        </div>

        {/* Plan restriction */}
        {plans.length > 0 && (
          <div>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:8 }}>
              Applicable Plans <span style={{ color:'var(--text-dim)', fontWeight:400 }}>(none selected = all plans)</span>
            </label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {plans.map(p => {
                const sel = form.applicablePlans.includes(p.planId)
                return (
                  <button key={p.planId}
                    onClick={()=>setForm(f=>({ ...f, applicablePlans: sel ? f.applicablePlans.filter(x=>x!==p.planId) : [...f.applicablePlans,p.planId] }))}
                    style={{ padding:'6px 14px', borderRadius:99, border:`1px solid ${sel?'rgba(192,132,252,.4)':'rgba(255,255,255,.08)'}`, background:sel?'rgba(192,132,252,.1)':'transparent', color:sel?'#c084fc':'#5a5a7a', fontWeight:600, cursor:'pointer', fontSize:'0.8125rem', display:'flex', alignItems:'center', gap:6 }}>
                    {p.icon && <span>{p.icon}</span>} {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Active toggle */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
          <button onClick={()=>setForm(f=>({...f,isActive:!f.isActive}))}
            style={{ width:44, height:24, borderRadius:99, border:`1px solid ${form.isActive?'#34d399':'rgba(255,255,255,.12)'}`, background:form.isActive?'rgba(52,211,153,.2)':'transparent', cursor:'pointer', display:'flex', alignItems:'center', padding:2, transition:'all .2s' }}>
            <div style={{ width:18, height:18, borderRadius:'50%', background:form.isActive?'#34d399':'#4a4a68', transition:'all .2s', transform:form.isActive?'translateX(20px)':'translateX(0)' }}/>
          </button>
          <span style={{ fontSize:'0.9375rem', color: form.isActive?'#34d399':'#5a5a7a', fontWeight:600 }}>{form.isActive?'Active — users can apply this coupon':'Paused — coupon is disabled'}</span>
        </div>

        {/* Preview */}
        {form.discountValue && (
          <div style={{ padding:'12px 16px', borderRadius:12, background:`${tm.color}0a`, border:`1px solid ${tm.color}25` }}>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>
              Preview: code <code style={{ color:tm.color, fontWeight:700, background:`${tm.color}12`, padding:'1px 8px', borderRadius:6 }}>{form.code||'CODE'}</code> gives <strong style={{ color:tm.color }}>{tm.fmt(form.discountValue)}</strong>
              {form.discountType==='percentage'&&form.maxDiscount ? ` (max ₹${form.maxDiscount})` : ''}
              {form.minAmount?` on orders above ₹${form.minAmount}`:''}
              {form.maxUses?`, valid ${form.maxUses} times total`:', unlimited uses'}
              {form.validTo?`, expires ${fmtDate(form.validTo)}`:''}
            </p>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{coupon?'Save Changes':'Create Coupon'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Usage drawer ──────────────────────────────────────────────────────────────
function UsageModal({ open, coupon, onClose }) {
  const [usages, setUsages] = useState([])
  const [busy,   setBusy]   = useState(false)
  useEffect(() => {
    if (!open || !coupon) return
    setBusy(true)
    api.get(`/admin/coupons/${coupon.couponId}/usage`).then(r=>setUsages(r.data||[])).catch(()=>{}).finally(()=>setBusy(false))
  }, [open, coupon?._id])

  return (
    <Modal open={open} onClose={onClose} title={`Usage — ${coupon?.code}`} size="md">
      {busy ? <div className="shimmer h-20 rounded-xl"/> : usages.length === 0
        ? <p style={{ textAlign:'center', color:'var(--text-dim)', padding:'2rem' }}>No uses yet</p>
        : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {usages.map((u,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                <div>
                  <p style={{ fontSize:'0.875rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{u.userId}</p>
                  <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', marginTop:3 }}>{fmtDT(u.usedAt)}</p>
                </div>
                <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#34d399', fontFamily:'monospace' }}>
                  {u.discount > 0 ? `-₹${u.discount}` : 'Free'}
                </span>
              </div>
            ))}
          </div>}
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminCoupons() {
  const { ready } = useAuth()
  const { toast } = useToast()
  const [coupons, setCoupons] = useState([])
  const [plans,   setPlans]   = useState([])
  const [loading, setLoad]    = useState(true)
  const [q,       setQ]       = useState('')
  const [editing, setEdit]    = useState(null)
  const [creating,setCreate]  = useState(false)
  const [deleting,setDel]     = useState(null)
  const [delBusy, setDelBusy] = useState(false)
  const [viewing, setView]    = useState(null)

  async function doLoad() {
    setLoad(true)
    try {
      const [cr, pr] = await Promise.all([api.get('/admin/coupons'), api.get('/admin/plans')])
      setCoupons(cr.data||[]); setPlans(pr.data||[])
    } catch(e) { toast(e.message,'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready) doLoad() }, [ready])

  const filtered = coupons.filter(c =>
    !q || c.code.includes(q.toUpperCase()) || (c.description||'').toLowerCase().includes(q.toLowerCase())
  )

  const active     = coupons.filter(c => c.isActive && !isExpired(c) && !isExhausted(c)).length
  const expired_c  = coupons.filter(c => isExpired(c)).length
  const exhausted  = coupons.filter(c => isExhausted(c)).length
  const paused     = coupons.filter(c => !c.isActive).length
  const totalUses  = coupons.reduce((a,c)=>a+(c.usedCount||0),0)
  const totalSaved = coupons.reduce((a,c)=>a+(c.usageStats?.totalDiscount||0),0)

  return (
    <AdminPage>
      <PageHeader title="Coupon Codes" icon={Tag} iconColor="#facc15" subtitle={`${coupons.length} coupons · ${totalUses} total uses`}>
        <div style={{ display:'flex', gap:8 }}>
          <Button variant="secondary" onClick={doLoad}><RefreshCw size={14}/></Button>
          <Button onClick={()=>setCreate(true)}><Plus size={14}/> New Coupon</Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <StatCard label="Active"     value={active}    icon={CheckCircle2} accent="#34d399" index={0}/>
        <StatCard label="Expired"    value={expired_c} icon={XCircle}      accent="#f87171" index={1}/>
        <StatCard label="Exhausted"  value={exhausted} icon={XCircle}      accent="#fb923c" index={2}/>
        <StatCard label="Paused"     value={paused}    icon={Clock}        accent="#5a5a7a" index={3}/>
        <StatCard label="Total Uses" value={totalUses} icon={Users}        accent="#c084fc" index={4}/>
        <StatCard label="Total Saved" value={`₹${totalSaved.toLocaleString('en-IN')}`} icon={Tag} accent="#facc15" index={5}/>
      </div>

      {/* Search */}
      <SearchBox value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by code or description…"/>

      {/* Table */}
      <SectionCard title={`${filtered.length} coupons`} icon={Tag} noPadding>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:820 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Code','Type','Discount','Restrictions','Usage','Validity','Status',''].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:4}).map((_,i)=>(
                <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                  {Array.from({length:8}).map((_,j)=><td key={j} style={{padding:'12px 14px'}}><div style={{height:14,borderRadius:6,background:'var(--bg-surface2)',width:80}}/></td>)}
                </tr>
              )) : filtered.length === 0
                ? <tr><td colSpan={8} style={{padding:'3rem',textAlign:'center',color:'var(--text-dim)',fontSize:'0.9rem'}}>No coupons found</td></tr>
                : filtered.map((c,i) => {
                  const tm       = TYPE_META[c.discountType] || TYPE_META.flat
                  const expired  = isExpired(c)
                  const exhaust  = isExhausted(c)
                  const inactive = !c.isActive || expired || exhaust
                  const statusColor = !c.isActive?'#5a5a7a':expired?'#f87171':exhaust?'#fb923c':'#34d399'
                  const statusLabel = !c.isActive?'Paused':expired?'Expired':exhaust?'Exhausted':'Active'

                  return (
                    <motion.tr key={c._id||i} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}}
                      style={{ borderBottom:'1px solid rgba(255,255,255,.04)', opacity:inactive?0.6:1 }}>
                      {/* Code */}
                      <td style={{ padding:'11px 14px' }}>
                        <code style={{ fontSize:'0.9375rem', fontWeight:800, color:tm.color, background:`${tm.color}12`, padding:'3px 10px', borderRadius:8, letterSpacing:'0.05em' }}>{c.code}</code>
                        {c.description && <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:4, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.description}</p>}
                      </td>
                      {/* Type */}
                      <td style={{ padding:'11px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <tm.icon size={14} style={{ color:tm.color, flexShrink:0 }}/>
                          <span style={{ fontSize:'0.8125rem', color:tm.color, fontWeight:600 }}>{tm.label}</span>
                        </div>
                      </td>
                      {/* Discount */}
                      <td style={{ padding:'11px 14px' }}>
                        <p style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--text-primary)', fontFamily:'monospace' }}>{tm.fmt(c.discountValue)}</p>
                        {c.discountType==='percentage'&&c.maxDiscount && <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:2 }}>max ₹{c.maxDiscount}</p>}
                        {c.minAmount>0 && <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:2 }}>min ₹{c.minAmount}</p>}
                      </td>
                      {/* Restrictions */}
                      <td style={{ padding:'11px 14px' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{(c.applicableCycles||['both'])[0]==='both'?'Monthly & Yearly':(c.applicableCycles||['both'])[0]+' only'}</span>
                          {c.applicablePlans?.length>0 && <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{c.applicablePlans.length} plan{c.applicablePlans.length>1?'s':''}</span>}
                          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Max {c.maxUsesPerUser??1}×/user</span>
                        </div>
                      </td>
                      {/* Usage */}
                      <td style={{ padding:'11px 14px' }}>
                        <p style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--text-primary)', fontFamily:'monospace' }}>
                          {c.usedCount} {c.maxUses ? `/ ${c.maxUses}` : '/ ∞'}
                        </p>
                        {c.usageStats?.totalDiscount > 0 && <p style={{ fontSize:'0.75rem', color:'#34d399', marginTop:2 }}>₹{c.usageStats.totalDiscount} saved</p>}
                      </td>
                      {/* Validity */}
                      <td style={{ padding:'11px 14px' }}>
                        <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', fontFamily:'monospace', whiteSpace:'nowrap' }}>{fmtDate(c.validFrom)}</p>
                        <p style={{ fontSize:'0.8125rem', color:expired?'#f87171':'#9090b8', fontFamily:'monospace', whiteSpace:'nowrap', marginTop:2 }}>→ {c.validTo?fmtDate(c.validTo):'No expiry'}</p>
                      </td>
                      {/* Status */}
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ padding:'3px 10px', borderRadius:99, fontSize:'0.8125rem', fontWeight:600, color:statusColor, background:`${statusColor}15` }}>{statusLabel}</span>
                      </td>
                      {/* Actions */}
                      <td style={{ padding:'11px 14px' }} onClick={e=>e.stopPropagation()}>
                        <div style={{ display:'flex', gap:3 }}>
                          <ActionBtn label="Usage" icon={Users}  onClick={()=>setView(c)}  size="sm" hoverColor="#c084fc"/>
                          <ActionBtn label="Edit"  icon={Edit3}  onClick={()=>setEdit(c)}  size="sm" hoverColor="#facc15"/>
                          <ActionBtn label="Delete" icon={Trash2} onClick={()=>setDel(c)} size="sm" danger/>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <CouponModal open={creating||!!editing} coupon={editing} plans={plans}
        onClose={()=>{ setCreate(false); setEdit(null) }}
        onSaved={()=>{ setCreate(false); setEdit(null); doLoad() }}/>
      <UsageModal open={!!viewing} coupon={viewing} onClose={()=>setView(null)}/>
      <ConfirmModal open={!!deleting} onClose={()=>setDel(null)} danger loading={delBusy}
        title="Delete Coupon" message={`Delete coupon "${deleting?.code}"? Existing usage records remain.`}
        onConfirm={async()=>{
          setDelBusy(true)
          try { await api.delete(`/admin/coupons/${deleting.couponId}`); toast('Deleted','success'); setDel(null); doLoad() }
          catch(e) { toast(e.message,'error') }
          finally { setDelBusy(false) }
        }}/>
    </AdminPage>
  )
}
