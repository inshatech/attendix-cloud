import { create } from 'zustand'

export const useSidebar = create(set => ({
  isOpen: false,
  open:   () => set({ isOpen: true }),
  close:  () => set({ isOpen: false }),
}))
