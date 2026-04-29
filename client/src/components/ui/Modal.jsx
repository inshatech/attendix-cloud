import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const maxWMap = { sm:'max-w-sm', md:'max-w-md', lg:'max-w-lg', xl:'max-w-2xl' }

export function Modal({ open, onClose, title, description, children, size='md', noBodyPad=false, noScroll=false }) {
  const maxW = maxWMap[size] || maxWMap.md

  return createPortal(
    <AnimatePresence>
      {open && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          {/* Backdrop — pure inline styles so nothing can override */}
          <motion.div
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            transition={{ duration:0.18 }}
            onClick={onClose}
            style={{
              position:'absolute', inset:0,
              background:'rgba(0,0,0,.72)',
              backdropFilter:'blur(6px)',
              WebkitBackdropFilter:'blur(6px)',
            }}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity:0, scale:.96, y:14 }}
            animate={{ opacity:1, scale:1, y:0 }}
            exit={{ opacity:0, scale:.96, y:8 }}
            transition={{ type:'spring', stiffness:360, damping:30 }}
            className={cn('relative w-full rounded-2xl flex flex-col max-h-[90vh]', noBodyPad ? 'overflow-hidden' : noScroll ? 'p-6 gap-5 overflow-hidden' : 'p-6 gap-5 overflow-y-auto', maxW)}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: '0 32px 80px rgba(0,0,0,.5)',
              isolation: 'isolate',
              ...(noScroll && { height: '90vh' }),
            }}>
            {title !== null && title !== undefined ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 style={{ fontSize:'1.125rem', fontWeight:800, color:'var(--text-primary)' }}>{title}</h2>
                  {description && <p style={{ fontSize:'0.8125rem', fontFamily:'monospace', marginTop:4, color:'var(--text-muted)' }}>{description}</p>}
                </div>
                <button onClick={onClose} className="btn-icon flex-shrink-0"><X size={16}/></button>
              </div>
            ) : (
              <button onClick={onClose} className="btn-icon absolute top-4 right-4 z-10"><X size={16}/></button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
