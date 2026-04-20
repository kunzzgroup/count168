const REWRITE = {
  'api/company/verify_api.php': '/api/company/verify'
}

function phpBasePath() {
  if (typeof window === 'undefined') return '/'
  const pathname = window.location.pathname || '/'
  return pathname.replace(/[^/]*$/, '') || '/'
}

export function resolveApiPath(pathAndQuery) {
  if (!pathAndQuery || typeof pathAndQuery !== 'string') {
    return pathAndQuery
  }
  const qIndex = pathAndQuery.indexOf('?')
  const path = qIndex >= 0 ? pathAndQuery.slice(0, qIndex) : pathAndQuery
  const qs = qIndex >= 0 ? pathAndQuery.slice(qIndex) : ''
  let springBase = ''
  if (typeof window !== 'undefined' && typeof window.__API_BASE_URL__ === 'string') {
    springBase = window.__API_BASE_URL__.trim()
  }
  springBase = springBase.replace(/\/$/, '')
  if (springBase && Object.prototype.hasOwnProperty.call(REWRITE, path)) {
    return springBase + REWRITE[path] + qs
  }
  if (typeof window === 'undefined') {
    return pathAndQuery
  }
  return new URL(pathAndQuery, window.location.origin + phpBasePath()).href
}

export function installResolveApiPath() {
  if (typeof window !== 'undefined' && typeof window.resolveApiPath !== 'function') {
    window.resolveApiPath = resolveApiPath
  }
}
