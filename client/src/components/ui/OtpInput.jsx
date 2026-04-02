import { useRef, useEffect } from 'react'

export function OtpInput({ value = '', onChange, length = 6, autoFocus = true }) {
  const inputs = useRef([])
  const digits  = Array.from({ length }, (_, i) => value[i] || '')

  // Auto-focus first empty input on mount
  useEffect(() => {
    if (!autoFocus) return
    const first = inputs.current[0]
    if (first) setTimeout(() => first.focus(), 80)
  }, [])

  function handle(i, e) {
    const raw = e.target.value.replace(/\D/g, '')
    // Handle multi-char input (paste via input event on mobile)
    if (raw.length > 1) {
      const filled = raw.slice(0, length)
      onChange(filled)
      const next = Math.min(filled.length, length - 1)
      inputs.current[next]?.focus()
      return
    }
    const v = raw.slice(-1)
    const next = [...digits]; next[i] = v
    onChange(next.join(''))
    if (v && i < length - 1) inputs.current[i + 1]?.focus()
  }

  function handleKey(i, e) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits]; next[i] = ''
        onChange(next.join(''))
      } else if (i > 0) {
        inputs.current[i - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft'  && i > 0)          inputs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < length - 1) inputs.current[i + 1]?.focus()
  }

  function handlePaste(e) {
    e.preventDefault()
    const str = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!str) return
    onChange(str.padEnd(length, '').slice(0, length).trimEnd())
    const focus = Math.min(str.length, length - 1)
    inputs.current[focus]?.focus()
    // Fire onChange with exact paste content
    onChange(str)
  }

  function handleFocus(e) {
    e.target.select()
  }

  return (
    <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          maxLength={1}
          inputMode="numeric"
          pattern="[0-9]*"
          value={digits[i]}
          onChange={e => handle(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={handleFocus}
          style={{
            width: 48, height: 56,
            textAlign: 'center',
            fontSize: '1.375rem',
            fontWeight: 800,
            fontFamily: 'monospace',
            background: 'var(--bg-input)',
            border: `2px solid ${digits[i] ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12,
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'all .15s',
            caretColor: 'transparent',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-muted)'; e.target.select() }}
          onBlur={e => { e.target.style.borderColor = digits[i] ? 'var(--accent)' : 'var(--border)'; e.target.style.boxShadow = 'none' }}
        />
      ))}
    </div>
  )
}
