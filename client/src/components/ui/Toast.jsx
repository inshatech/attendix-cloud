import { create } from 'zustand'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

let uid = 0
export const useToast = create(set => ({
  items: [],
  toast: (msg, type='info', ms=4000) => {
    const id = ++uid
    set(s => ({ items: [...s.items, { id, msg, type }] }))
    setTimeout(() => set(s => ({ items: s.items.filter(t => t.id !== id) })), ms)
  },
  dismiss: id => set(s => ({ items: s.items.filter(t => t.id !== id) })),
}))

const ICON  = { success:<CheckCircle2 size={15}/>, error:<XCircle size={15}/>, warning:<AlertTriangle size={15}/>, info:<Info size={15}/> }
const COLOR = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  error:   'border-red-400/30 bg-red-500/10 text-red-300',
  warning: 'border-orange-400/30 bg-orange-500/10 text-orange-300',
  info:    'border-blue-400/30 bg-blue-500/10 text-blue-300',
}
const COLOR_LIGHT = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error:   'border-red-200 bg-red-50 text-red-700',
  warning: 'border-orange-200 bg-orange-50 text-orange-700',
  info:    'border-blue-200 bg-blue-50 text-blue-700',
}

export function Toaster() {
  const { items, dismiss } = useToast()
  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
  const palette = isLight ? COLOR_LIGHT : COLOR

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 w-80">
      <AnimatePresence>
        {items.map(t => (
          <motion.div key={t.id}
            initial={{ opacity:0, x:40, scale:.95 }} animate={{ opacity:1, x:0, scale:1 }} exit={{ opacity:0, x:40 }}
            className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-sm font-medium shadow-lg ${palette[t.type]}`}
          >
            <span className="mt-0.5 flex-shrink-0">{ICON[t.type]}</span>
            <span className="flex-1 leading-snug">{t.msg}</span>
            <button onClick={() => dismiss(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100"><X size={13}/></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
