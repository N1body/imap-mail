'use client'

import { useMailContext } from '@/context/MailContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, use } from 'react'
import { EmailDetail } from '@/types'

// Skeleton component for email detail loading
function EmailDetailSkeleton() {
  return (
    <div className="flex-1 flex flex-col h-full bg-white animate-pulse">
      {/* Toolbar skeleton */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2">
        <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
        <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
        <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[98%] mx-auto">
          {/* Subject skeleton */}
          <div className="h-7 bg-gray-200 rounded w-3/4 mb-6"></div>

          {/* Sender info skeleton */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-3 bg-gray-100 rounded w-64"></div>
            </div>
          </div>

          {/* Body skeleton */}
          <div className="space-y-3">
            <div className="h-4 bg-gray-100 rounded w-full"></div>
            <div className="h-4 bg-gray-100 rounded w-5/6"></div>
            <div className="h-4 bg-gray-100 rounded w-4/5"></div>
            <div className="h-4 bg-gray-100 rounded w-full"></div>
            <div className="h-4 bg-gray-100 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EmailDetailPage({
  params,
}: {
  params: Promise<{ folder: string; uid: string }>
}) {
  const resolvedParams = use(params)
  const folder = decodeURIComponent(resolvedParams.folder)
  const uid = parseInt(resolvedParams.uid, 10)

  const router = useRouter()
  const { selectedAccount, getServer, isDataLoaded } = useMailContext()

  const [email, setEmail] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  // Fetch email detail
  useEffect(() => {
    if (selectedAccount && isDataLoaded && uid) {
      setLoading(true)
      setError('')
      apiCall('email', { folder, uid })
        .then(data => {
          setEmail(data.email)
          // Mark as read
          return apiCall('markRead', { folder, uid })
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Failed to fetch email')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [selectedAccount, isDataLoaded, folder, uid, apiCall])

  const handleBack = () => {
    router.push(`/mail/${encodeURIComponent(folder)}`)
  }

  const handleDelete = async () => {
    try {
      await apiCall('delete', { folder, uid })
      router.push(`/mail/${encodeURIComponent(folder)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete email')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (!isDataLoaded || loading) {
    return <EmailDetailSkeleton />
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Back to list
          </button>
        </div>
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Email not found</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Back to list
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2">
        <button
          onClick={handleBack}
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
          onClick={handleDelete}
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
              {email.subject || '(No Subject)'}
              <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                {folder}
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
              {(email.from.replace(/<.*>/, '').trim() || '?')
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="font-bold text-[#202124] text-sm truncate">
                    {email.from.replace(/<.*>/, '').trim() || 'Unknown'}
                  </span>
                  <span className="text-xs text-[#5f6368] truncate">
                    &lt;
                    {email.from.match(/<.*>/)?.[0]?.replace(/[<>]/g, '') ||
                      email.from}
                    &gt;
                  </span>
                  <button className="text-xs text-[#5f6368] hover:bg-gray-100 p-0.5 rounded">
                    to me ▼
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#5f6368] whitespace-nowrap">
                  <span>
                    {new Date(email.date).toLocaleString([], {
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
            {email.html ? (
              <div
                dangerouslySetInnerHTML={{ __html: email.html }}
                className="prose max-w-none prose-sm"
              />
            ) : (
              <div className="whitespace-pre-wrap font-mono text-sm">
                {email.text || 'No content.'}
              </div>
            )}
          </div>

          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-8 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-medium text-gray-500 mb-3">
                {email.attachments.length} Attachments
              </h4>
              <div className="flex flex-wrap gap-4">
                {email.attachments.map((att, i) => (
                  <div
                    key={i}
                    className="group relative flex items-center gap-3 p-3 bg-[#f5f5f5] rounded-md border border-transparent hover:border-gray-300 hover:shadow-sm w-[200px] cursor-pointer transition-all overflow-hidden"
                  >
                    <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center text-xs font-bold text-red-600 flex-shrink-0">
                      {att.filename.split('.').pop()?.toUpperCase() || 'FILE'}
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
