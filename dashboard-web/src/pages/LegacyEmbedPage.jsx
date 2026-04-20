/**
 * 在 Dashboard 壳内用 iframe 加载 legacy PHP 页（带 ?spa_embed=1，PHP 端省略重复侧栏）。
 * 与 dashboard 主区相同的左侧留白，与 .dashboard-container 对齐。
 */
export default function LegacyEmbedPage({ title, legacyFile }) {
  const q = legacyFile ? `?spa_embed=1` : ''
  const src = legacyFile ? `./${legacyFile}${q}` : ''

  return (
    <div
      className="ec-legacy-embed-wrap"
      style={{
        height: '100vh',
        width: '100%',
        boxSizing: 'border-box',
        padding:
          'clamp(8px, 1vw, 12px) clamp(12px, 1.5vw, 40px) clamp(8px, 1vw, 12px) clamp(180px, 14.06vw, 270px)',
        overflow: 'hidden'
      }}
    >
      <iframe title={title || 'Legacy'} src={src} style={{ width: '100%', height: '100%', border: 0, display: 'block' }} referrerPolicy="same-origin" />
    </div>
  )
}
