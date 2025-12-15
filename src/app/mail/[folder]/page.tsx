'use client'

import { useMailContext } from '@/context/MailContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, use } from 'react'
import { Email } from '@/types'

// Skeleton component for loading state
function EmailSkeleton() {
  return (
    <div className="gmail-email-row animate-pulse">
      <div className="w-5 h-5 bg-gray-200 rounded mr-4"></div>
      <div className="flex-1 flex items-center gap-4">
        <div className="w-32 h-4 bg-gray-200 rounded"></div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="w-48 h-4 bg-gray-200 rounded"></div>
            <div className="w-64 h-3 bg-gray-100 rounded"></div>
          </div>
        </div>
        <div className="w-12 h-4 bg-gray-200 rounded"></div>
      </div>
    </div>
  )
}

export default function FolderPage({
  params,
}: {
  params: Promise<{ folder: string }>
}) {
  const resolvedParams = use(params)
  const folder = decodeURIComponent(resolvedParams.folder)
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchQuery = searchParams.get('q') || ''

  const { selectedAccount, getServer, isDataLoaded, showConfirm, showToast } =
    useMailContext()

  const [emails, setEmails] = useState<Email[]>([])
  const [totalEmails, setTotalEmails] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedUids, setSelectedUids] = useState<Set<number>>(new Set())

  const emailsPerPage = 25

  // Clear selection when folder or account changes
  useEffect(() => {
    setSelectedUids(new Set())
  }, [folder, selectedAccount?.id])

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allUids = emails.map(email => email.uid)
      setSelectedUids(new Set(allUids))
    } else {
      setSelectedUids(new Set())
    }
  }

  const handleSelectEmail = (uid: number, checked: boolean) => {
    const newSelected = new Set(selectedUids)
    if (checked) {
      newSelected.add(uid)
    } else {
      newSelected.delete(uid)
    }
    setSelectedUids(newSelected)
  }

  const handleDelete = (uidsToDelete: number[]) => {
    if (uidsToDelete.length === 0) return

    showConfirm({
      title: '删除邮件',
      message: `确定要删除这 ${uidsToDelete.length} 封邮件吗？`,
      confirmText: '删除',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          // Optimistic update
          setEmails(prev => prev.filter(e => !uidsToDelete.includes(e.uid)))
          setSelectedUids(
            new Set(
              [...selectedUids].filter(uid => !uidsToDelete.includes(uid))
            )
          )
          setTotalEmails(prev => Math.max(0, prev - uidsToDelete.length))

          showToast(`已删除 ${uidsToDelete.length} 封邮件`, 'success')

          await apiCall('delete', {
            folder,
            uids: uidsToDelete,
          })
        } catch (err) {
          console.error('Failed to delete emails:', err)
          showToast('删除失败', 'error')
          // Revert optimistic update could be complex, for now just show error
          // Ideally we would fetchEmails(currentPage) to restore state
          fetchEmails(currentPage)
        }
      },
    })
  }

  const isAllSelected = emails.length > 0 && selectedUids.size === emails.length
  const isIndeterminate =
    selectedUids.size > 0 && selectedUids.size < emails.length

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

  const fetchEmails = useCallback(
    async (page: number = 1) => {
      if (!selectedAccount || !isDataLoaded) return
      try {
        setLoading(true)
        setError('')
        const offset = (page - 1) * emailsPerPage
        const data = await apiCall('emails', {
          folder,
          limit: emailsPerPage,
          offset,
        })
        setEmails(data.emails || [])
        setTotalEmails(data.total || 0)
        setCurrentPage(page)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch emails')
      } finally {
        setLoading(false)
      }
    },
    [selectedAccount, isDataLoaded, folder, apiCall]
  )

  const searchEmailsFunc = useCallback(
    async (query: string, page: number = 1) => {
      if (!selectedAccount || !isDataLoaded) return
      if (!query.trim()) {
        fetchEmails(page)
        return
      }
      try {
        setLoading(true)
        setError('')
        const offset = (page - 1) * emailsPerPage
        const data = await apiCall('search', {
          folder,
          query: query.trim(),
          limit: emailsPerPage,
          offset,
        })
        setEmails(data.emails || [])
        setTotalEmails(data.total || 0)
        setCurrentPage(page)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to search emails')
      } finally {
        setLoading(false)
      }
    },
    [selectedAccount, isDataLoaded, folder, apiCall, fetchEmails]
  )

  // Fetch emails when folder or account changes
  useEffect(() => {
    if (selectedAccount && isDataLoaded) {
      setCurrentPage(1)
      if (searchQuery) {
        searchEmailsFunc(searchQuery, 1)
      } else {
        fetchEmails(1)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, isDataLoaded, folder, searchQuery])

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

  const handleEmailClick = (email: Email) => {
    router.push(`/mail/${encodeURIComponent(folder)}/${email.uid}`)
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

  if (!isDataLoaded) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Skeleton rows */}
        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: 10 }).map((_, i) => (
            <EmailSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/50 text-red-200 px-4 py-2 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-12 border-b border-gray-200 bg-white flex items-center px-4 gap-2 justify-between">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300"
            checked={isAllSelected}
            ref={input => {
              if (input) input.indeterminate = isIndeterminate
            }}
            onChange={handleSelectAll}
          />
          {selectedUids.size > 0 ? (
            <button
              onClick={() => handleDelete(Array.from(selectedUids))}
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
          ) : (
            <button
              onClick={() =>
                searchQuery ? searchEmailsFunc(searchQuery, 1) : fetchEmails(1)
              }
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
              title="Refresh"
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Pagination */}
        {totalEmails > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>
              {startIndex}-{endIndex} / {totalEmails}
            </span>
            <button
              onClick={goToPrevPage}
              disabled={!hasPrevPage}
              className={`p-1 rounded ${
                hasPrevPage
                  ? 'hover:bg-gray-100'
                  : 'opacity-30 cursor-not-allowed'
              }`}
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={goToNextPage}
              disabled={!hasNextPage}
              className={`p-1 rounded ${
                hasNextPage
                  ? 'hover:bg-gray-100'
                  : 'opacity-30 cursor-not-allowed'
              }`}
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          // Show skeleton while loading
          Array.from({ length: 10 }).map((_, i) => <EmailSkeleton key={i} />)
        ) : emails.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-16 w-16 mx-auto mb-4 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <p>No emails in this folder</p>
            </div>
          </div>
        ) : (
          emails.map(email => (
            <div
              key={email.uid}
              onClick={() => handleEmailClick(email)}
              className={`gmail-email-row group ${
                !email.seen ? 'gmail-email-unread' : ''
              } ${selectedUids.has(email.uid) ? 'bg-blue-50' : ''}`}
            >
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-gray-300 mr-4 flex-shrink-0"
                checked={selectedUids.has(email.uid)}
                onClick={e => e.stopPropagation()}
                onChange={e => handleSelectEmail(email.uid, e.target.checked)}
              />
              <div className="flex-1 flex items-center gap-4 min-w-0 relative">
                <span
                  className={`w-[180px] truncate flex-shrink-0 ${
                    !email.seen ? 'font-bold text-[#202124]' : 'text-[#5f6368]'
                  }`}
                >
                  {email.from.replace(/<.*>/, '').trim() || 'Unknown'}
                </span>
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span
                    className={`truncate ${
                      !email.seen
                        ? 'font-bold text-[#202124]'
                        : 'text-[#5f6368]'
                    }`}
                  >
                    {email.subject || '(No Subject)'}
                  </span>
                  <span className="text-[#5f6368] truncate text-sm hidden sm:inline">
                    — {email.snippet}
                  </span>
                </div>

                {/* Date or Delete Button */}
                <div className="flex-shrink-0 ml-2 w-24 flex justify-end items-center relative">
                  <span
                    className={`text-xs whitespace-nowrap transition-opacity duration-150 group-hover:opacity-0 ${
                      !email.seen
                        ? 'font-bold text-[#202124]'
                        : 'text-[#5f6368]'
                    }`}
                  >
                    {formatDate(email.date)}
                  </span>
                  <button
                    className="absolute right-0 p-1.5 hover:bg-gray-200 rounded-full text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={e => {
                      e.stopPropagation()
                      handleDelete([email.uid])
                    }}
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
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
