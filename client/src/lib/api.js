import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request
api.interceptors.request.use(cfg => {
  const token = sessionStorage.getItem('at')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Auto-refresh on 401
api.interceptors.response.use(
  res => res.data,
  async err => {
    const status = err.response?.status
    // Only attempt refresh / redirect when the request carried an auth token.
    // Requests without a token (login, register, OTP…) should just throw the
    // error so the caller can show a toast — never reload the page.
    const hadToken = !!err.config?.headers?.Authorization
    if (status === 401 && hadToken) {
      const rt = localStorage.getItem('rt')
      if (rt) {
        try {
          const res = await axios.post(`${BASE}/auth/refresh`, { refreshToken: rt })
          sessionStorage.setItem('at', res.data.accessToken)
          localStorage.setItem('rt', res.data.refreshToken)
          err.config.headers.Authorization = `Bearer ${res.data.accessToken}`
          return axios(err.config).then(r => r.data)
        } catch {
          sessionStorage.clear()
          localStorage.clear()
          window.location.href = '/login'
        }
      } else {
        sessionStorage.clear()
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Request failed'
    const error = new Error(msg)
    if (err.response?.data?.setupRequired) error.setupRequired = true
    return Promise.reject(error)
  }
)

export default api
