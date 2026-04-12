import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useBrand } from './store/brand'
import { AppShell } from './components/layout/AppShell'
import { Toaster } from './components/ui/Toast'
import { Spinner } from './components/ui/Spinner'

import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Organizations from './pages/Organizations'
import Subscription from './pages/Subscription'
import Profile from './pages/Profile'
import Employees from './pages/Employees'
import Shifts from './pages/Shifts'
import Attendance from './pages/Attendance'
import Reports from './pages/ReportsTab'
import About from './pages/About'
import Holidays from './pages/Holidays'
import Tickets from './pages/Tickets'
import BridgeSetup from './pages/BridgeSetup'

import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminPlans from './pages/admin/AdminPlans'
import AdminPlugins from './pages/admin/AdminPlugins'
import AdminSubscriptions from './pages/admin/AdminSubscriptions'
import AdminCoupons from './pages/admin/AdminCoupons'
import AdminOrganizations from './pages/admin/AdminOrganizations'
import AdminTickets from './pages/admin/AdminTickets'
import AdminChat from './pages/admin/AdminChat'
import AdminBackup from './pages/admin/AdminBackup'
import { Fingerprint } from 'lucide-react'

function Loading() {
  const { logoUrl, appName, tagline, load } = useBrand()
  useEffect(() => { load() }, [])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg-base)' }}>
      {/* Logo — same style as sidebar Brand */}
      <div style={{
        width: 48, height: 48, borderRadius: 13, overflow: 'hidden', flexShrink: 0,
        background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
        boxShadow: '0 4px 22px var(--accent-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {logoUrl
          ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: '1.4rem' }}><Fingerprint style={{ color: 'var(--accent)' }} /></span>}
      </div>
      {appName && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{appName}</p>
          {tagline && <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{tagline}</p>}
        </div>
      )}
      <Spinner className="w-5 h-5 text-accent" />
    </div>
  )
}

function AuthGuard({ children, roles = null }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <AppShell>{children}</AppShell>
}

function PublicRoute({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return <Loading />
  if (user) return <Navigate to={['admin', 'support'].includes(user.role) ? '/admin' : '/dashboard'} replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user, ready } = useAuth()
  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={['admin', 'support'].includes(user.role) ? '/admin' : '/dashboard'} replace />
}

const STAFF = ['admin', 'support']

function AppRoutes() {
  const { init } = useAuth()
  useEffect(() => { init() }, [])
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

      {/* User workspace */}
      <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
      <Route path="/organizations" element={<AuthGuard><Organizations /></AuthGuard>} />
      <Route path="/employees" element={<AuthGuard><Employees /></AuthGuard>} />
      <Route path="/shifts" element={<AuthGuard><Shifts /></AuthGuard>} />
      <Route path="/attendance" element={<AuthGuard><Attendance /></AuthGuard>} />
      <Route path="/reports" element={<AuthGuard><Reports /></AuthGuard>} />
      <Route path="/about" element={<AuthGuard><About /></AuthGuard>} />
      <Route path="/holidays" element={<AuthGuard><Holidays /></AuthGuard>} />
      <Route path="/subscription" element={<AuthGuard><Subscription /></AuthGuard>} />
      <Route path="/tickets" element={<AuthGuard><Tickets /></AuthGuard>} />
      <Route path="/bridge-setup" element={<AuthGuard><BridgeSetup /></AuthGuard>} />
      <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />

      {/* Admin + Support shared */}
      <Route path="/admin" element={<AuthGuard roles={STAFF}><AdminDashboard /></AuthGuard>} />
      <Route path="/admin/organizations" element={<AuthGuard roles={STAFF}><AdminOrganizations /></AuthGuard>} />
      <Route path="/admin/tickets" element={<AuthGuard roles={STAFF}><AdminTickets /></AuthGuard>} />
      <Route path="/admin/chat" element={<AuthGuard roles={STAFF}><AdminChat /></AuthGuard>} />
      <Route path="/admin/profile" element={<AuthGuard roles={STAFF}><Profile /></AuthGuard>} />

      {/* Admin only */}
      <Route path="/admin/users" element={<AuthGuard roles={['admin']}><AdminUsers /></AuthGuard>} />
      <Route path="/admin/plans" element={<AuthGuard roles={['admin']}><AdminPlans /></AuthGuard>} />
      <Route path="/admin/plugins" element={<AuthGuard roles={['admin']}><AdminPlugins /></AuthGuard>} />
      <Route path="/admin/subscriptions" element={<AuthGuard roles={['admin']}><AdminSubscriptions /></AuthGuard>} />
      <Route path="/admin/coupons" element={<AuthGuard roles={['admin']}><AdminCoupons /></AuthGuard>} />
      <Route path="/admin/backup" element={<AuthGuard roles={['admin']}><AdminBackup /></AuthGuard>} />

      {/* Fallbacks */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster />
    </BrowserRouter>
  )
}
