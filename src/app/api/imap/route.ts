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
  getAttachment,
  ImapConfig,
} from '@/lib/imap'
import { getAccessToken, generateXOAuth2String } from '@/lib/oauth2'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config, folder, uid, limit, offset, query } = body

    // Validate required fields
    const isOAuth2 = config?.authType === 'oauth2'

    if (!config || !config.user || !config.host || !config.port) {
      return NextResponse.json(
        { error: 'Missing IMAP configuration' },
        { status: 400 }
      )
    }

    // For password auth, require password; for OAuth2, require refreshToken and clientId
    if (!isOAuth2 && !config.password) {
      return NextResponse.json(
        { error: 'Missing password for password authentication' },
        { status: 400 }
      )
    }

    if (isOAuth2 && (!config.refreshToken || !config.clientId)) {
      return NextResponse.json(
        { error: 'Missing refreshToken or clientId for OAuth2 authentication' },
        { status: 400 }
      )
    }

    // Build ImapConfig
    let xoauth2: string | undefined

    // If OAuth2, get access token and generate XOAUTH2 string
    if (isOAuth2) {
      try {
        const accessToken = await getAccessToken(
          config.refreshToken,
          config.clientId
        )
        xoauth2 = generateXOAuth2String(config.user, accessToken)
      } catch (tokenError) {
        console.error('OAuth2 token error:', tokenError)
        return NextResponse.json(
          {
            error:
              tokenError instanceof Error
                ? tokenError.message
                : 'OAuth2 token refresh failed',
          },
          { status: 401 }
        )
      }
    }

    const imapConfig: ImapConfig = {
      user: config.user,
      password: config.password || '',
      host: config.host,
      port: parseInt(config.port),
      tls: config.tls !== false,
      xoauth2,
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

      case 'attachment': {
        if (!folder || !uid) {
          return NextResponse.json(
            { error: 'Folder and UID are required' },
            { status: 400 }
          )
        }
        const { attachmentIndex } = body
        if (typeof attachmentIndex !== 'number') {
          return NextResponse.json(
            { error: 'Attachment index is required' },
            { status: 400 }
          )
        }
        const attachment = await getAttachment(
          imapConfig,
          folder,
          parseInt(uid),
          attachmentIndex
        )
        if (!attachment) {
          return NextResponse.json(
            { error: 'Attachment not found' },
            { status: 404 }
          )
        }
        return NextResponse.json({ attachment })
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
