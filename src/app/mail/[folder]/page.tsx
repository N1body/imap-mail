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

  const { selectedAccount, getServer, isDataLoaded } = useMailContext()

  const [emails, setEmails] = useState<Email[]>([])
  const [totalEmails, setTotalEmails] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const emailsPerPage = 50

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
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300" />
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
              className={`gmail-email-row ${
                !email.seen ? 'gmail-email-unread' : ''
              }`}
            >
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-gray-300 mr-4 flex-shrink-0"
                onClick={e => e.stopPropagation()}
              />
              <div className="flex-1 flex items-center gap-4 min-w-0">
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
                <span
                  className={`text-xs whitespace-nowrap flex-shrink-0 ${
                    !email.seen ? 'font-bold text-[#202124]' : 'text-[#5f6368]'
                  }`}
                >
                  {formatDate(email.date)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
