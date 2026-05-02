import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export function daysLeft(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr) - Date.now()) / 86_400_000))
}

export function fmtINR(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

export function timeAgo(d) {
  if (!d) return '—'
  const s = (Date.now() - new Date(d)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function punchLabel(t) {
  const map = { 0:'Check In', 1:'Check Out', 2:'Break Out', 3:'Break In', 4:'OT In', 5:'OT Out' }
  return map[t] ?? `Type ${t}`
}
