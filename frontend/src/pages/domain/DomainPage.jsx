function DomainPage() {
  return (
    <section style={{ padding: '16px' }}>
      <h1 style={{ margin: 0, color: '#0f172a' }}>Domain List</h1>
      <div style={{ height: 1, background: '#e2e8f0', margin: '12px 0 16px' }} />
      <div style={{ color: '#334155', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
        Domain 页面已改为 React 路由入口。下一步可把原 PHP Domain 的列表、搜索、编辑、删除完整迁移到这里（后端 API 继续复用）。
      </div>
    </section>
  )
}

export default DomainPage
