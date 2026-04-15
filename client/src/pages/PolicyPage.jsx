'use strict'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Heart, Fingerprint } from 'lucide-react'
import { useBrand } from '../store/brand'
import api from '../lib/api'

const SLUG_META = {
  'privacy-policy':   { label: 'Privacy Policy',   icon: '🔒' },
  'terms-of-service': { label: 'Terms of Service',  icon: '📄' },
  'refund-policy':    { label: 'Refund Policy',     icon: '💳' },
  'report-abuse':     { label: 'Report Abuse',      icon: '🚨' },
}

const POLICY_LINKS = [
  { slug: 'privacy-policy',   label: 'Privacy Policy'   },
  { slug: 'terms-of-service', label: 'Terms of Service'  },
  { slug: 'refund-policy',    label: 'Refund Policy'     },
  { slug: 'report-abuse',     label: 'Report Abuse'      },
]

export default function PolicyPage() {
  const { slug } = useParams()
  const { appName, companyName, logoUrl, tagline, version, load } = useBrand()
  const [page, setPage]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [notFound, setNF]   = useState(false)
  const meta = SLUG_META[slug] || { label: 'Policy', icon: '📄' }

  useEffect(() => { load() }, [])

  useEffect(() => {
    setLoad(true); setNF(false); setPage(null)
    api.get(`/api/legal/${slug}`)
      .then(r => {
        if (!r.data?.title && !r.data?.content) setNF(true)
        else setPage(r.data)
      })
      .catch(() => setNF(true))
      .finally(() => setLoad(false))
  }, [slug])

  const year = new Date().getFullYear()

  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f8', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #dde0f0', padding: '0 clamp(16px,4vw,48px)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo + name + tagline + version */}
          <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, overflow: 'hidden', flexShrink: 0,
              background: 'rgba(88,166,255,.12)', border: '1px solid rgba(88,166,255,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {logoUrl
                ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Fingerprint size={18} color="#58a6ff" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: '#1a1a2e', whiteSpace: 'nowrap' }}>
                  {appName || 'Attendix'}
                </span>
                {(version) && (
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace',
                    color: '#58a6ff', background: 'rgba(88,166,255,.12)', border: '1px solid rgba(88,166,255,.28)',
                    borderRadius: 4, padding: '1px 5px', flexShrink: 0, lineHeight: '1.6',
                  }}>v{version}</span>
                )}
              </div>
              {tagline && (
                <p style={{ fontSize: '0.68rem', color: '#9090b0', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tagline}
                </p>
              )}
            </div>
          </Link>

          {/* Back link */}
          <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#5050a0', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Back to Login
          </Link>
        </div>
      </div>

      {/* Policy nav pills */}
      <div style={{ background: '#fff', borderBottom: '1px solid #dde0f0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 clamp(16px,4vw,48px)', display: 'flex', gap: 4, overflowX: 'auto', paddingTop: 10, paddingBottom: 10 }}>
          {POLICY_LINKS.map(l => (
            <Link key={l.slug} to={`/policies/${l.slug}`} style={{
              padding: '5px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 600,
              whiteSpace: 'nowrap', textDecoration: 'none', transition: 'all .15s',
              background: slug === l.slug ? 'rgba(88,166,255,.12)' : 'transparent',
              color: slug === l.slug ? '#58a6ff' : '#5050a0',
              border: `1px solid ${slug === l.slug ? 'rgba(88,166,255,.3)' : 'transparent'}`,
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,48px)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="shimmer" style={{ height: i === 1 ? 36 : 18, borderRadius: 8, opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ) : notFound ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <FileText size={40} style={{ color: '#9090b0', marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px', color: '#1a1a2e', fontSize: '1.2rem' }}>{meta.label}</h2>
            <p style={{ color: '#9090b0', fontSize: '0.875rem' }}>This page has not been configured yet. Please check back later.</p>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #dde0f0', overflow: 'hidden' }}>
            {/* Page header */}
            <div style={{ padding: 'clamp(20px,4vw,36px)', borderBottom: '1px solid #f0f0f8', background: 'linear-gradient(135deg,rgba(88,166,255,.05),rgba(88,166,255,.02))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: '1.5rem' }}>{meta.icon}</span>
                <h1 style={{ margin: 0, fontSize: 'clamp(1.2rem,4vw,1.6rem)', fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.02em' }}>
                  {page.title || meta.label}
                </h1>
              </div>
              {page.lastUpdated && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#9090b0', fontFamily: 'monospace' }}>
                  Last updated: {page.lastUpdated}
                </p>
              )}
            </div>

            {/* Content body */}
            <div style={{ padding: 'clamp(20px,4vw,36px)' }}>
              {page.content ? (
                page.content.trimStart().startsWith('<')
                  ? <div className="policy-prose"
                      style={{ color: '#3a3a5c', fontSize: '0.9rem', lineHeight: 1.85 }}
                      dangerouslySetInnerHTML={{ __html: page.content }} />
                  : <div style={{ color: '#3a3a5c', fontSize: '0.9rem', lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {page.content}
                    </div>
              ) : (
                <p style={{ color: '#9090b0', fontSize: '0.875rem' }}>No content yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #dde0f0', padding: '20px clamp(16px,4vw,48px)', textAlign: 'center', marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.75rem', color: '#9090b0', margin: 0 }}>© {year} {appName || 'Attendix'}</p>
          <span style={{ color: '#c8cef0' }}>|</span>
          <Heart size={10} style={{ color: '#58a6ff', fill: '#58a6ff' }} />
          <p style={{ fontSize: '0.75rem', color: '#9090b0', margin: 0 }}>
            Powered by:{' '}
            <a href="https://www.inshatech.com" target="_blank" rel="noopener noreferrer"
              style={{ color: '#58a6ff', fontWeight: 700, textDecoration: 'none' }}>
              {companyName || 'Insha Technologies'}
            </a>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {POLICY_LINKS.map(l => (
            <Link key={l.slug} to={`/policies/${l.slug}`}
              style={{ fontSize: '0.72rem', color: slug === l.slug ? '#58a6ff' : '#9090b0', textDecoration: 'none', fontWeight: slug === l.slug ? 700 : 400 }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
