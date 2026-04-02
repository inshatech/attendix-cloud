import { create } from 'zustand'
import api from '../lib/api'

export const useNotifications = create((set, get) => ({
  openTickets:      0,
  unassigned:       0,
  newUsers:         0,
  newOrgs:          0,
  newPayments:      0,
  expiringPayments: 0,
  lastFetched:      null,
  _timer:           null,
  _role:            null,
  _sse:             null,

  fetchAdmin: async () => {
    try {
      const r = await api.get('/admin/notifications')
      const d = r.data || {}
      set({ openTickets: d.openTickets||0, unassigned: d.unassigned||0, newUsers: d.newUsers||0, newOrgs: d.newOrgs||0, newPayments: d.newPayments||0, expiringPayments: d.expiringPayments||0, lastFetched: new Date() })
    } catch {}
  },

  fetchUser: async () => {
    try {
      const r = await api.get('/user/ticket-notifications')
      const d = r.data || {}
      set({ openTickets: d.openCount||0, lastFetched: new Date() })
    } catch {}
  },

  startPaymentSSE: () => {
    if (get()._sse) return
    try {
      const token = sessionStorage.getItem('at') || ''
      const sse = new EventSource(`/api/admin/subscriptions/events/stream?token=${token}`)
      sse.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.type === 'payment_received') {
            set(s => ({ newPayments: s.newPayments + 1 }))
          }
        } catch {}
      }
      sse.onerror = () => { sse.close(); set({ _sse: null }) }
      set({ _sse: sse })
    } catch {}
  },

  start: (role) => {
    const { _timer, fetchAdmin, fetchUser, startPaymentSSE } = get()
    if (_timer) return
    const isStaff = role === 'admin' || role === 'support'
    const fn       = isStaff ? fetchAdmin : fetchUser
    const interval = isStaff ? 30000 : 60000
    fn()
    const timer = setInterval(fn, interval)
    set({ _timer: timer, _role: role })
    if (role === 'admin') startPaymentSSE()
  },

  stop: () => {
    const { _timer, _sse } = get()
    if (_timer) clearInterval(_timer)
    if (_sse) _sse.close()
    set({ _timer: null, _sse: null })
  },

  reset: () => set({ openTickets:0, unassigned:0, newUsers:0, newOrgs:0 }),
}))
