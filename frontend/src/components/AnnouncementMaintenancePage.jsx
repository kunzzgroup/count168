import '../styles/announcement-maintenance.css'

const announcements = [
  {
    id: 1,
    title: '版本更新 v2.0.2',
    items: ['优化大数据', '涵盖新功能', '修复process BUG'],
    createdBy: 'BOSS',
    createdAt: '04/03/2026 10:41:45'
  },
  {
    id: 2,
    title: '版本更新 v2.0.1',
    items: [
      '大概提升并整理空间响应速度，降低查询延迟',
      '修复交易备注（remark）在部分账目下无法保存的问题'
    ],
    createdBy: 'JK',
    createdAt: '24/02/2026 11:15:53'
  }
]

export function AnnouncementMaintenancePage() {
  return (
    <section className='announcement-page'>
      <header className='announcement-page-header'>
        <h1>Announcement and Maintenance Management</h1>
        <div className='switch-group'>
          <button type='button' className='switch-btn active'>Announcement</button>
          <button type='button' className='switch-btn'>Maintenance</button>
        </div>
      </header>

      <div className='announcement-grid'>
        <article className='panel'>
          <h2>Create New Announcement</h2>
          <form className='announcement-form'>
            <label htmlFor='announcement-title'>Title *</label>
            <input id='announcement-title' type='text' placeholder='Enter announcement title' />
            <label htmlFor='announcement-content'>Content *</label>
            <textarea id='announcement-content' rows={6} placeholder='Enter announcement content' />
            <button type='button' className='publish-btn'>Publish Announcement</button>
          </form>
        </article>

        <article className='panel list-panel'>
          <h2>Published Announcements</h2>
          <div className='announcement-list'>
            {announcements.map((announcement) => (
              <div className='announcement-item' key={announcement.id}>
                <div className='announcement-item-header'>
                  <h3>{announcement.title}</h3>
                  <div className='action-buttons'>
                    <button type='button' className='small-btn edit'>Edit</button>
                    <button type='button' className='small-btn delete'>Delete</button>
                  </div>
                </div>
                <ol>
                  {announcement.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
                <div className='announcement-meta'>
                  <span>Created by: {announcement.createdBy}</span>
                  <span>Created at: {announcement.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
