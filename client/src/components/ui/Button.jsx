import { cn } from '../../lib/utils'
import { Spinner } from './Spinner'

export function Button({ children, variant = 'primary', size, loading, className, disabled, ...props }) {
  const base = { primary:'btn-primary', secondary:'btn-secondary', ghost:'btn-ghost', danger:'btn-danger' }[variant]
  const sz   = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'text-base px-6 py-3' : ''
  return (
    <button className={cn(base, sz, className)} disabled={loading || disabled} {...props}>
      {loading && <Spinner className="w-3.5 h-3.5" />}
      {children}
    </button>
  )
}
