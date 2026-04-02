export function Empty({ icon:Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      {Icon && <Icon size={48} style={{ color:"var(--text-dim)" }}/>}
      <div>
        <p style={{ fontSize:"1.125rem", fontWeight:600, color:"var(--text-muted)" }}>{title}</p>
        {description && <p style={{ fontSize:"0.875rem", color:"var(--text-muted)", marginTop:4, maxWidth:288, marginLeft:"auto", marginRight:"auto", textAlign:"center" }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}
