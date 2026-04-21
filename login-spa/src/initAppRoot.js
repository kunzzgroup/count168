const meta = document.querySelector('meta[name="app-root"]')
window.__APP_ROOT__ = meta?.getAttribute('content') ?? ''
