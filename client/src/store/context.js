import { create } from 'zustand'

/**
 * Global context store — persists selected org/bridge/device across pages.
 * All pages (Employees, Shifts, Reports) read from here instead of
 * managing their own org dropdown state.
 */
export const useOrgContext = create((set, get) => ({
  // Loaded once from API
  orgs:    [],   // [{ orgId, name, bridgeId, deviceCount, bridgeOnline, ... }]
  devices: {},   // { [bridgeId]: [{ deviceId, name, model, location, ... }] }

  // Selected context
  orgId:    null,
  bridgeId: null,
  deviceId: null,   // null = all devices

  // Derived helpers
  org:    () => get().orgs.find(o => o.orgId    === get().orgId)    || null,
  bridge: () => {
    const org = get().org()
    return org ? { bridgeId: org.bridgeId, name: org.name } : null
  },
  orgDevices: () => {
    const org = get().org()
    if (!org?.bridgeId) return []
    return get().devices[org.bridgeId] || []
  },

  setOrgs: (orgs) => {
    const first = orgs[0] || null
    set({
      orgs,
      orgId:    first?.orgId    || null,
      bridgeId: first?.bridgeId || null,
      deviceId: null,
    })
  },

  selectOrg: (orgId) => {
    const org = get().orgs.find(o => o.orgId === orgId)
    set({ orgId, bridgeId: org?.bridgeId || null, deviceId: null })
  },

  selectDevice: (deviceId) => set({ deviceId }),

  setDevices: (bridgeId, devices) =>
    set(s => ({ devices: { ...s.devices, [bridgeId]: devices } })),
}))
