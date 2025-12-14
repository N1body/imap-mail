'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  isVisible: boolean
  onClose: () => void
  duration?: number
  type?: 'success' | 'error' | 'info'
}

export default function Toast({
  message,
  isVisible,
  onClose,
  duration = 2000,
  type = 'success',
}: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isVisible, duration, onClose])

  if (!isVisible) return null

  const styles = {
    success: {
      bg: 'bg-white',
      border: 'border-green-200',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      textColor: 'text-gray-900',
    },
    error: {
      bg: 'bg-white',
      border: 'border-red-200',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      textColor: 'text-gray-900',
    },
    info: {
      bg: 'bg-white',
      border: 'border-blue-200',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      textColor: 'text-gray-900',
    },
  }[type]

  const icon = {
    success: (
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
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    error: (
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
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    info: (
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
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  }[type]

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
      <div
        className={`flex items-center gap-3 px-5 py-3 ${styles.bg} border ${styles.border} rounded-xl shadow-lg`}
      >
        <div
          className={`w-8 h-8 rounded-full ${styles.iconBg} ${styles.iconColor} flex items-center justify-center`}
        >
          {icon}
        </div>
        <span className={`text-sm font-medium ${styles.textColor}`}>
          {message}
        </span>
      </div>
    </div>
  )
}
