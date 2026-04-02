import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
const C = {
  lime:   'text-accent     bg-accent/10     border-accent/20',
  green:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  blue:   'text-accent     bg-accent/10     border-accent/20',
  red:    'text-red-400    bg-red-400/10    border-red-400/20',
  orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  gray:   'badge-gray',
}
export function StatCard({ label, value, sub, icon:Icon, color='blue', index=0 }) {
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.07 }} className="card p-5 flex flex-col gap-3">
      <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center', C[color]||C.blue)}><Icon size={18}/></div>
      <div>
        <p style={{ fontSize:"1.5rem", fontWeight:800, color:"var(--text-primary)", lineHeight:1 }}>{value}</p>
        <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", fontFamily:"monospace", marginTop:4 }}>{label}</p>
        {sub && <p style={{ fontSize:"0.75rem", color:"var(--text-dim)", fontFamily:"monospace", marginTop:2 }}>{sub}</p>}
      </div>
    </motion.div>
  )
}
