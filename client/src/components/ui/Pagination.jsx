/**
 * Pagination
 * Props:
 *   page      – current page (1-based)
 *   pages     – total page count
 *   onPage    – fn(newPage)
 *   total     – total record count
 *   limit     – current page size
 *   onLimit   – fn(newLimit) — renders per-page selector when provided
 */

const PER_PAGE_OPTIONS = [5, 10, 25, 50, 100]

export default function Pagination({ page, pages, onPage, total, limit, onLimit }) {
  if (!pages || pages < 1) return null

  function buildNums() {
    const set = new Set([1, pages])
    for (let i = Math.max(1, page - 1); i <= Math.min(pages, page + 1); i++) set.add(i)
    const sorted = [...set].sort((a, b) => a - b)
    const out = []
    let prev = null
    for (const n of sorted) {
      if (prev !== null && n - prev > 1) out.push('…')
      out.push(n)
      prev = n
    }
    return out
  }

  const nums = buildNums()
  const from = total != null && limit != null ? (page - 1) * limit + 1 : null
  const to   = total != null && limit != null ? Math.min(page * limit, total) : null

  /* ── shared button styles ── */
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: 32, minWidth: 32, padding: '0 8px',
    borderRadius: 8, border: '1px solid var(--border)',
    fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600,
    cursor: 'pointer', transition: 'all .15s', outline: 'none',
    appearance: 'none', userSelect: 'none',
  }
  const idle     = { ...base, background: 'var(--bg-surface2)', color: 'var(--text-muted)' }
  const active   = { ...base, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', cursor: 'default' }
  const disabled = { ...base, background: 'transparent', color: 'var(--border)', cursor: 'not-allowed', opacity: 0.45 }

  function hoverOn(e, style)  { Object.assign(e.currentTarget.style, style) }
  function hoverOff(e, style) { Object.assign(e.currentTarget.style, style) }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 4, flexWrap: 'wrap', padding: '6px 0',
    }}>

      {/* ── Per-page selector ── */}
      {onLimit && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginRight: 8, paddingRight: 12,
          borderRight: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            Rows
          </span>
          <select
            value={limit}
            onChange={e => onLimit(Number(e.target.value))}
            style={{
              height: 32, padding: '0 28px 0 10px',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-surface2)', color: 'var(--text-secondary)',
              fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600,
              cursor: 'pointer', outline: 'none', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
            }}>
            {PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Prev ── */}
      <button type="button"
        style={page === 1 ? disabled : idle}
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        onMouseOver={e => { if (page !== 1) hoverOn(e,  { borderColor:'var(--accent)', color:'var(--accent)' }) }}
        onMouseOut={e =>  { if (page !== 1) hoverOff(e, { borderColor:'var(--border)', color:'var(--text-muted)' }) }}>
        ←
      </button>

      {/* ── Page numbers ── */}
      {nums.map((n, i) =>
        n === '…'
          ? <span key={`e${i}`} style={{ color:'var(--text-dim)', fontSize:'0.8125rem', fontFamily:'monospace', padding:'0 2px' }}>…</span>
          : (
            <button type="button" key={n}
              style={n === page ? active : idle}
              disabled={n === page}
              onClick={() => onPage(n)}
              onMouseOver={e => { if (n !== page) hoverOn(e,  { borderColor:'var(--accent)', color:'var(--accent)' }) }}
              onMouseOut={e =>  { if (n !== page) hoverOff(e, { borderColor:'var(--border)', color:'var(--text-muted)' }) }}>
              {n}
            </button>
          )
      )}

      {/* ── Next ── */}
      <button type="button"
        style={page >= pages ? disabled : idle}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        onMouseOver={e => { if (page < pages) hoverOn(e,  { borderColor:'var(--accent)', color:'var(--accent)' }) }}
        onMouseOut={e =>  { if (page < pages) hoverOff(e, { borderColor:'var(--border)', color:'var(--text-muted)' }) }}>
        →
      </button>

      {/* ── Record count ── */}
      {from != null && total > 0 && (
        <span style={{
          fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace',
          marginLeft: 8, paddingLeft: 12, borderLeft: '1px solid var(--border)',
          whiteSpace: 'nowrap',
        }}>
          {from}–{to} of {total}
        </span>
      )}
    </div>
  )
}
