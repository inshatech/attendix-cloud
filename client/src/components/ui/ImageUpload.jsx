import { useRef, useState } from 'react'
import { Upload, X, Camera, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export function ImageUpload({ value, onChange, onRemove, shape='rect', placeholder='Click or drag to upload', loading=false, accept='image/jpeg,image/png,image/webp', maxKB=5000, hint, className }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [err,  setErr]  = useState('')

  function read(file) {
    setErr('')
    if (!file.type.startsWith('image/')) { setErr('Please select an image file.'); return }
    if (file.size > maxKB * 1024) { setErr(`File too large. Max ${maxKB}KB.`); return }
    const r = new FileReader()
    r.onload = e => onChange?.(e.target.result)
    r.readAsDataURL(file)
  }

  const isCircle = shape === 'circle'
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.[0]) read(e.dataTransfer.files[0]) }}
        style={{ background:'var(--bg-surface2)', borderColor: drag ? '#a3e635' : 'var(--border-bright)' }}
        className={cn(
          'relative overflow-hidden cursor-pointer transition-all duration-200 group border-2 border-dashed hover:border-lime-400/50',
          isCircle ? 'rounded-full w-24 h-24 mx-auto' : 'rounded-xl w-full h-36',
          drag && 'scale-[1.01]',
          loading && 'cursor-not-allowed opacity-70',
        )}
      >
        {value ? (
          <>
            <img src={value} alt="preview" className={cn('w-full h-full object-cover', isCircle ? 'rounded-full' : 'rounded-xl')}/>
            <div className={cn('absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col gap-1', isCircle?'rounded-full':'rounded-xl')}>
              <Camera size={16} className="text-white"/><span className="text-white text-xs font-medium">Change</span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
            {loading ? <Loader2 size={22} style={{ color:"var(--accent)" }} className="animate-spin"/> : <Upload size={22} style={{ color:"var(--text-muted)" }} className="group-hover:text-lime-400 transition-colors"/>}
            {!isCircle && !loading && <p style={{ color:"var(--text-muted)" }} className="text-xs text-center leading-snug">{placeholder}</p>}
          </div>
        )}
        {loading && <div className={cn('absolute inset-0 bg-black/60 flex items-center justify-center', isCircle?'rounded-full':'rounded-xl')}><Loader2 size={20} className="text-lime-400 animate-spin"/></div>}
        <input ref={inputRef} type="file" accept={accept} onChange={e => { if(e.target.files?.[0]) read(e.target.files[0]) }} className="hidden" disabled={loading}/>
      </div>
      <div className="flex items-center justify-center gap-3">
        {value && onRemove && (
          <button onClick={e => { e.stopPropagation(); onRemove() }} disabled={loading}
            className="text-xs text-red-400 hover:text-red-300 font-mono flex items-center gap-1 transition-colors disabled:opacity-50">
            <X size={11}/> Remove
          </button>
        )}
      </div>
      {hint  && <p style={{ fontSize:"0.625rem", color:"var(--text-dim)", fontFamily:"monospace", textAlign:"center" }}>{hint}</p>}
      {err   && <p className="text-xs text-red-400 font-mono text-center">{err}</p>}
    </div>
  )
}
