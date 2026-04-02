import { cn } from '../../lib/utils'

const V = {
  green: 'badge-green', lime: 'badge-lime', red: 'badge-red',
  blue: 'badge-blue', orange: 'badge-orange', gray: 'badge-gray', yellow: 'badge-yellow',
}

export function Badge({ children, variant = 'gray', dot, className }) {
  const dotColor = {
    green:'bg-emerald-400', lime:'bg-lime-400', red:'bg-red-400',
    blue:'bg-blue-400', orange:'bg-orange-400', gray:'bg-slate-400', yellow:'bg-yellow-400',
  }
  return (
    <span className={cn('badge', V[variant], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColor[variant])} />}
      {children}
    </span>
  )
}
