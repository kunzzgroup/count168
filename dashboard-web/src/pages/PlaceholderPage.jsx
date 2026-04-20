export default function PlaceholderPage({ title, legacyFile }) {
  const legacyHref = legacyFile ? `./${legacyFile}` : '#'

  return (
    <div
      style={{
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '36rem',
        lineHeight: 1.6
      }}
    >
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{title}</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        此路由已登记，UI 尚未从 PHP 迁入 React。请先使用原页面。
      </p>
      <p>
        <a href={legacyHref} style={{ color: '#2563eb' }}>
          打开原页：{legacyFile}
        </a>
      </p>
    </div>
  )
}
