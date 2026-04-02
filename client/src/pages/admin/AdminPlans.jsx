import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Plus, Edit3, Trash2, RefreshCw, Users, Cpu, Building2, CheckCircle2, Zap, EyeOff } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { ActionBtn } from '../../components/ui/ActionBtn'
import { AdminPage, PageHeader, StatCard } from '../../components/admin/AdminUI'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../store/auth'
import api from '../../lib/api'

const EMPTY = {
  name:'', description:'', priceMonthly:0, priceYearly:0, currency:'INR',
  maxBridges:1, maxDevices:3, maxEmployees:100, retentionDays:90, trialDays:14,
  isTrial:false, isActive:true, icon:'📦', color:'#58a6ff',
  features:{ realtimePunch:true, whatsappOtp:false, bulkSms:false, advancedReports:false, apiAccess:false },
}
const FEATURE_LIST = [
  { k:'realtimePunch',   l:'Real-time Punches' },
  { k:'whatsappOtp',     l:'WhatsApp OTP'      },
  { k:'bulkSms',         l:'Bulk SMS'          },
  { k:'advancedReports', l:'Reports'           },
  { k:'apiAccess',       l:'API Access'        },
]
const ICON_PRESETS = ['📦','🚀','⭐','💎','🏆','🔥','✨','🌟','💼','🎯','🛡️','⚡','🎪','🦋','🌈']
const COLOR_PRESETS = ['#58a6ff','#34d399','#facc15','#f87171','#c084fc','#fb923c','#22d3ee','#a3e635','#f472b6']

