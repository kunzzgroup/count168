import { useMemo, useState } from 'react'
import '../styles/sidebar-react.css'

const avatars = [
  'male1',
  'male2',
  'male3',
  'male4',
  'male5',
  'male6',
  'male7',
  'male8',
  'male9',
  'female1',
  'female2',
  'female3',
  'female4',
  'female5',
  'female6',
  'female7',
  'female8',
  'female9'
]

const menuItems = [
  { key: 'home', label: 'Home' },
  { key: 'domain', label: 'Domain', active: true },
  { key: 'announcement', label: 'Announcement' },
  { key: 'admin', label: 'Admin' },
  { key: 'account', label: 'Account' },
  { key: 'ownership', label: 'Ownership' },
  { key: 'process', label: 'Process' },
  { key: 'datacapture', label: 'Data Capture' },
  { key: 'transaction', label: 'Transaction Payment' },
  {
    key: 'report',
    label: 'Report',
    hasArrow: true,
    children: ['Customer Report', 'Domain Report']
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    hasArrow: true,
    children: ['Data Capture', 'Transaction', 'Payment', 'Formula', 'Process']
  }
]

const iconMap = {
  home: '🏠',
  domain: '🌐',
  announcement: '🗒️',
  admin: '🛡️',
  account: '👤',
  ownership: '👥',
  process: '✓',
  datacapture: '📊',
  transaction: '💳',
  report: '📑',
  maintenance: '🔧'
}

function getAvatarPath(avatarId) {
  const id = avatars.includes(avatarId) ? avatarId : 'male1'
  if (id.startsWith('male')) {
    return `/images/avatar${id.replace('male', '')}.png`
  }
  return `/images/${id}.png`
}

export function Sidebar() {
  const [selectedAvatar, setSelectedAvatar] = useState('male1')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [genderTab, setGenderTab] = useState('male')
  const [notificationOpen, setNotificationOpen] = useState(false)

  const visibleAvatars = useMemo(() => {
    return avatars.filter((id) => id.startsWith(genderTab))
  }, [genderTab])

  return (
    <>
      <aside className='informationmenu'>
        <div className='informationmenu-header'>
          <div className='header-logo-section'>
            <img src='/images/count_whitelogo.png' alt='EAZYCOUNT Logo' className='header-logo' />
            <button
              className='notification-bell'
              type='button'
              onClick={() => setNotificationOpen(true)}
              aria-label='Open notifications'
            >
              🔔
            </button>
          </div>

          <div className='user-info-container'>
            <div className='avatar-selector-container'>
              <button className='current-avatar' type='button' onClick={() => setAvatarOpen((v) => !v)}>
                <img
                  src={getAvatarPath(selectedAvatar)}
                  alt='Avatar'
                  className='current-avatar-img'
                />
              </button>

              {avatarOpen ? (
                <div className='avatar-options show'>
                  <div className='options-title'>Choose Avatar</div>
                  <div className='gender-selection'>
                    <button
                      type='button'
                      className={`gender-btn ${genderTab === 'male' ? 'active' : ''}`}
                      onClick={() => setGenderTab('male')}
                    >
                      Male
                    </button>
                    <button
                      type='button'
                      className={`gender-btn ${genderTab === 'female' ? 'active' : ''}`}
                      onClick={() => setGenderTab('female')}
                    >
                      Female
                    </button>
                  </div>
                  <div className='avatar-list show'>
                    {visibleAvatars.map((avatarId) => (
                      <button
                        key={avatarId}
                        type='button'
                        className={`avatar-option ${selectedAvatar === avatarId ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedAvatar(avatarId)
                          setAvatarOpen(false)
                        }}
                      >
                        <img src={getAvatarPath(avatarId)} alt={avatarId} className='avatar-option-img' />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className='user-avatar-dropdown'>
              <div className='user-info'>
                <div className='user-name'>JK</div>
                <div className='user-role'>Partnership</div>
              </div>
            </div>
          </div>
        </div>

        <div className='informationmenu-content'>
          <div className='content-separator' />
          {menuItems.map((item) => (
            <div className='informationmenu-section' key={item.key}>
              <div className='menu-item-wrapper'>
                <button
                  type='button'
                  className={`informationmenu-section-title ${item.active ? 'current-page' : ''}`}
                >
                  <span className='section-icon'>{iconMap[item.key]}</span>
                  {item.label}
                  {item.hasArrow ? <span className='section-arrow'>▶</span> : null}
                </button>
                {item.children ? (
                  <div className='submenu'>
                    <div className='submenu-content'>
                      {item.children.map((child) => (
                        <a className='submenu-item' key={child} href='#'>
                          <span>{child}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className='informationmenu-footer'>
          <button className='logout-btn' type='button'>
            Logout
          </button>
        </div>
      </aside>

      {notificationOpen ? (
        <>
          <div className='notification-overlay show' onClick={() => setNotificationOpen(false)} />
          <div className='notification-panel show'>
            <div className='notification-header'>
              <h2>Announcements</h2>
              <button type='button' className='notification-close' onClick={() => setNotificationOpen(false)}>
                ×
              </button>
            </div>
            <div className='notification-content'>
              <div className='notification-item unread'>
                <div className='notification-title'>System Notification</div>
                <div className='notification-message'>React sidebar UI 已完成迁移，PHP 后端保持不变。</div>
                <div className='notification-time'>Just now</div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
