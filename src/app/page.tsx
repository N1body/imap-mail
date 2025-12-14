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
  snippet: string
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
  const [showAccountSelector, setShowAccountSelector] = useState(false) // Keeping state, might use differently

  // Email state
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string>('INBOX')
  const [emails, setEmails] = useState<Email[]>([])
  const [totalEmails, setTotalEmails] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const emailsPerPage = 50

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
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

  // Track if data has been loaded from localStorage
  const [isDataLoaded, setIsDataLoaded] = useState(false)

  // Load data from localStorage
  useEffect(() => {
    const savedServers = localStorage.getItem('imap-servers')
    if (savedServers) {
      const parsed = JSON.parse(savedServers)
      if (parsed.length > 0) {
        setServers(parsed)
      }
    }

    const savedAccounts = localStorage.getItem('imap-accounts-v2')
    if (savedAccounts) {
      const parsed = JSON.parse(savedAccounts)
      setAccounts(parsed)
      if (parsed.length > 0) {
        setSelectedAccount(parsed[0])
      }
    }

    // Mark data as loaded after reading from localStorage
    setIsDataLoaded(true)
  }, [])

  // Save data to localStorage (only after initial load)
  useEffect(() => {
    if (!isDataLoaded) return // Don't save before data is loaded

    if (servers.length > 0) {
      localStorage.setItem('imap-servers', JSON.stringify(servers))
    } else {
      localStorage.removeItem('imap-servers')
    }
  }, [servers, isDataLoaded])

  useEffect(() => {
    if (!isDataLoaded) return // Don't save before data is loaded

    if (accounts.length > 0) {
      localStorage.setItem('imap-accounts-v2', JSON.stringify(accounts))
    } else {
      localStorage.removeItem('imap-accounts-v2')
    }
  }, [accounts, isDataLoaded])

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
      setSearchQuery('')
      setCurrentPage(1)
      fetchEmails(1)
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

  const fetchEmails = async (page: number = 1) => {
    try {
      setLoading('emails')
      setSelectedEmail(null)
      setError('')
      const offset = (page - 1) * emailsPerPage
      const data = await apiCall('emails', {
        folder: selectedFolder,
        limit: emailsPerPage,
        offset,
      })
      const newEmails = data.emails || []
      setEmails(newEmails)
      setTotalEmails(data.total || 0)
      setCurrentPage(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
    } finally {
      setLoading('')
    }
  }

  const searchEmailsFunc = async (query: string, page: number = 1) => {
    if (!query.trim()) {
      setCurrentPage(1)
      fetchEmails(1)
      return
    }
    try {
      setLoading('emails')
      setSelectedEmail(null)
      setError('')
      const offset = (page - 1) * emailsPerPage
      const data = await apiCall('search', {
        folder: selectedFolder,
        query: query.trim(),
        limit: emailsPerPage,
        offset,
      })
      const newEmails = data.emails || []
      setEmails(newEmails)
      setTotalEmails(data.total || 0)
      setCurrentPage(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search emails')
    } finally {
      setLoading('')
    }
  }

  // Calculate pagination values
  const totalPages = Math.ceil(totalEmails / emailsPerPage)
  const startIndex = (currentPage - 1) * emailsPerPage + 1
  const endIndex = Math.min(currentPage * emailsPerPage, totalEmails)
  const hasPrevPage = currentPage > 1
  const hasNextPage = currentPage < totalPages

  const goToPrevPage = () => {
    if (hasPrevPage) {
      const newPage = currentPage - 1
      if (searchQuery) {
        searchEmailsFunc(searchQuery, newPage)
      } else {
        fetchEmails(newPage)
      }
    }
  }

  const goToNextPage = () => {
    if (hasNextPage) {
      const newPage = currentPage + 1
      if (searchQuery) {
        searchEmailsFunc(searchQuery, newPage)
      } else {
        fetchEmails(newPage)
      }
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
      const isThisYear = date.getFullYear() === now.getFullYear()

      if (isToday) {
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      } else if (isThisYear) {
        return date.toLocaleDateString('zh-CN', {
          month: 'short',
          day: 'numeric',
        })
      }
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
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
            <div className="px-6 py-4 text-xs text-gray-500">
              Loading folders...
            </div>
          ) : folders.length > 0 ? (
            folders.map(folder => (
              <div
                key={folder.path}
                onClick={() => {
                  setSelectedFolder(folder.path)
                  setSelectedEmail(null) // Return to list view
                }}
                className={`gmail-nav-item ${
                  selectedFolder === folder.path ? 'active' : ''
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
        {/* padding上下8px */}
        <header className="h-[var(--header-height)] flex items-center justify-between px-4 gap-4 flex-shrink-0 py-2">
          {/* Search Bar */}
          <div className="gmail-search-bar">
            <button onClick={() => searchEmailsFunc(searchQuery, 1)}>
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
              onKeyDown={e =>
                e.key === 'Enter' && searchEmailsFunc(searchQuery, 1)
              }
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  fetchEmails(1)
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
            <button
              className="p-2 text-gray-400 hover:bg-white/10 rounded-full"
              onClick={() => setShowServerManager(true)}
              title="Settings"
            >
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>

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
                        onClick={() => {
                          setSelectedAccount(acc)
                          setShowAccountSelector(false)
                        }}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs">
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
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            removeAccount(acc.id)
                          }}
                          className="p-1 text-gray-400 hover:text-red-400 rounded"
                          title="Remove account"
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
                              d="M6 18L18 6M6 6l12 12"
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
                        setShowAddAccount(true)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
                    >
                      Add another account
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Surface */}
        <div className="flex-1 rounded-tl-2xl bg-[var(--surface)] mr-2 mb-2 overflow-hidden flex flex-col relative">
          {/* Error Banner */}
          {error && (
            <div className="bg-red-900/50 text-red-200 px-4 py-2 text-sm flex justify-between absolute w-full z-10 top-0">
              <span>{error}</span>
              <button onClick={() => setError('')}>✕</button>
            </div>
          )}

          {/* View: Email Detail */}
          {/* View: Email Detail */}
          {selectedEmail ? (
            <div className="flex-1 flex flex-col h-full bg-white">
              {/* Toolbar */}
              <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2">
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
                  title="Back"
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
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                </button>

                {/* Archive */}
                <button
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
                  title="Archive"
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
                      d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20"
                    />
                  </svg>
                </button>

                {/* Report Spam */}
                <button
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
                  title="Report Spam"
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteEmailHandler(selectedEmail.uid)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
                  title="Delete"
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

                {/* Mark as Unread */}
                <button
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
                  title="Mark unread"
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
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="max-w-[98%] mx-auto">
                  {/* Subject Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <h1 className="text-[22px] text-[#202124] flex-1 leading-[1.3] break-words">
                      {selectedEmail.subject || '(No Subject)'}
                      <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                        Inbox
                      </span>
                    </h1>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-100 rounded text-gray-500">
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
                            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                          />
                        </svg>
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded text-gray-500">
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
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Sender Info Row */}
                  <div className="flex items-start gap-4 mb-6 relative group/sender">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg text-white font-medium bg-green-700 flex-shrink-0">
                      {(selectedEmail.from.replace(/<.*>/, '').trim() || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2 overflow-hidden">
                          <span className="font-bold text-[#202124] text-sm truncate">
                            {selectedEmail.from.replace(/<.*>/, '').trim() ||
                              'Unknown'}
                          </span>
                          <span className="text-xs text-[#5f6368] truncate">
                            &lt;
                            {selectedEmail.from
                              .match(/<.*>/)?.[0]
                              ?.replace(/[<>]/g, '') || selectedEmail.from}
                            &gt;
                          </span>
                          <button className="text-xs text-[#5f6368] hover:bg-gray-100 p-0.5 rounded">
                            to me ▼
                          </button>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[#5f6368] whitespace-nowrap">
                          <span>
                            {new Date(selectedEmail.date).toLocaleString([], {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                          <div className="flex items-center gap-2 opacity-0 group-hover/sender:opacity-100 transition-opacity">
                            <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
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
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                />
                              </svg>
                            </button>
                            <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
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
                                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                />
                              </svg>
                            </button>
                            <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
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
                                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="text-[#202124] text-sm overflow-hidden min-h-[200px] mb-8">
                    {selectedEmail.html ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                        className="prose max-w-none prose-sm"
                        // Add specific styles to reset prose defaults that might conflict
                      />
                    ) : (
                      <div className="whitespace-pre-wrap font-mono text-sm">
                        {selectedEmail.text || 'No content.'}
                      </div>
                    )}
                  </div>

                  {/* Attachments */}
                  {selectedEmail.attachments &&
                    selectedEmail.attachments.length > 0 && (
                      <div className="mt-8 border-t border-gray-100 pt-4">
                        <h4 className="text-sm font-medium text-gray-500 mb-3">
                          {selectedEmail.attachments.length} Attachments
                        </h4>
                        <div className="flex flex-wrap gap-4">
                          {selectedEmail.attachments.map((att, i) => (
                            <div
                              key={i}
                              className="group relative flex items-center gap-3 p-3 bg-[#f5f5f5] rounded-md border border-transparent hover:border-gray-300 hover:shadow-sm w-[200px] cursor-pointer transition-all overflow-hidden"
                            >
                              <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center text-xs font-bold text-red-600 flex-shrink-0">
                                PDF
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div
                                  className="text-sm font-medium text-[#202124] truncate"
                                  title={att.filename}
                                >
                                  {att.filename}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {formatFileSize(att.size)}
                                </div>
                              </div>
                              {/* Hover Overlay */}
                              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  className="p-1.5 bg-white rounded-full shadow hover:bg-gray-50 text-gray-600"
                                  title="Download"
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
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="p-1.5 bg-white rounded-full shadow hover:bg-gray-50 text-gray-600"
                                  title="Add to Drive"
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
                                      d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Bottom Action Buttons */}
                  <div className="mt-8 flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors">
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
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                      Reply
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors">
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
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                      Forward
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* View: Email List */
            <div className="flex-1 flex flex-col h-full">
              {/* List Toolbar */}
              <div className="h-10 flex items-center px-4 border-b border-[var(--border)] gap-4 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-500 rounded-sm"></div>
                <button
                  onClick={() => fetchEmails(currentPage)}
                  title="Refresh"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 ${
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
                <div className="flex-1"></div>
                <span className="text-xs text-[#5f6368]">
                  {totalEmails > 0 ? `${startIndex}-${endIndex}` : '0'} of{' '}
                  {totalEmails}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={!hasPrevPage}
                    onClick={goToPrevPage}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Previous page"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-[#5f6368]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <button
                    disabled={!hasNextPage}
                    onClick={goToNextPage}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Next page"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-[#5f6368]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* List Content */}
              <div className="flex-1 overflow-y-auto">
                {loading === 'emails' && emails.length === 0 ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="loader"></div>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="flex justify-center items-center h-full text-gray-500 text-sm">
                    No emails in {selectedFolder}
                  </div>
                ) : (
                  emails.map(email => (
                    <div
                      key={email.uid}
                      onClick={() => fetchEmail(email.uid)}
                      className={`gmail-email-row group ${
                        email.seen ? 'read' : 'unread'
                      }`}
                    >
                      {/* Drag handle / Checkbox */}
                      <div className="flex items-center gap-3 text-gray-400 pl-2">
                        <div className="w-5 h-5 border-2 border-gray-600 rounded-sm hover:border-white cursor-pointer"></div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 hover:text-yellow-400 cursor-pointer"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                          />
                        </svg>
                      </div>

                      <div
                        className={`min-w-[160px] max-w-[200px] truncate pr-4 ${
                          email.seen
                            ? 'font-normal text-[#202124]'
                            : 'font-bold text-[#202124]'
                        }`}
                      >
                        {email.from.replace(/<.*>/, '').trim() || 'Unknown'}
                      </div>

                      <div className="flex-1 truncate text-gray-500">
                        <span
                          className={`${
                            email.seen ? 'font-normal' : 'font-bold'
                          } text-[#202124]`}
                        >
                          {email.subject || '(No Subject)'}
                        </span>
                        <span className="text-gray-500 mx-2">-</span>
                        <span className="text-gray-500">
                          {email.snippet || 'No preview available'}
                        </span>
                      </div>

                      {/* Date & Hover Actions Container - Fixed size to prevent jitter */}
                      <div className="w-24 flex-shrink-0 relative h-8 flex items-center justify-end">
                        <div className="text-xs font-bold text-gray-400 text-right group-hover:opacity-0 transition-opacity">
                          {formatDate(email.date)}
                        </div>

                        {/* Hover Actions - Absolute positioned to avoid layout shift */}
                        <div className="absolute inset-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              deleteEmailHandler(email.uid)
                            }}
                            className="p-2 hover:bg-gray-600 rounded-full text-gray-300"
                            title="Delete"
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
                          <button
                            className="p-2 hover:bg-gray-600 rounded-full text-gray-300"
                            title="Archive"
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
                                d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddAccount && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-gray-200">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-normal text-gray-900">Add Account</h2>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="Email"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded text-gray-900 focus:border-blue-500 outline-none"
                value={newAccount.email}
                onChange={e =>
                  setNewAccount({ ...newAccount, email: e.target.value })
                }
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded text-gray-900 focus:border-blue-500 outline-none"
                value={newAccount.password}
                onChange={e =>
                  setNewAccount({ ...newAccount, password: e.target.value })
                }
              />
              <select
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded text-gray-900 outline-none"
                value={newAccount.serverId}
                onChange={e =>
                  setNewAccount({ ...newAccount, serverId: e.target.value })
                }
              >
                {servers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Connection Status */}
              {connectionStatus !== 'idle' && (
                <div
                  className={`p-3 rounded text-sm ${
                    connectionStatus === 'success'
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-red-900/30 text-red-400'
                  }`}
                >
                  {connectionStatus === 'success'
                    ? 'Connection successful'
                    : 'Connection failed'}
                </div>
              )}

              {/* Assuming there's an account selector dropdown somewhere else,
                  this button would be placed there. For now, placing it near
                  other account management buttons for context. */}
              {/* This button is added based on the instruction, but its exact placement
                  in the 'account dropdown' is not clear from the provided snippet.
                  Placing it here for now, assuming it's part of a broader account management section. */}
              <button
                onClick={() => {
                  setShowAccountSelector(false)
                  setShowBulkImport(true)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Bulk Import
              </button>
              <button
                onClick={() => {
                  setShowAddAccount(false)
                  setShowServerManager(true)
                }}
                className="text-blue-400 text-sm"
              >
                Manage Servers
              </button>
            </div>
            <div className="p-6 flex justify-end gap-3">
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
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
              >
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={() => setShowAddAccount(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={addAccount}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
              >
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}

      {showServerManager && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-normal text-gray-900">
                IMAP 服务器管理
              </h2>
              <button
                onClick={() => setShowServerManager(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                {servers.map(server => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {server.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {server.host}:{server.port}
                      </div>
                    </div>
                    <button
                      onClick={() => removeServer(server.id)}
                      className="text-red-400 hover:bg-red-400/10 p-2 rounded"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-gray-50 rounded border border-gray-200">
                <h3 className="text-sm font-bold text-gray-500 mb-3">
                  Add New Server
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newServer.name}
                    onChange={e =>
                      setNewServer({ ...newServer, name: e.target.value })
                    }
                    className="px-3 py-2 bg-white rounded text-gray-900 border border-gray-300"
                  />
                  <input
                    type="text"
                    placeholder="Host"
                    value={newServer.host}
                    onChange={e =>
                      setNewServer({ ...newServer, host: e.target.value })
                    }
                    className="px-3 py-2 bg-white rounded text-gray-900 border border-gray-300"
                  />
                  <input
                    type="text"
                    placeholder="Port"
                    value={newServer.port}
                    onChange={e =>
                      setNewServer({ ...newServer, port: e.target.value })
                    }
                    className="px-3 py-2 bg-white rounded text-gray-900 border border-gray-300"
                  />
                  <label className="flex items-center gap-2 text-gray-700">
                    <input
                      type="checkbox"
                      checked={newServer.tls}
                      onChange={e =>
                        setNewServer({ ...newServer, tls: e.target.checked })
                      }
                    />{' '}
                    TLS
                  </label>
                </div>
                <button
                  onClick={addServer}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
                >
                  Add Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-normal text-gray-900">
                Bulk Import Accounts
              </h2>
              <button
                onClick={() => setShowBulkImport(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {!importProgress ? (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      Format: email----password (one per line)
                    </label>
                    <textarea
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      placeholder={
                        'user1@example.com----pass1\nuser2@example.com----pass2'
                      }
                      className="w-full h-48 px-4 py-3 bg-gray-50 border border-gray-300 rounded text-gray-900 font-mono text-sm focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      Assign to Server
                    </label>
                    <select
                      value={bulkServerId}
                      onChange={e => setBulkServerId(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded text-gray-900 outline-none"
                    >
                      {servers.map(server => (
                        <option key={server.id} value={server.id}>
                          {server.name} ({server.host})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowBulkImport(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkImport}
                      disabled={!bulkText.trim() || !bulkServerId}
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
                    >
                      Start Import
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <div className="loader mx-auto w-10 h-10 border-4 mb-4"></div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {importProgress.status}
                  </h3>
                  <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2 max-w-md mx-auto">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          (importProgress.current / importProgress.total) * 100
                        }%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500">
                    {importProgress.current} / {importProgress.total}
                  </p>
                </div>
              )}
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