function CheckBox({ checked, onChange, label }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
      <div onClick={onChange} style={{ width:18, height:18, borderRadius:5, flexShrink:0, background:checked?'#58a6ff':'transparent', border:`2px solid ${checked?'var(--accent)':'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
        {checked && <CheckCircle2 size={11} style={{ color:'#fff' }}/>}
      </div>
      <span style={{ fontSize:'0.9375rem', color:'var(--text-secondary)' }}>{label}</span>
    </label>
  )
}

function PlanCard({ p, onEdit, onDelete, index }) {
  const accent = p.color || (p.isTrial ? '#facc15' : '#58a6ff')
  return (
    <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.06 }}
      style={{ background:'var(--bg-surface)', borderRadius:16, overflow:'hidden', border:`1px solid ${p.isActive?'var(--border)':'var(--border-soft)'}`, boxShadow:'var(--shadow-card)', opacity:p.isActive?1:.5, display:'flex', flexDirection:'column' }}>
      <div style={{ height:3, background:`linear-gradient(90deg, ${accent}, transparent)` }}/>
      <div style={{ padding:'1.5rem', flex:1, display:'flex', flexDirection:'column', gap:18 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {p.icon && (
              <div style={{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', background:`${accent}18`, border:`1px solid ${accent}30`, fontSize:'1.25rem', flexShrink:0 }}>
                {p.icon}
              </div>
            )}
            <div>
              <h3 style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-primary)' }}>{p.name}</h3>
              {!p.isActive && <span style={{ fontSize:'0.75rem', padding:'2px 8px', borderRadius:99, background:'rgba(148,163,184,.1)', color:'#94a3b8', border:'1px solid rgba(148,163,184,.2)' }}>Inactive</span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <ActionBtn label="Edit"   icon={Edit3}  onClick={() => onEdit(p)}   size="sm"/>
            <ActionBtn label="Delete" icon={Trash2} onClick={() => onDelete(p)} size="sm" danger/>
          </div>
        </div>
        <div>
          <p style={{ fontSize:'2rem', fontWeight:800, color:accent, letterSpacing:'-0.03em', lineHeight:1 }}>{p.isTrial?'Free':p.priceMonthly>0?`₹${p.priceMonthly}`:'Free'}</p>
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:4 }}>{p.isTrial?`${p.trialDays}-day trial`:p.priceMonthly>0?`/mo · ₹${p.priceYearly}/yr`:'Forever free'}</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {[{icon:Building2,label:'Orgs',value:p.maxBridges},{icon:Cpu,label:'Devices',value:p.maxDevices},{icon:Users,label:'Employees',value:p.maxEmployees>=99999?'∞':p.maxEmployees}].map(row => (
            <div key={row.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:7, fontSize:'0.875rem', color:'var(--text-muted)' }}><row.icon size={13}/>{row.label}</span>
              <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-secondary)', fontFamily:'monospace' }}>{row.value}</span>
            </div>
          ))}
        </div>
        {FEATURE_LIST.some(f => p.features?.[f.k]) && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, paddingTop:12, borderTop:'1px solid var(--border-soft)' }}>
            {FEATURE_LIST.filter(f => p.features?.[f.k]).map(f => (
              <span key={f.k} style={{ fontSize:'0.78rem', padding:'3px 9px', borderRadius:99, background:`${accent}15`, color:accent, border:`1px solid ${accent}28` }}>{f.l}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function AdminPlans() {
  const { ready } = useAuth()
  const { toast } = useToast()
  const [plans,   setPlans] = useState([])
  const [load,    setLoad]  = useState(true)
  const [modal,   setModal] = useState(false)
  const [editing, setEdit]  = useState(null)
  const [form,    setForm]  = useState(EMPTY)
  const [delT,    setDel]   = useState(null)
  const [busy,    setBusy]  = useState(false)

  async function doLoad() { setLoad(true); try { const r = await api.get('/admin/plans'); setPlans(r.data||[]) } catch(e){toast(e.message,'error')} finally{setLoad(false)} }
  useEffect(() => { if(ready) doLoad() }, [ready])

  function openCreate() { setEdit(null); setForm(EMPTY); setModal(true) }
  function openEdit(p)  { setEdit(p.planId); setForm({...EMPTY,...p,features:{...EMPTY.features,...p.features}}); setModal(true) }
  const sf   = (k,v) => setForm(f => ({...f,[k]:v}))
  const sfn  = k => e => sf(k, ['name','description','currency'].includes(k) ? e.target.value : Number(e.target.value))
  const sfft = k => setForm(f => ({...f, features:{...f.features,[k]:!f.features[k]}}))

  async function save() {
    if (!form.name) return toast('Plan name required','error')
    setBusy(true)
    try {
      if (editing) await api.patch(`/admin/plans/${editing}`, form)
      else         await api.post('/admin/plans', form)
      toast(editing?'Plan updated':'Plan created','success'); setModal(false); doLoad()
    } catch(e){toast(e.message,'error')} finally{setBusy(false)}
  }

  const active = plans.filter(p=>p.isActive).length
  const trial  = plans.filter(p=>p.isTrial).length

  return (
    <AdminPage>
      <PageHeader title="Subscription Plans" icon={CreditCard} iconColor="#34d399" subtitle={`${plans.length} plans · ${active} active · ${trial} trial`}>
        <Button variant="secondary" onClick={doLoad}><RefreshCw size={14}/></Button>
        <Button onClick={openCreate}><Plus size={15}/> New Plan</Button>
      </PageHeader>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
        {[
          { label:'Total Plans',   value:plans.length,                              accent:'#58a6ff', icon:CreditCard   },
          { label:'Active',        value:active,                                    accent:'#34d399', icon:CheckCircle2 },
          { label:'Inactive',      value:plans.length - active,                     accent:'#5a5a7a', icon:EyeOff       },
          { label:'Trial Plans',   value:trial,                                     accent:'#facc15', icon:Zap          },
          { label:'Paid Plans',    value:plans.filter(p=>p.priceMonthly>0).length,  accent:'#c084fc', icon:CreditCard   },
          { label:'Free Plans',    value:plans.filter(p=>!p.priceMonthly).length,   accent:'#34d399', icon:Users        },
        ].map((s,i) => <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.accent} index={i}/>)}
      </div>

      {load ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height:340, borderRadius:16 }} className="shimmer"/>)}
        </div>
      ) : plans.length === 0 ? (
        <div style={{ textAlign:'center', padding:'5rem 2rem', background:'rgba(15,15,26,.9)', borderRadius:20, border:'1px solid var(--border-soft)' }}>
          <CreditCard size={48} style={{ color:'var(--text-dim)', margin:'0 auto 16px' }}/>
          <p style={{ fontSize:'1.125rem', fontWeight:600, color:'var(--text-muted)', marginBottom:20 }}>No plans yet</p>
          <Button onClick={openCreate}><Plus size={15}/> Create First Plan</Button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16 }}>
          {plans.map((p,i) => <PlanCard key={p.planId} p={p} onEdit={openEdit} onDelete={setDel} index={i}/>)}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Plan' : 'New Plan'} size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ gridColumn:'1/-1' }}><Input label="Plan Name *" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="Starter"/></div>
          <div style={{ gridColumn:'1/-1' }}><Input label="Description" value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="Perfect for small businesses"/></div>

          {/* Icon picker */}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:8 }}>Plan Icon</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {ICON_PRESETS.map(em => (
                <button key={em} type="button" onClick={() => sf('icon',em)}
                  style={{ width:40, height:40, borderRadius:8, fontSize:'1.25rem', cursor:'pointer', border:`2px solid ${form.icon===em?'var(--accent)':'var(--border)'}`, background:form.icon===em?'var(--accent-muted)':'var(--bg-surface2)', transition:'all .15s' }}>
                  {em}
                </button>
              ))}
              <input value={form.icon||''} onChange={e=>sf('icon',e.target.value)} placeholder="✏️"
                style={{ width:60, padding:'8px', borderRadius:8, background:'var(--bg-input)', border:'1px solid var(--border)', color:'var(--text-primary)', fontSize:'1.125rem', textAlign:'center', outline:'none' }}/>
            </div>
          </div>

          {/* Color picker */}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:8 }}>Accent Color</label>
            <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
              {COLOR_PRESETS.map(col => (
                <button key={col} type="button" onClick={() => sf('color',col)}
                  style={{ width:30, height:30, borderRadius:'50%', cursor:'pointer', background:col, border:`3px solid ${form.color===col?'var(--bg-base)':'transparent'}`, transition:'border .15s' }}/>
              ))}
              <input type="color" value={form.color||'#58a6ff'} onChange={e=>sf('color',e.target.value)}
                style={{ width:30, height:30, borderRadius:'50%', border:'2px solid var(--border)', padding:0, cursor:'pointer', background:'transparent' }}/>
              <span style={{ fontSize:'0.875rem', fontFamily:'monospace', color:'var(--text-muted)' }}>{form.color}</span>
            </div>
          </div>

          <Input label="Monthly Price (₹)" type="number" value={form.priceMonthly} onChange={sfn('priceMonthly')}/>
          <Input label="Yearly Price (₹)"  type="number" value={form.priceYearly}  onChange={sfn('priceYearly')}/>
          <Input label="Max Orgs"          type="number" value={form.maxBridges}   onChange={sfn('maxBridges')}/>
          <Input label="Max Devices"       type="number" value={form.maxDevices}   onChange={sfn('maxDevices')}/>
          <Input label="Max Employees"     type="number" value={form.maxEmployees} onChange={sfn('maxEmployees')}/>
          <Input label="Retention Days"    type="number" value={form.retentionDays}onChange={sfn('retentionDays')}/>
          <Input label="Trial Days"        type="number" value={form.trialDays}    onChange={sfn('trialDays')}/>

          <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:10, paddingTop:12, borderTop:'1px solid var(--border)' }}>
            <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Plan Flags</p>
            <CheckBox checked={form.isTrial}  onChange={()=>sf('isTrial',!form.isTrial)}   label="This is a free trial plan"/>
            <CheckBox checked={form.isActive} onChange={()=>sf('isActive',!form.isActive)} label="Visible and assignable to users"/>
          </div>
          <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:10, paddingTop:12, borderTop:'1px solid var(--border)' }}>
            <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Included Features</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {FEATURE_LIST.map(f => <CheckBox key={f.k} checked={form.features[f.k]} onChange={()=>sfft(f.k)} label={f.l}/>)}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <Button variant="secondary" onClick={()=>setModal(false)}>Cancel</Button>
          <Button onClick={save} loading={busy}>{editing?'Update Plan':'Create Plan'}</Button>
        </div>
      </Modal>

      <ConfirmModal open={!!delT} onClose={()=>setDel(null)} danger title="Delete Plan"
        message={`Delete "${delT?.name}"? Will fail if the plan has active subscribers.`} loading={busy}
        onConfirm={async()=>{ setBusy(true); try{ await api.delete(`/admin/plans/${delT.planId}`); toast('Plan deleted','success'); setDel(null); doLoad() }catch(e){toast(e.message,'error')}finally{setBusy(false)} }}/>
    </AdminPage>
  )
}