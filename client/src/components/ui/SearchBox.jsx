import { X } from 'lucide-react'

/**
 * Project-wide unified search input.
 * Used on all pages — admin and user — for a consistent look.
 * Props:
 *   value       — controlled input value
 *   onChange    — standard input onChange handler
 *   onClear     — optional: called when × is clicked (defaults to onChange with empty value)
 *   placeholder — input placeholder text
 *   style       — extra styles for the wrapper div
 *   className   — extra className for the wrapper div
 */
export function SearchBox({ value, onChange, onClear, placeholder, style, className }) {
  const handleClear = onClear || (() => onChange({ target: { value: '' } }))
  return (
    <div style={{ position:'relative', flex:1, minWidth:180, ...style }} className={className}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="var(--text-muted)" strokeWidth="2"
        style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Search…'}
        style={{
          width:'100%',
          paddingLeft: 36,
          paddingRight: value ? 32 : 12,
          paddingTop: '0.65rem',
          paddingBottom: '0.65rem',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          color: 'var(--text-primary)',
          fontSize: '0.9375rem',
          outline: 'none',
          transition: 'border-color .15s',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e  => e.target.style.borderColor = 'var(--border)'}
      />
      {value && (
        <button type="button" onClick={handleClear}
          style={{
            position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', cursor:'pointer', padding:2,
            color:'var(--text-dim)', display:'flex', alignItems:'center',
          }}>
          <X size={13}/>
        </button>
      )}
    </div>
  )
}
