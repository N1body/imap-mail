'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ConfirmDialog'
import Toast from '@/components/Toast'

interface ImapServer {
  id: string
  name: string
  host: string
  port: number
  tls: boolean
}

interface ImapAccount {
  id: string
  name: string
  email: string
  serverId: string
  password: string
}

interface Folder {
  name: string
  path: string
  messageCount: number
}

interface Email {
  uid: number
  subject: string
  from: string
  to: string
  date: string
  seen: boolean
  hasAttachments: boolean
}

interface EmailDetail extends Email {
  html: string | null
  text: string | null
  attachments: Array<{
    filename: string
    contentType: string
    size: number
  }>
}

// Default IMAP servers
const DEFAULT_SERVERS: ImapServer[] = []

export default function Home() {
  const router = useRouter()

  // Server management
  const [servers, setServers] = useState<ImapServer[]>(DEFAULT_SERVERS)
  const [showServerManager, setShowServerManager] = useState(false)
  const [newServer, setNewServer] = useState({
    name: '',
    host: '',
    port: '',
    tls: false,
  })

  // Account management
  const [accounts, setAccounts] = useState<ImapAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<ImapAccount | null>(
    null
  )
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showAccountSelector, setShowAccountSelector] = useState(false)

  // Email state
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string>('INBOX')
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null)

  // UI state
  const [loading, setLoading] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle')

  // New account form
  const [newAccount, setNewAccount] = useState({
    name: '',
    email: '',
    serverId: '',
    password: '',
  })

  // Bulk import
  const [bulkText, setBulkText] = useState('')
  const [bulkServerId, setBulkServerId] = useState('')
  const [importProgress, setImportProgress] = useState<{
    total: number
    current: number
    status: string
  } | null>(null)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    confirmStyle?: 'danger' | 'primary'
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  // Toast state
  const [toast, setToast] = useState<{
    message: string
    isVisible: boolean
    type: 'success' | 'error' | 'info'
  }>({
    message: '',
    isVisible: false,
    type: 'success',
  })

  // Load data from localStorage
  useEffect(() => {
    const savedServers = localStorage.getItem('imap-servers')
    if (savedServers) {
      setServers(JSON.parse(savedServers))
    }

    const savedAccounts = localStorage.getItem('imap-accounts-v2')
    if (savedAccounts) {
      const parsed = JSON.parse(savedAccounts)
      setAccounts(parsed)
      if (parsed.length > 0) {
        setSelectedAccount(parsed[0])
      }
    }
  }, [])

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('imap-servers', JSON.stringify(servers))
  }, [servers])

  useEffect(() => {
    if (accounts.length > 0) {
      localStorage.setItem('imap-accounts-v2', JSON.stringify(accounts))
    } else {
      localStorage.removeItem('imap-accounts-v2')
    }
  }, [accounts])

  // Update default serverId when servers change
  useEffect(() => {
    if (servers.length > 0) {
      const firstServerId = servers[0].id
      setNewAccount(prev =>
        prev.serverId ? prev : { ...prev, serverId: firstServerId }
      )
      setBulkServerId(prev => prev || firstServerId)
    }
  }, [servers])

  // Get server by ID
  const getServer = useCallback(
    (serverId: string): ImapServer | undefined => {
      return servers.find(s => s.id === serverId)
    },
    [servers]
  )

  // Fetch folders when account changes
  useEffect(() => {
    if (selectedAccount) {
      fetchFolders()
    } else {
      setFolders([])
      setEmails([])
      setSelectedEmail(null)
    }
  }, [selectedAccount])

  // Fetch emails when folder changes
  useEffect(() => {
    if (selectedAccount && selectedFolder) {
      fetchEmails()
    }
  }, [selectedAccount, selectedFolder])

  const apiCall = async (
    action: string,
    params: Record<string, unknown> = {}
  ) => {
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
        },
        ...params,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'API error')
    }
    return data
  }

  const fetchFolders = async () => {
    try {
      setLoading('folders')
      setError('')
      const data = await apiCall('folders')
      setFolders(data.folders || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch folders')
    } finally {
      setLoading('')
    }
  }

  const fetchEmails = async () => {
    try {
      setLoading('emails')
      setError('')
      setSelectedEmail(null)
      const data = await apiCall('emails', {
        folder: selectedFolder,
        limit: 50,
      })
      setEmails(data.emails || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
    } finally {
      setLoading('')
    }
  }

  const fetchEmail = async (uid: number) => {
    try {
      setLoading('email')
      setError('')
      const data = await apiCall('email', { folder: selectedFolder, uid })
      setSelectedEmail(data.email)
      await apiCall('markRead', { folder: selectedFolder, uid })
      setEmails(prev =>
        prev.map(e => (e.uid === uid ? { ...e, seen: true } : e))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email')
    } finally {
      setLoading('')
    }
  }

  const deleteEmailHandler = (uid: number) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除邮件',
      message: '确定要删除这封邮件吗？此操作无法撤销。',
      confirmText: '删除',
      confirmStyle: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        try {
          setLoading('delete')
          await apiCall('delete', { folder: selectedFolder, uid })
          setEmails(prev => prev.filter(e => e.uid !== uid))
          if (selectedEmail?.uid === uid) {
            setSelectedEmail(null)
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to delete email'
          )
        } finally {
          setLoading('')
        }
      },
    })
  }

  const testConnection = async (
    email: string,
    password: string,
    serverId: string
  ) => {
    const server = getServer(serverId)
    if (!server) {
      setError('Server not found')
      return false
    }

    setTestingConnection(true)
    setConnectionStatus('idle')
    try {
      const response = await fetch('/api/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          config: {
            user: email,
            password: password,
            host: server.host,
            port: server.port,
            tls: server.tls,
          },
        }),
      })

      const data = await response.json()
      if (response.ok && data.success) {
        setConnectionStatus('success')
        return true
      } else {
        setConnectionStatus('error')
        setError(data.error || 'Connection test failed')
        return false
      }
    } catch (err) {
      setConnectionStatus('error')
      setError(err instanceof Error ? err.message : 'Connection test failed')
      return false
    } finally {
      setTestingConnection(false)
    }
  }

  const addAccount = () => {
    if (!newAccount.email || !newAccount.password || !newAccount.serverId) {
      setError('请填写所有必填字段')
      return
    }

    const account: ImapAccount = {
      id: Date.now().toString(),
      name: newAccount.name || newAccount.email.split('@')[0],
      email: newAccount.email,
      serverId: newAccount.serverId,
      password: newAccount.password,
    }

    setAccounts(prev => [...prev, account])
    if (!selectedAccount) {
      setSelectedAccount(account)
    }
    setShowAddAccount(false)
    setNewAccount({
      name: '',
      email: '',
      serverId: servers.length > 0 ? servers[0].id : '',
      password: '',
    })
    setConnectionStatus('idle')
  }

  const removeAccount = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除账户',
      message: '确定要删除这个账户吗？此操作无法撤销。',
      confirmText: '删除',
      confirmStyle: 'danger',
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        setAccounts(prev => {
          const updated = prev.filter(a => a.id !== id)
          if (selectedAccount?.id === id) {
            setSelectedAccount(updated[0] || null)
          }
          return updated
        })
      },
    })
  }

  // Server management
  const addServer = () => {
    if (!newServer.name || !newServer.host) {
      setError('请填写服务器名称和地址')
      return
    }
    const server: ImapServer = {
      id: Date.now().toString(),
      name: newServer.name,
      host: newServer.host,
      port: parseInt(newServer.port) || 993,
      tls: newServer.tls,
    }
    setServers(prev => [...prev, server])
    setNewServer({ name: '', host: '', port: '993', tls: true })
  }

  const removeServer = (id: string) => {
    const usedByAccounts = accounts.some(a => a.serverId === id)
    if (usedByAccounts) {
      setError('此服务器正在被账户使用，无法删除')
      return
    }
    setServers(prev => prev.filter(s => s.id !== id))
  }

  // Bulk import
  const parseBulkAccounts = (
    text: string
  ): Array<{ email: string; password: string }> => {
    const lines = text.split('\n').filter(line => line.trim())
    const accounts: Array<{ email: string; password: string }> = []

    for (const line of lines) {
      // Support format: email----password
      const parts = line.split('----')
      if (parts.length >= 2) {
        const email = parts[0].trim()
        const password = parts[1].trim()
        if (email && password && email.includes('@')) {
          accounts.push({ email, password })
        }
      }
    }
    return accounts
  }

  const handleBulkImport = async () => {
    const parsed = parseBulkAccounts(bulkText)
    if (parsed.length === 0) {
      setError('未找到有效的账户数据。格式：email----password')
      return
    }

    setImportProgress({
      total: parsed.length,
      current: 0,
      status: '准备导入...',
    })

    for (let i = 0; i < parsed.length; i++) {
      const { email, password } = parsed[i]
      setImportProgress({
        total: parsed.length,
        current: i + 1,
        status: `导入 ${email}...`,
      })

      // Check if account already exists
      if (accounts.some(a => a.email === email)) {
        continue
      }

      const account: ImapAccount = {
        id: Date.now().toString() + i,
        name: email.split('@')[0],
        email,
        serverId: bulkServerId,
        password,
      }

      setAccounts(prev => [...prev, account])

      // Small delay to prevent UI freeze
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    setImportProgress(null)
    setShowBulkImport(false)
    setBulkText('')

    // Select first account if none selected
    if (!selectedAccount && accounts.length === 0 && parsed.length > 0) {
      const firstParsed = parsed[0]
      setSelectedAccount({
        id: Date.now().toString(),
        name: firstParsed.email.split('@')[0],
        email: firstParsed.email,
        serverId: bulkServerId,
        password: firstParsed.password,
      })
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const isToday = date.toDateString() === now.toDateString()

      if (isToday) {
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        })
      }
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              IMAP Mail Manager
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Custom Account Selector */}
            <div className="relative">
              <button
                onClick={() => setShowAccountSelector(!showAccountSelector)}
                className="flex items-center gap-3 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm transition-all min-w-[0px]"
              >
                {selectedAccount ? (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">
                      {selectedAccount.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium truncate max-w-[150px]">
                        {selectedAccount.name}
                      </div>
                      <div className="text-xs text-white/50 truncate max-w-[150px]">
                        {selectedAccount.email}
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="text-white/50">选择账户...</span>
                )}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-white/50 transition-transform ${
                    showAccountSelector ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showAccountSelector && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="p-3 border-b border-white/10 flex items-center justify-between">
                    <span className="text-sm font-medium text-white/70">
                      账户列表 ({accounts.length})
                    </span>
                    <button
                      onClick={() => {
                        setShowAccountSelector(false)
                        setShowServerManager(true)
                      }}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      管理服务器
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {accounts.length === 0 ? (
                      <div className="p-4 text-center text-white/50 text-sm">
                        暂无账户
                      </div>
                    ) : (
                      accounts.map(acc => (
                        <div
                          key={acc.id}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors ${
                            selectedAccount?.id === acc.id
                              ? 'bg-violet-600/20'
                              : ''
                          }`}
                          onClick={() => {
                            setSelectedAccount(acc)
                            setShowAccountSelector(false)
                          }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/50 to-fuchsia-500/50 flex items-center justify-center text-xs font-bold text-white">
                            {acc.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white text-sm truncate">
                              {acc.name}
                            </div>
                            <div className="text-xs text-white/50 truncate">
                              {acc.email}
                            </div>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(acc.email)
                              setToast({
                                message: '邮箱地址已复制',
                                isVisible: true,
                                type: 'success',
                              })
                            }}
                            className="p-1.5 text-white/30 hover:text-violet-400 hover:bg-violet-500/20 rounded-lg transition-colors"
                            title="复制邮箱地址"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              removeAccount(acc.id)
                            }}
                            className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
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
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t border-white/10 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setShowAccountSelector(false)
                        setShowAddAccount(true)
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white text-sm rounded-lg transition-colors"
                    >
                      + 添加账户
                    </button>
                    <button
                      onClick={() => {
                        setShowAccountSelector(false)
                        setShowBulkImport(true)
                      }}
                      className="px-3 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm rounded-lg transition-colors"
                    >
                      批量导入
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2.5 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-white/70 hover:text-red-400 transition-all"
              title="退出登录"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/20 border-b border-red-500/50 px-4 py-3 text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-200 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Folders */}
        <aside className="w-64 bg-black/20 backdrop-blur-xl border-r border-white/10 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                文件夹
              </h2>
              <button
                onClick={fetchFolders}
                disabled={loading === 'folders' || !selectedAccount}
                className="text-white/50 hover:text-white transition-colors disabled:opacity-30"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 ${
                    loading === 'folders' ? 'animate-spin' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            {!selectedAccount ? (
              <div className="text-center py-8">
                <p className="text-white/50 text-sm mb-4">请先添加邮箱账户</p>
                <button
                  onClick={() => setShowAddAccount(true)}
                  className="px-4 py-2 bg-violet-600/50 hover:bg-violet-600 text-white text-sm rounded-lg transition-colors"
                >
                  添加账户
                </button>
              </div>
            ) : loading === 'folders' ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : folders.length === 0 ? (
              <p className="text-white/50 text-sm text-center py-8">无文件夹</p>
            ) : (
              folders.map(folder => (
                <button
                  key={folder.path}
                  onClick={() => setSelectedFolder(folder.path)}
                  className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition-all flex items-center gap-3 ${
                    selectedFolder === folder.path
                      ? 'bg-gradient-to-r from-violet-600/50 to-fuchsia-600/50 text-white shadow-lg'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <span className="truncate">{folder.name}</span>
                </button>
              ))
            )}
          </nav>

          {/* Quick Stats */}
          {accounts.length > 0 && (
            <div className="p-3 border-t border-white/10 bg-white/5">
              <div className="text-xs text-white/50 text-center">
                {accounts.length} 个账户 · {servers.length} 个服务器
              </div>
            </div>
          )}
        </aside>

        {/* Email List */}
        <div className="w-96 bg-black/10 border-r border-white/10 flex flex-col">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              {selectedFolder || '收件箱'}
            </h2>
            <button
              onClick={fetchEmails}
              disabled={loading === 'emails' || !selectedAccount}
              className="text-white/50 hover:text-white transition-colors disabled:opacity-30"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ${
                  loading === 'emails' ? 'animate-spin' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selectedAccount ? (
              <p className="text-white/50 text-sm text-center py-8">
                请先选择账户
              </p>
            ) : loading === 'emails' ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : emails.length === 0 ? (
              <p className="text-white/50 text-sm text-center py-8">无邮件</p>
            ) : (
              emails.map(email => (
                <button
                  key={email.uid}
                  onClick={() => fetchEmail(email.uid)}
                  className={`w-full text-left p-4 border-b border-white/5 transition-all hover:bg-white/5 ${
                    selectedEmail?.uid === email.uid ? 'bg-violet-600/20' : ''
                  } ${!email.seen ? 'bg-white/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span
                      className={`text-sm truncate ${
                        !email.seen ? 'font-bold text-white' : 'text-white/80'
                      }`}
                    >
                      {email.from.replace(/<.*>/g, '').trim() || email.from}
                    </span>
                    <span className="text-xs text-white/50 flex-shrink-0">
                      {formatDate(email.date)}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate ${
                      !email.seen
                        ? 'font-semibold text-white/90'
                        : 'text-white/70'
                    }`}
                  >
                    {email.subject}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {!email.seen && (
                      <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                    )}
                    {email.hasAttachments && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-white/50"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Email Content */}
        <main className="flex-1 flex flex-col bg-black/5">
          {loading === 'email' ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : selectedEmail ? (
            <>
              {/* Email Header */}
              <div className="p-6 border-b border-white/10 bg-black/20">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-4">
                      {selectedEmail.subject}
                    </h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-white/50 w-12">发件人:</span>
                        <span className="text-white">{selectedEmail.from}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white/50 w-12">收件人:</span>
                        <span className="text-white/80">
                          {selectedEmail.to}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white/50 w-12">时间:</span>
                        <span className="text-white/80">
                          {new Date(selectedEmail.date).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteEmailHandler(selectedEmail.uid)}
                    disabled={loading === 'delete'}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-lg transition-colors text-sm"
                  >
                    删除
                  </button>
                </div>

                {/* Attachments */}
                {selectedEmail.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <h3 className="text-sm font-semibold text-white/70 mb-2">
                      附件 ({selectedEmail.attachments.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmail.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg text-sm"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-white/50"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                          <span className="text-white/80">{att.filename}</span>
                          <span className="text-white/50">
                            ({formatFileSize(att.size)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Email Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {selectedEmail.html ? (
                  <div
                    className="prose prose-invert max-w-none bg-white rounded-lg p-4"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                  />
                ) : (
                  <pre className="text-white/80 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {selectedEmail.text || '(无内容)'}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 mx-auto text-white/20 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
                  />
                </svg>
                <p className="text-white/50">选择邮件以查看内容</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Click outside to close account selector */}
      {showAccountSelector && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowAccountSelector(false)}
        />
      )}

      {/* Add Account Modal */}
      {showAddAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-white/10">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">添加 IMAP 账户</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  账户名称 (可选)
                </label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={e =>
                    setNewAccount({ ...newAccount, name: e.target.value })
                  }
                  placeholder="例如：工作邮箱"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  邮箱地址 *
                </label>
                <input
                  type="email"
                  value={newAccount.email}
                  onChange={e =>
                    setNewAccount({ ...newAccount, email: e.target.value })
                  }
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  密码 *
                </label>
                <input
                  type="password"
                  value={newAccount.password}
                  onChange={e =>
                    setNewAccount({ ...newAccount, password: e.target.value })
                  }
                  placeholder="输入密码"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  IMAP 服务器 *
                </label>
                <select
                  value={newAccount.serverId}
                  onChange={e =>
                    setNewAccount({ ...newAccount, serverId: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-slate-700 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {servers.map(server => (
                    <option key={server.id} value={server.id}>
                      {server.name} ({server.host}:{server.port})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setShowAddAccount(false)
                    setShowServerManager(true)
                  }}
                  className="text-xs text-violet-400 hover:text-violet-300 mt-2"
                >
                  + 添加新服务器
                </button>
              </div>

              {/* Connection Status */}
              {connectionStatus !== 'idle' && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    connectionStatus === 'success'
                      ? 'bg-green-500/20 text-green-300 border border-green-500/50'
                      : 'bg-red-500/20 text-red-300 border border-red-500/50'
                  }`}
                >
                  {connectionStatus === 'success'
                    ? '✓ 连接测试成功！'
                    : '✕ 连接测试失败'}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex justify-between gap-3">
              <button
                onClick={() =>
                  testConnection(
                    newAccount.email,
                    newAccount.password,
                    newAccount.serverId
                  )
                }
                disabled={
                  testingConnection || !newAccount.email || !newAccount.password
                }
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              >
                {testingConnection ? '测试中...' : '测试连接'}
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddAccount(false)
                    setConnectionStatus('idle')
                    setNewAccount({
                      name: '',
                      email: '',
                      serverId: servers.length > 0 ? servers[0].id : '',
                      password: '',
                    })
                  }}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-all"
                >
                  取消
                </button>
                <button
                  onClick={addAccount}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg"
                >
                  添加账户
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server Manager Modal */}
      {showServerManager && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-white/10">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">IMAP 服务器管理</h2>
              <p className="text-sm text-white/50 mt-1">
                管理可用的 IMAP 服务器配置
              </p>
            </div>

            <div className="p-6">
              {/* Server List */}
              <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                {servers.map(server => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                  >
                    <div>
                      <div className="font-medium text-white">
                        {server.name}
                      </div>
                      <div className="text-sm text-white/50">
                        {server.host}:{server.port} {server.tls && '(SSL/TLS)'}
                      </div>
                    </div>
                    <button
                      onClick={() => removeServer(server.id)}
                      className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
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

              {/* Add New Server */}
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <h3 className="text-sm font-semibold text-white/70 mb-4">
                  添加新服务器
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      服务器名称
                    </label>
                    <input
                      type="text"
                      value={newServer.name}
                      onChange={e =>
                        setNewServer({ ...newServer, name: e.target.value })
                      }
                      placeholder="例如：My Mail"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      服务器地址
                    </label>
                    <input
                      type="text"
                      value={newServer.host}
                      onChange={e =>
                        setNewServer({ ...newServer, host: e.target.value })
                      }
                      placeholder="imap.example.com"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      端口
                    </label>
                    <input
                      type="text"
                      value={newServer.port}
                      onChange={e =>
                        setNewServer({ ...newServer, port: e.target.value })
                      }
                      placeholder="993"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newServer.tls}
                        onChange={e =>
                          setNewServer({ ...newServer, tls: e.target.checked })
                        }
                        className="w-4 h-4 rounded bg-white/5 border border-white/20 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-white/70">SSL/TLS</span>
                    </label>
                  </div>
                </div>
                <button
                  onClick={addServer}
                  className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
                >
                  添加服务器
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowServerManager(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-lg text-sm font-medium transition-all"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-white/10">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">批量导入账户</h2>
              <p className="text-sm text-white/50 mt-1">快速导入多个邮箱账户</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  选择 IMAP 服务器
                </label>
                <select
                  value={bulkServerId}
                  onChange={e => setBulkServerId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {servers.map(server => (
                    <option key={server.id} value={server.id}>
                      {server.name} ({server.host}:{server.port})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  账户数据{' '}
                  <span className="text-white/50 font-normal">
                    (格式：email----password，每行一个)
                  </span>
                </label>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder="example1@mail.com----password1&#10;example2@mail.com----password2&#10;example3@mail.com----password3"
                  rows={10}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm resize-none"
                />
              </div>

              {/* Preview */}
              {bulkText && (
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-white/70">
                    检测到{' '}
                    <span className="text-violet-400 font-bold">
                      {parseBulkAccounts(bulkText).length}
                    </span>{' '}
                    个有效账户
                  </div>
                </div>
              )}

              {/* Import Progress */}
              {importProgress && (
                <div className="p-4 bg-violet-600/20 rounded-lg border border-violet-500/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white">
                      {importProgress.status}
                    </span>
                    <span className="text-sm text-white/70">
                      {importProgress.current} / {importProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                      style={{
                        width: `${
                          (importProgress.current / importProgress.total) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBulkImport(false)
                  setBulkText('')
                  setImportProgress(null)
                }}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-all"
                disabled={!!importProgress}
              >
                取消
              </button>
              <button
                onClick={handleBulkImport}
                disabled={
                  !bulkText ||
                  !!importProgress ||
                  parseBulkAccounts(bulkText).length === 0
                }
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg disabled:opacity-50"
              >
                {importProgress
                  ? '导入中...'
                  : `导入 ${parseBulkAccounts(bulkText).length} 个账户`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmStyle={confirmDialog.confirmStyle}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Toast */}
      <Toast
        message={toast.message}
        isVisible={toast.isVisible}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  )
}
