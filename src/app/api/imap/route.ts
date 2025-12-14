import { NextRequest, NextResponse } from 'next/server'
import {
  testConnection,
  getFolders,
  getEmails,
  getEmailByUid,
  deleteEmail,
  deleteEmails,
  markAsRead,
  searchEmails,
  ImapConfig,
} from '@/lib/imap'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config, folder, uid, limit, offset, query } = body

    if (
      !config ||
      !config.user ||
      !config.password ||
      !config.host ||
      !config.port
    ) {
      return NextResponse.json(
        { error: 'Missing IMAP configuration' },
        { status: 400 }
      )
    }

    const imapConfig: ImapConfig = {
      user: config.user,
      password: config.password,
      host: config.host,
      port: parseInt(config.port),
      tls: config.tls !== false,
    }

    switch (action) {
      case 'test': {
        const result = await testConnection(imapConfig)
        return NextResponse.json({ success: result })
      }

      case 'folders': {
        const folders = await getFolders(imapConfig)
        return NextResponse.json({ folders })
      }

      case 'emails': {
        if (!folder) {
          return NextResponse.json(
            { error: 'Folder is required' },
            { status: 400 }
          )
        }
        const result = await getEmails(
          imapConfig,
          folder,
          limit || 25,
          offset || 0
        )
        return NextResponse.json(result)
      }

      case 'search': {
        if (!folder) {
          return NextResponse.json(
            { error: 'Folder is required' },
            { status: 400 }
          )
        }
        if (!query) {
          return NextResponse.json(
            { error: 'Search query is required' },
            { status: 400 }
          )
        }
        const searchResult = await searchEmails(
          imapConfig,
          folder,
          query,
          limit || 25,
          offset || 0
        )
        return NextResponse.json(searchResult)
      }

      case 'email': {
        if (!folder || !uid) {
          return NextResponse.json(
            { error: 'Folder and UID are required' },
            { status: 400 }
          )
        }
        const email = await getEmailByUid(imapConfig, folder, parseInt(uid))
        if (!email) {
          return NextResponse.json(
            { error: 'Email not found' },
            { status: 404 }
          )
        }
        return NextResponse.json({ email })
      }

      case 'delete': {
        if (!folder) {
          return NextResponse.json(
            { error: 'Folder is required' },
            { status: 400 }
          )
        }

        const { uids } = body
        if (uids && Array.isArray(uids)) {
          await deleteEmails(imapConfig, folder, uids)
        } else if (uid) {
          await deleteEmail(imapConfig, folder, parseInt(uid))
        } else {
          return NextResponse.json(
            { error: 'UID or UIDs are required' },
            { status: 400 }
          )
        }

        return NextResponse.json({ success: true })
      }

      case 'markRead': {
        if (!folder || !uid) {
          return NextResponse.json(
            { error: 'Folder and UID are required' },
            { status: 400 }
          )
        }
        await markAsRead(imapConfig, folder, parseInt(uid))
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('IMAP API Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
