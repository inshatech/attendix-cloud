import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Fingerprint, LayoutDashboard, Building2, CreditCard, Wifi,
  Plug, Users, LogOut, User, Clock, UserCheck, Sun, Moon,
  CalendarCheck, CalendarDays, Shield, Ticket, Headphones, Receipt, Tag, PieChart, Info,
  Heart, X,
} from 'lucide-react'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'
import { useAuth } from '../../store/auth'
import { useTheme } from '../../store/theme'
import { useNotifications } from '../../store/notifications'
import { useBrand } from '../../store/brand'
import { useSidebar } from '../../store/sidebar'
import { cn } from '../../lib/utils'

function NBadge({ count }) {
  if (!count || count === 0) return null
  return (
    <span style={{
      marginLeft: 'auto', flexShrink: 0,
      minWidth: 20, height: 20, padding: '0 5px',
      borderRadius: 9999, background: '#f87171', color: '#fff',
      fontSize: 11, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavItem({ to, icon: Icon, label, end = false, badge }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cn('nav-link', isActive && 'active')}>
      {({ isActive }) => (
        <>
          <Icon size={17} style={{ color: isActive ? '#58a6ff' : '#4a4a78', flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {badge ? <NBadge count={badge} /> : isActive && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#58a6ff', flexShrink: 0 }} />
          )}
        </>
      )}
    </NavLink>
  )
}

function Brand({ icon: Icon, accent }) {
  const { logoUrl, appName, tagline, version, load } = useBrand()
  const { close } = useSidebar()
  useEffect(() => { load() }, [])
  const ver = version || APP_VERSION
  return (
    <div style={{ padding: '1rem 1.125rem', borderBottom: '1px solid var(--border)', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Logo */}
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}18`, border: `1px solid ${accent}35`,
          boxShadow: `0 0 14px ${accent}25`, overflow: 'hidden',
        }}>
          {logoUrl
            ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Icon size={18} style={{ color: accent }} />}
        </div>
        {/* Name + tagline + version */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {appName}
            </p>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace',
              color: accent, background: `${accent}15`, border: `1px solid ${accent}30`,
              borderRadius: 4, padding: '1px 5px', flexShrink: 0, lineHeight: '1.6',
            }}>v{ver}</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tagline}
          </p>
        </div>
      </div>
      {/* Close button — mobile only */}
      <button
        onClick={close}
        className="md:hidden"
        style={{
          position: 'absolute', top: '50%', right: '1rem', transform: 'translateY(-50%)',
          background: 'var(--bg-surface2)', border: '1px solid var(--border)',
          borderRadius: 8, width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-muted)',
        }}
      >
        <X size={15} />
      </button>
    </div>
  )
}

function Footer({ user, logout, roleLabel, accent }) {
  const { theme, toggle } = useTheme()
  const { companyName } = useBrand()
  const isLight = theme === 'light'
  return (
    <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
      {/* Theme toggle */}
      <button onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '0.25rem', transition: 'background .15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isLight ? 'rgba(251,191,36,.15)' : 'rgba(88,166,255,.12)',
          border: isLight ? '1.5px solid rgba(251,191,36,.3)' : '1.5px solid rgba(88,166,255,.25)'
        }}>
          {isLight
            ? <Sun size={14} style={{ color: '#d97706' }} />
            : <Moon size={14} style={{ color: '#58a6ff' }} />}
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{isLight ? 'Day Mode' : 'Night Mode'}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 1 }}>Switch to {isLight ? 'night' : 'day'}</p>
        </div>
        <div style={{
          width: 36, height: 20, borderRadius: 99, padding: 2, transition: 'all .25s',
          background: isLight ? '#d97706' : '#58a6ff', display: 'flex', alignItems: 'center',
          justifyContent: isLight ? 'flex-end' : 'flex-start'
        }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
        </div>
      </button>
      {/* User / logout */}
      <button onClick={logout}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background .15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          border: `1.5px solid ${accent}50`, background: `${accent}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '0.875rem', fontWeight: 700, color: accent }}>{(user?.name || 'U')[0].toUpperCase()}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
          <p style={{ fontSize: '0.75rem', color: `${accent}90`, textTransform: 'capitalize', marginTop: 1 }}>{roleLabel}</p>
        </div>
        <LogOut size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
      </button>
      <>
        <hr style={{ margin: '0.75rem 0', border: 'none', height: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Heart size={10} style={{ color: '#58a6ff', fill: '#58a6ff' }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Powered by: {' '}
            <Link to="https://www.inshatech.com" style={{ color: 'var(--text-primary)' }} target="_blank" rel="noopener noreferrer">
              <strong style={{ color: 'var(--text-secondary)' }}>{companyName || 'Insha Technologies'}</strong>
            </Link>
          </p>
        </div>
      </>
    </div>
  )
}

// ── Sidebar content (no <aside> wrapper — handled by Sidebar export) ──────────

function AdminSidebarContent({ user, logout }) {
  const { openTickets, newUsers, newPayments, start, stop } = useNotifications()
  useEffect(() => { start('admin'); return () => stop() }, [])
  return (
    <>
      <Brand icon={Shield} accent="#c084fc" />
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="section-label">Overview</span>
        <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" end />
        <NavItem to="/admin/profile" icon={User} label="My Profile" />
        <span className="section-label" style={{ marginTop: '0.75rem' }}>Platform</span>
        <NavItem to="/admin/organizations" icon={Building2} label="Organizations" badge={newUsers > 0 ? newUsers : 0} />
        <NavItem to="/admin/users" icon={Users} label="Users" badge={newUsers} />
        <NavItem to="/admin/plans" icon={CreditCard} label="Plans" />
        <NavItem to="/admin/subscriptions" icon={Receipt} label="Subscriptions" badge={newPayments > 0 ? newPayments : 0} />
        <NavItem to="/admin/coupons" icon={Tag} label="Coupons" />
        <NavItem to="/admin/plugins" icon={Plug} label="Plugins" />
        <span className="section-label" style={{ marginTop: '0.75rem' }}>Support</span>
        <NavItem to="/admin/tickets" icon={Ticket} label="Tickets" badge={openTickets} />
      </nav>
      <Footer user={user} logout={logout} roleLabel="Administrator" accent="#c084fc" />
    </>
  )
}

function SupportSidebarContent({ user, logout }) {
  const { openTickets, start, stop } = useNotifications()
  useEffect(() => { start('support'); return () => stop() }, [])
  return (
    <>
      <Brand icon={Headphones} accent="#22d3ee" />
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="section-label">Overview</span>
        <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" end />
        <NavItem to="/admin/profile" icon={User} label="My Profile" />
        <span className="section-label" style={{ marginTop: '0.75rem' }}>Platform</span>
        <NavItem to="/admin/organizations" icon={Building2} label="Organizations" />
        <NavItem to="/admin/tickets" icon={Ticket} label="Tickets" badge={openTickets} />
      </nav>
      <Footer user={user} logout={logout} roleLabel="Support Agent" accent="#22d3ee" />
    </>
  )
}

function UserSidebarContent({ user, logout }) {
  const { openTickets, start, stop } = useNotifications()
  useEffect(() => { start('user'); return () => stop() }, [])
  return (
    <>
      <Brand icon={Fingerprint} accent="#58a6ff" />
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="section-label">Workspace</span>
        <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" end />
        <NavItem to="/organizations" icon={Building2} label="Organizations" />
        <NavItem to="/bridge-setup" icon={Wifi} label="Bridge Setup" />
        <NavItem to="/employees" icon={UserCheck} label="Employees" />
        <NavItem to="/shifts" icon={Clock} label="Shifts" />
        <span className="section-label" style={{ marginTop: '0.75rem' }}>Attendance</span>
        <NavItem to="/attendance" icon={CalendarCheck} label="Attendance" />
        <NavItem to="/reports" icon={PieChart} label="Reports" />
        <NavItem to="/holidays" icon={CalendarDays} label="Holidays" />
        <span className="section-label" style={{ marginTop: '0.75rem' }}>Account</span>
        <NavItem to="/profile" icon={User} label="My Profile" />
        <NavItem to="/subscription" icon={CreditCard} label="Subscription" />
        <NavItem to="/about" icon={Info} label="About" />
        <NavItem to="/tickets" icon={Ticket} label="Support" badge={openTickets} />
      </nav>
      <Footer user={user} logout={logout} roleLabel="User" accent="#58a6ff" />
    </>
  )
}

// ── Sidebar shell (handles mobile drawer + overlay) ───────────────────────────

const sidebarStyle = {
  width: 232, flexShrink: 0, display: 'flex', flexDirection: 'column',
  height: '100vh', position: 'sticky', top: 0,
  background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
  transition: 'background 0.3s, border-color 0.3s',
}

export function Sidebar() {
  const { user, logout } = useAuth()
  const { isOpen, close } = useSidebar()
  const loc = useLocation()

  // Close sidebar whenever route changes (mobile nav tap)
  useEffect(() => { close() }, [loc.pathname])

  const Content = user?.role === 'admin'   ? AdminSidebarContent
               : user?.role === 'support' ? SupportSidebarContent
               : UserSidebarContent

  return (
    <>
      {/* Overlay — visible on mobile when sidebar is open */}
      <div
        className={cn('sidebar-overlay', isOpen && 'sidebar-open')}
        onClick={close}
        aria-hidden="true"
      />
      {/* Sidebar panel */}
      <aside
        className={cn('sidebar-aside', isOpen && 'sidebar-open')}
        style={sidebarStyle}
      >
        <Content user={user} logout={logout} />
      </aside>
    </>
  )
}
