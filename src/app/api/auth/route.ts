import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const SESSION_NAME = 'imap_admin_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Store active sessions (in production, use a database or KV store)
const activeSessions = new Set<string>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = body

    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD environment variable is not set')
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 })
    }

    if (!password || password !== adminPassword) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 })
    }

    // Generate session token
    const sessionToken = generateSessionToken()
    activeSessions.add(sessionToken)

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set(SESSION_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_NAME)?.value

    if (sessionToken) {
      activeSessions.delete(sessionToken)
    }

    cookieStore.delete(SESSION_NAME)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: '退出失败' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_NAME)?.value

    if (sessionToken && activeSessions.has(sessionToken)) {
      return NextResponse.json({ authenticated: true })
    }

    return NextResponse.json({ authenticated: false }, { status: 401 })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}

// Export the session set for use in middleware
export { activeSessions, SESSION_NAME }
