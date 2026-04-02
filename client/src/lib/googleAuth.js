/**
 * Google Sign-In — Google Identity Services button flow
 * Simplest approach: render an actual Google button, no popups, no overlays.
 * The button triggers Google's own OAuth flow reliably in all browsers.
 */

let loaded = false

export function loadGSI() {
  if (loaded && window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (document.getElementById('__gsi')) {
      window.google?.accounts ? (loaded = true, resolve()) :
        document.getElementById('__gsi').addEventListener('load', () => { loaded = true; resolve() })
      return
    }
    const s = document.createElement('script')
    s.id = '__gsi'
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true; s.defer = true
    s.onload  = () => { loaded = true; resolve() }
    s.onerror = () => reject(new Error('Failed to load Google SDK'))
    document.head.appendChild(s)
  })
}

/**
 * Render an official Google Sign-In button into a container element.
 * When clicked, Google handles the auth flow and calls onCredential(idToken).
 */
export async function renderGoogleButton(containerId, clientId, onCredential, theme = 'outline') {
  await loadGSI()
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: ({ credential }) => onCredential(credential),
    ux_mode: 'popup',
    cancel_on_tap_outside: false,
  })
  const container = document.getElementById(containerId)
  if (!container) return
  window.google.accounts.id.renderButton(container, {
    type: 'standard',
    theme,
    size: 'large',
    shape: 'pill',
    width: container.offsetWidth || 320,
    text: 'signin_with',
    logo_alignment: 'left',
  })
}
