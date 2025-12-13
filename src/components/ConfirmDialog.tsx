'use client'

import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmStyle = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the dialog when it opens for accessibility
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-white/10 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            {confirmStyle === 'danger' && (
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-red-400"
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
              </div>
            )}
            {confirmStyle === 'primary' && (
              <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-violet-400"
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
              </div>
            )}
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-white/70">{message}</p>
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg ${
              confirmStyle === 'danger'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
