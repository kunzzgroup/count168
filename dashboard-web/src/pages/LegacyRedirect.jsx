import { useEffect } from 'react'

/**
 * Hash 命中无侧栏业务 PHP 时，整页跳转到对应 *.php（避免在 AppLayout 里套占位）。
 */
export default function LegacyRedirect({ legacyFile }) {
  useEffect(() => {
    const base = typeof window.__COUNT_ASSET_BASE === 'string' ? window.__COUNT_ASSET_BASE : ''
    const target = base + (legacyFile || 'index.html')
    window.location.replace(target)
  }, [legacyFile])

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', color: '#64748b' }}>
      Loading…
    </div>
  )
}
