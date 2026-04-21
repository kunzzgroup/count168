/** Resolve a path relative to the PHP app root (for API + same-origin PHP pages). */
export function appPath(relativePath) {
  const base =
    typeof window !== 'undefined' && window.__APP_ROOT__ !== undefined
      ? String(window.__APP_ROOT__)
      : ''
  const clean = String(relativePath || '').replace(/^\//, '')
  if (!base) {
    return `/${clean}`
  }
  return `${base.replace(/\/$/, '')}/${clean}`
}
