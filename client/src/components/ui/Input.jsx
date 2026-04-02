import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
export const Input = forwardRef(function Input({ label, error, icon: Icon, className, ...p }, ref) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="field-label">{label}</label>}
      <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:"var(--text-muted)" }}/>}
        <input ref={ref} className={cn('field-input', Icon && 'pl-10', error && 'border-red-500', className)} {...p}/>
      </div>
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
    </div>
  )
})
