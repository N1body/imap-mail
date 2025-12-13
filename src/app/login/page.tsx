'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error || '登录失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '40px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '8px',
            }}
          >
            IMAP Mail Manager
          </h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
            请输入管理员密码
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="管理员密码"
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: '16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: '#fff',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.target.style.borderColor = '#667eea'
                e.target.style.background = 'rgba(255, 255, 255, 0.12)'
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '14px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '14px 24px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#fff',
              background:
                loading || !password
                  ? 'rgba(102, 126, 234, 0.4)'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '10px',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow:
                loading || !password
                  ? 'none'
                  : '0 4px 15px rgba(102, 126, 234, 0.4)',
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
