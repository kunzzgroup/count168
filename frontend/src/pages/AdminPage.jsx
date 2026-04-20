import './AdminPage.css'

const TABLE_COLUMNS = ['No', 'Login Id', 'Name', 'Email', 'Role', 'Status', 'Last Login', 'Created By', 'Action']

function AdminPage() {
  return (
    <section className='admin-page'>
      <header className='admin-header'>
        <h1>User List</h1>
      </header>

      <div className='admin-separator' />

      <div className='admin-toolbar'>
        <div className='admin-toolbar-left'>
          <button type='button' className='admin-btn admin-btn-primary'>
            Add User
          </button>
          <input type='text' className='admin-search' placeholder='Search by Login Id or Name' />
          <label className='admin-checkbox'>
            <input type='checkbox' />
            <span>Show Inactive</span>
          </label>
          <label className='admin-checkbox'>
            <input type='checkbox' />
            <span>Show All</span>
          </label>
        </div>
        <button type='button' className='admin-btn admin-btn-danger'>
          Delete
        </button>
      </div>

      <div className='admin-table-wrap'>
        <div className='admin-table-head'>
          {TABLE_COLUMNS.map((col) => (
            <div key={col} className='admin-th'>
              {col}
            </div>
          ))}
        </div>
        <div className='admin-empty'>Admin 页面已切到 React，下一步接 userlist API 数据。</div>
      </div>
    </section>
  )
}

export default AdminPage
