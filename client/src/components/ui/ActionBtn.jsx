import { useState } from 'react'

/**
 * ActionBtn — labelled button with icon, used for all admin page actions.
 * Consistent hover effect, border, and color scheme across all admin pages.
 */
export function ActionBtn({ label, icon: Icon, onClick, color = '#8080a8', hoverColor, danger, disabled, size = 'md' }) {
  const [hover, setHover] = useState(false)
  const hc = danger ? '#f87171' : (hoverColor || 'var(--accent)')
  const borderHover = danger ? 'rgba(248,113,113,.3)' : 'var(--accent-border)'
  const bgHover     = danger ? 'rgba(248,113,113,.08)' : 'var(--accent-muted)'
  const iconSize    = size === 'sm' ? 12 : 14

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: size === 'sm' ? '4px 10px' : '6px 12px',
        borderRadius: 8,
        border: `1px solid ${hover ? borderHover : 'var(--border)'}`,
        background: hover ? bgHover : 'transparent',
        color: hover ? hc : (color || 'var(--text-muted)'),
        fontSize: size === 'sm' ? '0.8125rem' : '0.875rem',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all .15s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {Icon && <Icon size={iconSize} style={{ flexShrink: 0 }}/>}
      {label}
    </button>
  )
}
