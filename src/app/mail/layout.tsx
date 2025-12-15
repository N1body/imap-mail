'use client'

import { useMailContext, MailProvider } from '@/context/MailContext'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Folder } from '@/types'
import ConfirmDialog from '@/components/ConfirmDialog'
import Toast from '@/components/Toast'

function MailLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const params = useParams()
  const {
    accounts,
    selectedAccount,
    setSelectedAccount,
    folders,
    setFolders,
    getServer,
    isDataLoaded,
    servers,
    addServer,
    addAccount,
    removeAccount,
    removeServer,
    showConfirm,
    showToast,
    confirmDialogState,
    toastState,
  } = useMailContext()

  const [showAccountSelector, setShowAccountSelector] = useState(false)
  const [loading, setLoading] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal states
  const [showAddAccountModal, setShowAddAccountModal] = useState(false)
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [showServerModal, setShowServerModal] = useState(false)

  // Form states for adding account
  const [newAccountEmail, setNewAccountEmail] = useState('')
  const [newAccountPassword, setNewAccountPassword] = useState('')
  const [newAccountServerId, setNewAccountServerId] = useState('')

  // Form states for adding server
  const [newServerName, setNewServerName] = useState('')
  const [newServerHost, setNewServerHost] = useState('')
  const [newServerPort, setNewServerPort] = useState(993)
  const [newServerTls, setNewServerTls] = useState(true)
  const [newServerAuthType, setNewServerAuthType] = useState<
    'password' | 'oauth2'
  >('password')
  const [newServerClientId, setNewServerClientId] = useState('')

  // Form states for adding account (OAuth2)
  const [newAccountRefreshToken, setNewAccountRefreshToken] = useState('')

  // Bulk import state
  const [bulkImportText, setBulkImportText] = useState('')
  const [bulkImportServerId, setBulkImportServerId] = useState('')

  // Test connection state
  const [testingConnection, setTestingConnection] = useState(false)
  const [testConnectionResult, setTestConnectionResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // Get current folder from URL params
  const currentFolder = decodeURIComponent((params.folder as string) || 'inbox')

  const apiCall = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      if (!selectedAccount) throw new Error('No account selected')
      const server = getServer(selectedAccount.serverId)
      if (!server) throw new Error('Server not found')

      const response = await fetch('/api/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          config: {
            user: selectedAccount.email,
            password: selectedAccount.password,
            host: server.host,
            port: server.port,
            tls: server.tls,
            authType: server.authType || 'password',
            clientId: server.clientId,
            refreshToken: selectedAccount.refreshToken,
          },
          ...params,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'API error')
      }
      return data
    },
    [selectedAccount, getServer]
  )

  // Fetch folders when account changes
  useEffect(() => {
    if (selectedAccount && isDataLoaded) {
      setFolders([]) // Clear existing folders to show loading skeleton
      setLoading('folders')
      apiCall('folders')
        .then(data => {
          setFolders(data.folders || [])
        })
        .catch(err => {
          console.error('Failed to fetch folders:', err)
        })
        .finally(() => {
          setLoading('')
        })
    }
  }, [selectedAccount, isDataLoaded, apiCall, setFolders])

  const handleFolderClick = (folder: Folder) => {
    router.push(`/mail/${encodeURIComponent(folder.path)}`)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(
        `/mail/${encodeURIComponent(currentFolder)}?q=${encodeURIComponent(
          searchQuery
        )}`
      )
    } else {
      router.push(`/mail/${encodeURIComponent(currentFolder)}`)
    }
  }

  const handleTestConnection = async () => {
    if (!newAccountEmail || !newAccountServerId) {
      setTestConnectionResult({
        success: false,
        message: '请填写完整的账号信息',
      })
      return
    }

    const server = servers.find(s => s.id === newAccountServerId)
    if (!server) {
      setTestConnectionResult({
        success: false,
        message: '请选择服务器',
      })
      return
    }

    const isOAuth2 = server.authType === 'oauth2'

    // Validate based on auth type
    if (isOAuth2 && !newAccountRefreshToken) {
      setTestConnectionResult({
        success: false,
        message: '请填写 Refresh Token',
      })
      return
    }
    if (!isOAuth2 && !newAccountPassword) {
      setTestConnectionResult({
        success: false,
        message: '请填写密码',
      })
      return
    }

    setTestingConnection(true)
    setTestConnectionResult(null)

    try {
      const response = await fetch('/api/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          config: {
            user: newAccountEmail,
            password: newAccountPassword,
            host: server.host,
            port: server.port,
            tls: server.tls,
            authType: server.authType || 'password',
            clientId: server.clientId,
            refreshToken: newAccountRefreshToken,
          },
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setTestConnectionResult({
          success: true,
          message: '连接成功！账号验证通过。',
        })
      } else {
        setTestConnectionResult({
          success: false,
          message: data.error || '连接失败，请检查账号信息。',
        })
      }
    } catch (error) {
      setTestConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : '连接测试失败',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] font-sans text-[var(--foreground)]">
      {/* Sidebar */}
      <aside className="w-[var(--sidebar-width)] flex-shrink-0 flex flex-col bg-[var(--background)]">
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="#EA4335"
              className="w-7 h-7"
            >
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </div>
          <span className="text-xl text-[var(--foreground)] opacity-90 tracking-tight">
            IMAP Mail
          </span>
        </div>

        {/* Compose Button */}
        <div className="px-3 py-2">
          <button className="gmail-compose-btn">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            <span>写邮件</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto mt-2">
          {loading === 'folders' && folders.length === 0 ? (
            // Folder skeleton loading animation
            <div className="px-3 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 flex items-center gap-3 px-3 animate-pulse"
                >
                  <div className="w-5 h-5 bg-gray-200 rounded"></div>
                  <div
                    className="h-4 bg-gray-200 rounded"
                    style={{ width: `${60 + Math.random() * 40}%` }}
                  ></div>
                </div>
              ))}
            </div>
          ) : folders.length > 0 ? (
            folders.map(folder => (
              <div
                key={folder.path}
                onClick={() => handleFolderClick(folder)}
                className={`gmail-nav-item ${
                  currentFolder === folder.path ? 'active' : ''
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 opacity-70"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  {folder.path.toLowerCase().includes('inbox') ? (
                    <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1H4v4.385l5.223 3.656a1 1 0 001.154 0L16 10.385V6zM4 13v2h12v-2l-4.83-3.38L4 13z" />
                  ) : folder.path.toLowerCase().includes('sent') ? (
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  ) : folder.path.toLowerCase().includes('trash') ||
                    folder.path.toLowerCase().includes('delete') ? (
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path
                      fillRule="evenodd"
                      d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
                <span className="flex-1 truncate">{folder.name}</span>
                {folder.messageCount > 0 && (
                  <span className="text-xs font-semibold">
                    {folder.messageCount}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="px-6 py-2 text-sm text-gray-500">No folders</div>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-[var(--header-height)] flex items-center justify-between px-4 gap-4 flex-shrink-0 py-2">
          {/* Search Bar */}
          <div className="gmail-search-bar">
            <button onClick={handleSearch}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
            <input
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder-gray-500"
              placeholder="Search mail"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  router.push(`/mail/${encodeURIComponent(currentFolder)}`)
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Right Profile / Settings */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowAccountSelector(!showAccountSelector)}
                className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold text-white ring-2 ring-transparent hover:ring-white/20"
              >
                {selectedAccount?.email.charAt(0).toUpperCase() || '?'}
              </button>
              {/* Account Dropdown */}
              {showAccountSelector && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 text-center">
                    <div className="w-16 h-16 rounded-full bg-purple-500 mx-auto flex items-center justify-center text-2xl font-bold mb-2">
                      {selectedAccount?.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-medium text-gray-900">
                      {selectedAccount?.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {selectedAccount?.email}
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {accounts.map(acc => (
                      <div
                        key={acc.id}
                        className={`px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-l-4 ${
                          selectedAccount?.id === acc.id
                            ? 'bg-blue-50 border-blue-500'
                            : 'border-transparent'
                        }`}
                      >
                        <div
                          onClick={() => {
                            setSelectedAccount(acc)
                            setShowAccountSelector(false)
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div
                            className={`w-8 h-8 rounded-full ${
                              selectedAccount?.id === acc.id
                                ? 'bg-blue-600'
                                : 'bg-blue-500'
                            } flex items-center justify-center text-xs text-white flex-shrink-0`}
                          >
                            {acc.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-900 truncate">
                              {acc.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {acc.email}
                            </div>
                          </div>
                        </div>
                        {selectedAccount?.id === acc.id && (
                          <svg
                            className="w-5 h-5 text-blue-600 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            showConfirm({
                              title: '删除账号',
                              message: `确定要删除账号 ${acc.email} 吗？`,
                              confirmText: '删除',
                              confirmStyle: 'danger',
                              onConfirm: () => {
                                removeAccount(acc.id)
                                showToast(`已删除账号 ${acc.email}`, 'success')
                              },
                            })
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                          title="删除账号"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-100 flex flex-col gap-1">
                    <button
                      onClick={() => {
                        setShowAccountSelector(false)
                        setShowAddAccountModal(true)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      添加账号
                    </button>
                    <button
                      onClick={() => {
                        setShowAccountSelector(false)
                        setShowBulkImportModal(true)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      批量导入
                    </button>
                    <button
                      onClick={() => {
                        setShowAccountSelector(false)
                        setShowServerModal(true)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                        />
                      </svg>
                      服务器管理
                    </button>
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-2"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                          />
                        </svg>
                        退出登录
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Surface */}
        <div className="flex-1 rounded-tl-2xl bg-[var(--surface)] mr-2 mb-2 overflow-hidden flex flex-col relative">
          {children}
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAddAccountModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              添加账号
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IMAP 服务器
                </label>
                <select
                  value={newAccountServerId}
                  onChange={e => {
                    setNewAccountServerId(e.target.value)
                    // Reset password/token when server changes
                    setNewAccountPassword('')
                    setNewAccountRefreshToken('')
                    setTestConnectionResult(null)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="">选择服务器...</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.host}){' '}
                      {s.authType === 'oauth2' ? '🔐 OAuth2' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={newAccountEmail}
                  onChange={e => setNewAccountEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder="user@example.com"
                />
              </div>
              {/* Show password or refresh token based on server auth type */}
              {(() => {
                const selectedServer = servers.find(
                  s => s.id === newAccountServerId
                )
                const isOAuth2 = selectedServer?.authType === 'oauth2'

                if (isOAuth2) {
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Refresh Token
                      </label>
                      <textarea
                        value={newAccountRefreshToken}
                        onChange={e =>
                          setNewAccountRefreshToken(e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-sm font-mono"
                        placeholder="从 Microsoft Azure 获取的 Refresh Token..."
                        rows={3}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        OAuth2 账户需要提供 Refresh Token 而非密码
                      </p>
                    </div>
                  )
                }

                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      密码/应用专用密码
                    </label>
                    <input
                      type="password"
                      value={newAccountPassword}
                      onChange={e => setNewAccountPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="••••••••"
                    />
                  </div>
                )
              })()}
            </div>

            {/* Test Connection Result */}
            {testConnectionResult && (
              <div
                className={`mt-4 p-3 rounded-lg text-sm ${
                  testConnectionResult.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {testConnectionResult.success ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {testConnectionResult.message}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {testConnectionResult.message}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddAccountModal(false)
                  setTestConnectionResult(null)
                  setNewAccountEmail('')
                  setNewAccountPassword('')
                  setNewAccountRefreshToken('')
                  setNewAccountServerId('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleTestConnection}
                disabled={
                  testingConnection ||
                  !newAccountEmail ||
                  !newAccountServerId ||
                  (servers.find(s => s.id === newAccountServerId)?.authType ===
                  'oauth2'
                    ? !newAccountRefreshToken
                    : !newAccountPassword)
                }
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {testingConnection ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    测试中...
                  </>
                ) : (
                  '测试连接'
                )}
              </button>
              <button
                onClick={() => {
                  const selectedServer = servers.find(
                    s => s.id === newAccountServerId
                  )
                  const isOAuth2 = selectedServer?.authType === 'oauth2'
                  const hasCredential = isOAuth2
                    ? newAccountRefreshToken
                    : newAccountPassword

                  if (newAccountEmail && hasCredential && newAccountServerId) {
                    addAccount({
                      email: newAccountEmail,
                      password: newAccountPassword,
                      serverId: newAccountServerId,
                      name: newAccountEmail.split('@')[0],
                      refreshToken: isOAuth2
                        ? newAccountRefreshToken
                        : undefined,
                    })
                    setNewAccountEmail('')
                    setNewAccountPassword('')
                    setNewAccountRefreshToken('')
                    setNewAccountServerId('')
                    setTestConnectionResult(null)
                    setShowAddAccountModal(false)
                  }
                }}
                disabled={(() => {
                  const selectedServer = servers.find(
                    s => s.id === newAccountServerId
                  )
                  const isOAuth2 = selectedServer?.authType === 'oauth2'
                  const hasCredential = isOAuth2
                    ? newAccountRefreshToken
                    : newAccountPassword
                  return (
                    !newAccountEmail || !hasCredential || !newAccountServerId
                  )
                })()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowBulkImportModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              批量导入账号
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IMAP 服务器
                </label>
                <select
                  value={bulkImportServerId}
                  onChange={e => setBulkImportServerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="">选择服务器...</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.host})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账号列表（每行一个，格式：邮箱----
                  {servers.find(s => s.id === bulkImportServerId)?.authType ===
                  'oauth2'
                    ? 'RefreshToken'
                    : '密码'}
                  ）
                </label>
                <textarea
                  value={bulkImportText}
                  onChange={e => setBulkImportText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-48 font-mono text-sm text-gray-900"
                  placeholder={
                    servers.find(s => s.id === bulkImportServerId)?.authType ===
                    'oauth2'
                      ? 'user1@outlook.com----refreshToken1\nuser2@outlook.com----refreshToken2'
                      : 'user1@example.com----password1\nuser2@example.com----password2'
                  }
                />
                {servers.find(s => s.id === bulkImportServerId)?.authType ===
                  'oauth2' && (
                  <p className="mt-1 text-xs text-gray-500">
                    OAuth2 服务器需要填写 Refresh Token 而非密码
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBulkImportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (bulkImportText && bulkImportServerId) {
                    const selectedServer = servers.find(
                      s => s.id === bulkImportServerId
                    )
                    const isOAuth2 = selectedServer?.authType === 'oauth2'

                    const lines = bulkImportText
                      .split('\n')
                      .filter(line => line.trim())
                    let importedCount = 0
                    lines.forEach(line => {
                      const trimmedLine = line.trim()
                      // Support multiple separators: colon, tab, double dash, space (last resort)
                      let email = ''
                      let credential = ''

                      if (trimmedLine.includes(':')) {
                        const parts = trimmedLine.split(':')
                        email = parts[0].trim()
                        credential = parts.slice(1).join(':').trim() // Handle passwords with colons
                      } else if (trimmedLine.includes('\t')) {
                        const parts = trimmedLine.split('\t')
                        email = parts[0].trim()
                        credential = parts.slice(1).join('\t').trim()
                      } else if (trimmedLine.includes('----')) {
                        const parts = trimmedLine.split('----')
                        email = parts[0].trim()
                        credential = parts.slice(1).join('----').trim()
                      } else if (trimmedLine.includes(' ')) {
                        // Space separator - assume first part is email
                        const parts = trimmedLine.split(/\s+/)
                        email = parts[0].trim()
                        credential = parts.slice(1).join(' ').trim()
                      }

                      if (email && credential && email.includes('@')) {
                        addAccount({
                          email,
                          password: isOAuth2 ? '' : credential,
                          serverId: bulkImportServerId,
                          name: email.split('@')[0],
                          refreshToken: isOAuth2 ? credential : undefined,
                        })
                        importedCount++
                      }
                    })
                    setBulkImportText('')
                    setBulkImportServerId('')
                    setShowBulkImportModal(false)
                    if (importedCount > 0) {
                      showToast(`成功导入 ${importedCount} 个账号`, 'success')
                    } else {
                      showToast('未能导入任何账号，请检查格式是否正确', 'error')
                    }
                  }
                }}
                disabled={!bulkImportText || !bulkImportServerId}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server Management Modal */}
      {showServerModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowServerModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              服务器管理
            </h2>

            {/* Existing Servers */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                已添加的服务器
              </h3>
              {servers.length === 0 ? (
                <p className="text-sm text-gray-500">暂无服务器，请先添加</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {servers.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          {s.name}
                          {s.authType === 'oauth2' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              OAuth2
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {s.host}:{s.port}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const success = removeServer(s.id)
                          if (!success) {
                            showToast(
                              '无法删除：该服务器正在被账号使用',
                              'error'
                            )
                          } else {
                            showToast(`已删除服务器 ${s.name}`, 'success')
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Server Form */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                添加新服务器
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newServerName}
                  onChange={e => setNewServerName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder="服务器名称 (如 Outlook、Gmail)"
                />
                <input
                  type="text"
                  value={newServerHost}
                  onChange={e => setNewServerHost(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder="主机地址 (如 outlook.office365.com)"
                />
                <div className="flex gap-3">
                  <input
                    type="number"
                    value={newServerPort}
                    onChange={e =>
                      setNewServerPort(parseInt(e.target.value) || 993)
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    placeholder="端口"
                  />
                  <label className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={newServerTls}
                      onChange={e => setNewServerTls(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">TLS</span>
                  </label>
                </div>

                {/* Auth Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    认证方式
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="authType"
                        checked={newServerAuthType === 'password'}
                        onChange={() => {
                          setNewServerAuthType('password')
                          setNewServerClientId('')
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">密码认证</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="authType"
                        checked={newServerAuthType === 'oauth2'}
                        onChange={() => setNewServerAuthType('oauth2')}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">
                        OAuth2 (Outlook)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Client ID for OAuth2 */}
                {newServerAuthType === 'oauth2' && (
                  <div>
                    <input
                      type="text"
                      value={newServerClientId}
                      onChange={e => setNewServerClientId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-sm"
                      placeholder="Azure App Client ID"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      从 Azure Portal 获取的应用程序 Client ID
                    </p>
                  </div>
                )}

                <button
                  onClick={() => {
                    const isOAuth2 = newServerAuthType === 'oauth2'
                    if (
                      newServerName &&
                      newServerHost &&
                      (!isOAuth2 || newServerClientId)
                    ) {
                      addServer({
                        name: newServerName,
                        host: newServerHost,
                        port: newServerPort,
                        tls: newServerTls,
                        authType: newServerAuthType,
                        clientId: isOAuth2 ? newServerClientId : undefined,
                      })
                      setNewServerName('')
                      setNewServerHost('')
                      setNewServerPort(993)
                      setNewServerTls(true)
                      setNewServerAuthType('password')
                      setNewServerClientId('')
                    }
                  }}
                  disabled={
                    !newServerName ||
                    !newServerHost ||
                    (newServerAuthType === 'oauth2' && !newServerClientId)
                  }
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  添加服务器
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowServerModal(false)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialogState.isOpen}
        title={confirmDialogState.title}
        message={confirmDialogState.message}
        onConfirm={() => {
          confirmDialogState.onConfirm()
          confirmDialogState.onClose()
        }}
        onCancel={confirmDialogState.onClose}
        confirmText={confirmDialogState.confirmText}
        confirmStyle={confirmDialogState.confirmStyle}
      />

      {/* Toast */}
      {toastState.isVisible && (
        <Toast
          message={toastState.message}
          type={toastState.type}
          onClose={toastState.onClose}
          isVisible={true}
        />
      )}
    </div>
  )
}

export default function MailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MailProvider>
      <MailLayoutContent>{children}</MailLayoutContent>
    </MailProvider>
  )
}
