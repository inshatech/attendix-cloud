import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, X } from 'lucide-react'

// ── All abbreviations used across the Attendance module ───────────────────────
const SECTIONS = [
  {
    title: 'Attendance Status',
    items: [
      { abbr:'P',   color:'#34d399', label:'Present',             desc:'Employee arrived on time and worked full day'                     },
      { abbr:'L',   color:'#fb923c', label:'Late',                desc:'Arrived after shift start + grace period; counted as paid day'   },
      { abbr:'L*',  color:'#fbbf24', label:'Late (Pardoned)',      desc:'Late but within monthly allowance; counted as Present for pay'   },
      { abbr:'H',   color:'#facc15', label:'Half Day',            desc:'Worked less than half-day threshold or scheduled half-day'       },
      { abbr:'A',   color:'#f87171', label:'Absent',              desc:'No punch recorded; full-day Loss of Pay (LOP)'                  },
      { abbr:'A½',  color:'#fca5a5', label:'Absent (Half-Day)',   desc:'Absent on a scheduled half-day weekday; 0.5 LOP deducted'       },
      { abbr:'WO',  color:'#8080a8', label:'Week Off',            desc:'Scheduled weekly off (e.g. Sunday); no deduction'               },
      { abbr:'PL',  color:'#60a5fa', label:'Paid Leave',          desc:'Sick leave / comp-off / paid leave; no salary deduction'        },
      { abbr:'Lv',  color:'#60a5fa', label:'On Leave',            desc:'Unpaid / approved leave'                                        },
      { abbr:'Hol', color:'#f472b6', label:'Holiday',             desc:'Public or organisation holiday; no deduction'                   },
    ],
  },
  {
    title: 'Punch Types',
    items: [
      { abbr:'IN',   color:'#34d399', label:'Check-In',     desc:'First punch of the day — arrival'            },
      { abbr:'OUT',  color:'#f87171', label:'Check-Out',    desc:'Last punch of the day — departure'           },
      { abbr:'BRK↑', color:'#fb923c', label:'Break Start',  desc:'Employee started a break period'             },
      { abbr:'BRK↓', color:'#60a5fa', label:'Break End',    desc:'Employee resumed work after break'           },
      { abbr:'OT↑',  color:'#c084fc', label:'Overtime In',  desc:'Started overtime work beyond shift end'      },
      { abbr:'OT↓',  color:'#f472b6', label:'Overtime Out', desc:'Ended overtime work'                        },
    ],
  },
  {
    title: 'Payroll',
    items: [
      { abbr:'Gross',   color:'var(--text-primary)', label:'Gross Pay',          desc:'Salary after LOP deduction, before statutory deductions'      },
      { abbr:'OT',      color:'#c084fc',             label:'Overtime',           desc:'Extra pay for hours beyond shift duration (default 1.5×)'     },
      { abbr:'PF',      color:'#fb923c',             label:'Provident Fund',     desc:'12% of basic (capped ₹15,000); deducted only if PF enrolled'  },
      { abbr:'ESI',     color:'#60a5fa',             label:'ESI',                desc:'0.75% employee share; only if salary ≤ ₹21,000/month'         },
      { abbr:'PT',      color:'#a78bfa',             label:'Professional Tax',   desc:'₹200/month (pro-rated); state levy on salary earners'          },
      { abbr:'LOP',     color:'#f87171',             label:'Loss of Pay',        desc:'Days absent × daily rate (salary ÷ 26) deducted from gross'   },
      { abbr:'Net',     color:'#34d399',             label:'Net Pay',            desc:'Gross + OT − PF − ESI − PT = actual salary transferred'       },
      { abbr:'Eff',     color:'#34d399',             label:'Effective Days',     desc:'P + L + L* + 0.5×H + Holiday + Week Off + Paid Leave'         },
    ],
  },
  {
    title: 'Shift Rules',
    items: [
      { abbr:'Grace',   color:'#fb923c', label:'Grace Period',        desc:'Minutes after shift start before marking Late'          },
      { abbr:'HDAfter', color:'#facc15', label:'Half-Day After',      desc:'Late-by minutes after which employee is marked Half-Day' },
      { abbr:'MinP',    color:'#34d399', label:'Min for Present',     desc:'Minimum worked minutes to count as Present'             },
      { abbr:'MinFD',   color:'#60a5fa', label:'Min for Full Day',    desc:'Minimum worked minutes to count as a Full Day'          },
      { abbr:'LA/mo',   color:'#fbbf24', label:'Late Allowance/month',desc:'N late arrivals per month pardoned (counted as Present)' },
    ],
  },
]

// ── Trigger button ─────────────────────────────────────────────────────────────
export function AbbrLegendButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Abbreviation guide"
        style={{
          width:30, height:30, borderRadius:8, border:'1px solid var(--border)',
          background:'var(--bg-surface2)', cursor:'pointer', display:'flex',
          alignItems:'center', justifyContent:'center', color:'var(--text-muted)',
          transition:'all .15s', flexShrink:0,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)' }}>
        <HelpCircle size={14}/>
      </button>

      <AnimatePresence>
        {open && <AbbrLegendModal onClose={() => setOpen(false)}/>}
      </AnimatePresence>
    </>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function AbbrLegendModal({ onClose }) {
  return (
    <motion.div
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:9000,
        background:'rgba(0,0,0,.55)', backdropFilter:'blur(3px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:'16px',
      }}>
      <motion.div
        initial={{ opacity:0, scale:.96, y:12 }}
        animate={{ opacity:1, scale:1, y:0 }}
        exit={{ opacity:0, scale:.96, y:12 }}
        transition={{ duration:.18 }}
        onClick={e => e.stopPropagation()}
        style={{
          background:'var(--bg-surface)', border:'1px solid var(--border)',
          borderRadius:18, width:'100%', maxWidth:720,
          maxHeight:'85vh', display:'flex', flexDirection:'column',
          boxShadow:'0 24px 60px rgba(0,0,0,.5)',
        }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(88,166,255,.12)',
              border:'1px solid rgba(88,166,255,.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <HelpCircle size={15} style={{ color:'#58a6ff' }}/>
            </div>
            <div>
              <p style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text-primary)' }}>Abbreviation Guide</p>
              <p style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>All symbols and codes used across Attendance & Payroll</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg-surface2)',
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
            <X size={13}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:20 }}>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <p style={{ fontSize:'0.68rem', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.09em', color:'var(--text-dim)', marginBottom:8 }}>{section.title}</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:5 }}>
                {section.items.map(item => (
                  <div key={item.abbr} style={{
                    display:'flex', alignItems:'flex-start', gap:10, padding:'7px 10px',
                    borderRadius:9, background:'var(--bg-surface2)', border:'1px solid var(--border-soft)',
                  }}>
                    <span style={{
                      minWidth:38, textAlign:'center', fontSize:'0.75rem', fontFamily:'monospace', fontWeight:800,
                      color:item.color, padding:'2px 6px', borderRadius:5, flexShrink:0,
                      background:`color-mix(in srgb,${item.color} 12%,transparent)`,
                      border:`1px solid color-mix(in srgb,${item.color} 22%,transparent)`,
                    }}>{item.abbr}</span>
                    <div style={{ minWidth:0 }}>
                      <p style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-primary)', lineHeight:1.3 }}>{item.label}</p>
                      <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', lineHeight:1.4, marginTop:2 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Footer note */}
          <div style={{ padding:'10px 14px', borderRadius:9, background:'rgba(88,166,255,.05)', border:'1px solid rgba(88,166,255,.15)' }}>
            <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', lineHeight:1.5 }}>
              <strong style={{ color:'#58a6ff' }}>Payroll formula:</strong>
              &nbsp; Net Pay = (Salary − LOP) + OT − PF − ESI − PT &nbsp;|&nbsp;
              Daily Rate = Monthly Salary ÷ 26 &nbsp;|&nbsp;
              Half-day weekday absence = 0.5 LOP &nbsp;|&nbsp;
              L* pardoned lates count as Present for pay purposes
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Standalone legend for export files ───────────────────────────────────────
// Returns AOA (array-of-arrays) for Excel abbreviation key sheet
export function buildAbbrKeySheet() {
  const rows = [
    ['ABBREVIATION GUIDE — Attendance & Payroll Report'],
    [],
    ['Abbr', 'Full Name', 'Category', 'Description'],
  ]
  SECTIONS.forEach(s => {
    s.items.forEach(item => {
      rows.push([item.abbr, item.label, s.title, item.desc])
    })
    rows.push([]) // blank row between sections
  })
  rows.push([])
  rows.push(['Formula', 'Net Pay = (Salary − LOP) + OT − PF − ESI − PT'])
  rows.push(['Formula', 'Daily Rate = Monthly Salary ÷ 26 working days'])
  rows.push(['Formula', 'LOP Days = Absent(full) × 1.0 + Absent(half-day weekday) × 0.5 + Unpaid Leave'])
  rows.push(['Formula', 'Effective Days = P + L + L* + 0.5×H + Holiday + Week Off + Paid Leave'])
  return rows
}
