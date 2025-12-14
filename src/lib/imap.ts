import Imap from 'imap'
import { simpleParser, ParsedMail } from 'mailparser'

// Extend Imap types to include envelope
interface ImapEnvelope {
  date?: string
  subject?: string
  from?: Array<{ name?: string; mailbox?: string; host?: string }>
  to?: Array<{ name?: string; mailbox?: string; host?: string }>
  cc?: Array<{ name?: string; mailbox?: string; host?: string }>
  bcc?: Array<{ name?: string; mailbox?: string; host?: string }>
  'message-id'?: string
}

interface ImapMessageAttributesWithEnvelope extends Imap.ImapMessageAttributes {
  envelope?: ImapEnvelope
}

export interface ImapConfig {
  user: string
  password: string
  host: string
  port: number
  tls: boolean
}

export interface EmailSummary {
  uid: number
  subject: string
  from: string
  to: string
  date: string
  seen: boolean
  hasAttachments: boolean
  snippet: string
}

export interface EmailDetail extends EmailSummary {
  html: string | null
  text: string | null
  attachments: Array<{
    filename: string
    contentType: string
    size: number
  }>
}

export interface FolderInfo {
  name: string
  path: string
  messageCount: number
}

function createImapConnection(config: ImapConfig): Imap {
  return new Imap({
    user: config.user,
    password: config.password,
    host: config.host,
    port: config.port,
    tls: config.tls,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 30000,
    connTimeout: 30000,
  })
}

// Clean sender name by removing quotes (various types)
function cleanSenderName(name: string): string {
  return name
    .replace(/["'""''「」『』«»‹›]/g, '') // Remove all types of quotes
    .trim()
}

// Decode quoted-printable encoded string
function decodeQuotedPrintable(text: string): string {
  return (
    text
      // Handle soft line breaks (= at end of line)
      .replace(/=\r?\n/g, '')
      // Decode =XX hex sequences
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16))
      })
  )
}

// Clean snippet by removing image placeholders, URLs, and other noise
function cleanSnippet(text: string): string {
  let cleaned = text

  // First, filter out MIME boundaries and headers
  cleaned = cleaned
    .replace(/--+[=_]?[A-Za-z0-9._-]+/g, '') // MIME boundaries like ------=_NextPart_xxx
    .replace(/Content-Type:[^\n]+/gi, '') // Content-Type headers
    .replace(/Content-Transfer-Encoding:[^\n]+/gi, '') // Content-Transfer-Encoding headers
    .replace(/charset=[^\s;]+/gi, '') // charset declarations
    .replace(/boundary=[^\s]+/gi, '') // boundary declarations

  // Check if it looks like quoted-printable (has =XX patterns)
  if (/=[0-9A-Fa-f]{2}/.test(cleaned)) {
    try {
      const decoded = decodeQuotedPrintable(cleaned)
      // Decode as UTF-8 if it's byte sequences
      const bytes = []
      for (let i = 0; i < decoded.length; i++) {
        bytes.push(decoded.charCodeAt(i))
      }
      // Try to interpret as UTF-8
      const utf8Decoded = Buffer.from(bytes).toString('utf8')
      if (utf8Decoded && !/\uFFFD/.test(utf8Decoded.substring(0, 50))) {
        cleaned = utf8Decoded
      } else {
        cleaned = decoded
      }
    } catch {
      // Keep original if decode fails
    }
  }

  // Try to detect and decode base64 content
  // Base64 pattern: only letters, numbers, +, /, = and whitespace
  const base64Pattern = /^[A-Za-z0-9+/=\s]+$/
  const trimmedText = cleaned.replace(/\s/g, '')

  if (base64Pattern.test(cleaned) && trimmedText.length > 20) {
    try {
      const decoded = Buffer.from(trimmedText, 'base64').toString('utf8')
      // Check if decoded text is readable (mostly ASCII printable)
      if (/^[\x20-\x7E\u00A0-\uFFFF\s]+$/.test(decoded.substring(0, 100))) {
        cleaned = decoded
      }
    } catch {
      // Not valid base64, use original
    }
  }

  return cleaned
    .replace(/\[image:[^\]]*\]/gi, '') // Remove [image: xxx] placeholders
    .replace(/\[cid:[^\]]*\]/gi, '') // Remove [cid: xxx] placeholders
    .replace(/<https?:\/\/[^>]+>/g, '') // Remove <https://...> URLs
    .replace(/https?:\/\/\S+/g, '') // Remove plain URLs
    .replace(/[­]/g, '') // Remove soft hyphens
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 150)
}

export function testConnection(config: ImapConfig): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)

    const timeout = setTimeout(() => {
      try {
        imap.end()
      } catch {}
      reject(new Error('Connection timeout'))
    }, 30000)

    imap.once('ready', () => {
      clearTimeout(timeout)
      imap.end()
      resolve(true)
    })

    imap.once('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    imap.connect()
  })
}

export function getFolders(config: ImapConfig): Promise<FolderInfo[]> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)
    const folders: FolderInfo[] = []

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        if (err) {
          imap.end()
          return reject(err)
        }

        const processBoxes = (boxObj: Imap.MailBoxes, parentPath = '') => {
          for (const name in boxObj) {
            const box = boxObj[name]
            const fullPath = parentPath
              ? `${parentPath}${box.delimiter}${name}`
              : name
            folders.push({
              name: name,
              path: fullPath,
              messageCount: 0,
            })
            if (box.children) {
              processBoxes(box.children, fullPath)
            }
          }
        }

        processBoxes(boxes)
        imap.end()
        resolve(folders)
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.connect()
  })
}

export interface EmailsResult {
  emails: EmailSummary[]
  total: number
  hasMore: boolean
}

// Helper to check if BODYSTRUCTURE indicates attachments
function hasAttachmentsFromStruct(struct: unknown): boolean {
  if (!struct) return false

  const checkPart = (part: unknown): boolean => {
    if (!part) return false
    if (Array.isArray(part)) {
      return part.some(p => checkPart(p))
    }
    if (typeof part === 'object' && part !== null) {
      const p = part as Record<string, unknown>
      // Check disposition for 'attachment'
      if (p.disposition && typeof p.disposition === 'object') {
        const disp = p.disposition as Record<string, unknown>
        if (disp.type && String(disp.type).toLowerCase() === 'attachment') {
          return true
        }
      }
      // Check if it's a non-text/non-html part with a filename
      if (p.params && typeof p.params === 'object') {
        const params = p.params as Record<string, unknown>
        if (params.name) return true
      }
      // Recurse into subparts
      if (Array.isArray(p)) {
        return p.some(sub => checkPart(sub))
      }
    }
    return false
  }

  return checkPart(struct)
}

// Helper to format envelope address
function formatEnvelopeAddress(addr: unknown): string {
  if (!addr) return 'Unknown'
  if (!Array.isArray(addr)) return 'Unknown'

  const addresses = addr
    .map((a: unknown) => {
      if (!a || typeof a !== 'object') return ''
      const addrObj = a as { name?: string; mailbox?: string; host?: string }
      const name = addrObj.name || ''
      const mailbox = addrObj.mailbox || ''
      const host = addrObj.host || ''
      const email = `${mailbox}@${host}`

      if (name) {
        return cleanSenderName(`${name} <${email}>`)
      }
      return email
    })
    .filter(a => a)

  return addresses.join(', ') || 'Unknown'
}

export function getEmails(
  config: ImapConfig,
  folder: string,
  limit: number = 25,
  offset: number = 0
): Promise<EmailsResult> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)
    const emails: EmailSummary[] = []

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end()
          return reject(err)
        }

        const totalMessages = box.messages.total
        if (totalMessages === 0) {
          imap.end()
          return resolve({ emails: [], total: 0, hasMore: false })
        }

        // Calculate range from the end (newest first)
        const end = Math.max(1, totalMessages - offset)
        const start = Math.max(1, end - limit + 1)

        if (end < 1 || start > totalMessages) {
          imap.end()
          return resolve({ emails: [], total: totalMessages, hasMore: false })
        }

        const fetchRange = `${start}:${end}`
        const hasMore = start > 1

        // OPTIMIZED: Fetch envelope + first body part for snippet
        // BODY[1] typically contains the text/plain content
        const fetch = imap.seq.fetch(fetchRange, {
          envelope: true,
          struct: true,
          bodies: ['1'],
          markSeen: false,
        })

        fetch.on('message', msg => {
          let attrs: ImapMessageAttributesWithEnvelope | null = null
          let bodyText = ''

          msg.on('body', stream => {
            let data = ''
            let bytesRead = 0
            const maxBytes = 500 // Limit to first 500 bytes for snippet

            stream.on('data', (chunk: Buffer) => {
              if (bytesRead < maxBytes) {
                const remaining = maxBytes - bytesRead
                const toRead = Math.min(chunk.length, remaining)
                data += chunk.slice(0, toRead).toString('utf8')
                bytesRead += toRead
              }
            })

            stream.once('end', () => {
              bodyText = data
            })
          })

          msg.once('attributes', a => {
            attrs = a
          })

          msg.once('end', () => {
            if (!attrs) return

            const envelope = attrs.envelope
            const flags = attrs.flags || []

            // Parse envelope for email metadata
            const subject = envelope?.subject || '(No Subject)'
            const from = formatEnvelopeAddress(envelope?.from)
            const to = formatEnvelopeAddress(envelope?.to)
            const dateStr = envelope?.date
            let date: string
            try {
              date = dateStr
                ? new Date(dateStr).toISOString()
                : new Date().toISOString()
            } catch {
              date = new Date().toISOString()
            }

            // Clean snippet from body text
            const snippet = cleanSnippet(
              bodyText
                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&[a-z]+;/gi, ' ')
            )

            emails.push({
              uid: attrs.uid || 0,
              subject,
              from,
              to,
              date,
              seen: flags.includes('\\Seen'),
              hasAttachments: hasAttachmentsFromStruct(attrs.struct),
              snippet,
            })
          })
        })

        fetch.once('error', fetchErr => {
          imap.end()
          reject(fetchErr)
        })

        fetch.once('end', () => {
          imap.end()
          // Sort by UID descending (newest first)
          emails.sort((a, b) => b.uid - a.uid)
          resolve({ emails, total: totalMessages, hasMore })
        })
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.connect()
  })
}

export function searchEmails(
  config: ImapConfig,
  folder: string,
  query: string,
  limit: number = 25,
  offset: number = 0
): Promise<EmailsResult> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end()
          return reject(err)
        }

        const totalMessages = box.messages.total
        if (totalMessages === 0) {
          imap.end()
          return resolve({ emails: [], total: 0, hasMore: false })
        }

        // Use SUBJECT search - most commonly supported
        const searchCriteria: (string | string[])[] = [['SUBJECT', query]]

        const processSearchResults = (results: number[] | null) => {
          if (!results || results.length === 0) {
            imap.end()
            return resolve({ emails: [], total: 0, hasMore: false })
          }

          // Sort results descending (newest first) before pagination
          const sortedResults = [...results].sort((a, b) => b - a)
          const totalResults = sortedResults.length

          // Apply offset and limit for pagination
          const paginatedResults = sortedResults.slice(offset, offset + limit)
          const hasMore = offset + limit < totalResults

          if (paginatedResults.length === 0) {
            imap.end()
            return resolve({ emails: [], total: totalResults, hasMore: false })
          }

          const emails: EmailSummary[] = []

          // OPTIMIZED: Fetch envelope + first body part for snippet
          const fetch = imap.fetch(paginatedResults, {
            envelope: true,
            struct: true,
            bodies: ['1'],
            markSeen: false,
          })

          fetch.on('message', msg => {
            let attrs: ImapMessageAttributesWithEnvelope | null = null
            let bodyText = ''

            msg.on('body', stream => {
              let data = ''
              let bytesRead = 0
              const maxBytes = 500

              stream.on('data', (chunk: Buffer) => {
                if (bytesRead < maxBytes) {
                  const remaining = maxBytes - bytesRead
                  const toRead = Math.min(chunk.length, remaining)
                  data += chunk.slice(0, toRead).toString('utf8')
                  bytesRead += toRead
                }
              })

              stream.once('end', () => {
                bodyText = data
              })
            })

            msg.once('attributes', a => {
              attrs = a as ImapMessageAttributesWithEnvelope
            })

            msg.once('end', () => {
              if (!attrs) return

              const envelope = attrs.envelope
              const flags = attrs.flags || []

              const subject = envelope?.subject || '(No Subject)'
              const from = formatEnvelopeAddress(envelope?.from)
              const to = formatEnvelopeAddress(envelope?.to)
              const dateStr = envelope?.date
              let date: string
              try {
                date = dateStr
                  ? new Date(dateStr).toISOString()
                  : new Date().toISOString()
              } catch {
                date = new Date().toISOString()
              }

              const snippet = cleanSnippet(
                bodyText
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&[a-z]+;/gi, ' ')
              )

              emails.push({
                uid: attrs.uid || 0,
                subject,
                from,
                to,
                date,
                seen: flags.includes('\\Seen'),
                hasAttachments: hasAttachmentsFromStruct(attrs.struct),
                snippet,
              })
            })
          })

          fetch.once('error', fetchErr => {
            imap.end()
            reject(fetchErr)
          })

          fetch.once('end', () => {
            imap.end()
            // Sort by UID descending (newest first)
            emails.sort((a, b) => b.uid - a.uid)
            resolve({
              emails,
              total: totalResults,
              hasMore,
            })
          })
        }

        imap.search(searchCriteria, (searchErr, results) => {
          if (searchErr) {
            // If subject search fails, try a TEXT search as fallback
            imap.search([['TEXT', query]], (textErr, textResults) => {
              if (textErr) {
                imap.end()
                return reject(textErr)
              }
              processSearchResults(textResults)
            })
            return
          }
          processSearchResults(results)
        })
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.connect()
  })
}

export function getEmailByUid(
  config: ImapConfig,
  folder: string,
  uid: number
): Promise<EmailDetail | null> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)

    imap.once('ready', () => {
      imap.openBox(folder, true, err => {
        if (err) {
          imap.end()
          return reject(err)
        }

        const fetch = imap.fetch(uid, {
          bodies: '',
          struct: true,
        })

        const emailContent: Buffer[] = []
        let attrs: Imap.ImapMessageAttributes | null = null

        fetch.on('message', msg => {
          msg.on('body', stream => {
            stream.on('data', (chunk: Buffer) => {
              emailContent.push(chunk)
            })
          })

          msg.once('attributes', a => {
            attrs = a
          })
        })

        fetch.once('error', fetchErr => {
          imap.end()
          reject(fetchErr)
        })

        fetch.once('end', async () => {
          imap.end()

          if (emailContent.length === 0) {
            return resolve(null)
          }

          try {
            const rawEmail = Buffer.concat(emailContent)
            const parsed: ParsedMail = await simpleParser(rawEmail)

            const flags = attrs?.flags || []

            const email: EmailDetail = {
              uid,
              subject: parsed.subject || '(No Subject)',
              from: cleanSenderName(parsed.from?.text || 'Unknown'),
              to: parsed.to
                ? Array.isArray(parsed.to)
                  ? parsed.to.map(t => t.text).join(', ')
                  : parsed.to.text
                : 'Unknown',
              date: parsed.date?.toISOString() || new Date().toISOString(),
              seen: flags.includes('\\Seen'),
              hasAttachments: (parsed.attachments?.length || 0) > 0,
              html: parsed.html || null,
              text: parsed.text || null,
              snippet: cleanSnippet(parsed.text || ''),
              attachments: (parsed.attachments || []).map(att => ({
                filename: att.filename || 'unknown',
                contentType: att.contentType || 'application/octet-stream',
                size: att.size || 0,
              })),
            }

            resolve(email)
          } catch (parseError) {
            reject(parseError)
          }
        })
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.connect()
  })
}

export function deleteEmails(
  config: ImapConfig,
  folder: string,
  uids: number[]
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)

    imap.once('ready', () => {
      imap.openBox(folder, false, err => {
        if (err) {
          imap.end()
          return reject(err)
        }

        if (uids.length === 0) {
          imap.end()
          return resolve(true)
        }

        imap.addFlags(uids, '\\Deleted', flagErr => {
          if (flagErr) {
            imap.end()
            return reject(flagErr)
          }

          imap.expunge(expErr => {
            imap.end()
            if (expErr) {
              return reject(expErr)
            }
            resolve(true)
          })
        })
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.connect()
  })
}

export function deleteEmail(
  config: ImapConfig,
  folder: string,
  uid: number
): Promise<boolean> {
  return deleteEmails(config, folder, [uid])
}

export function markAsRead(
  config: ImapConfig,
  folder: string,
  uid: number
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config)

    imap.once('ready', () => {
      imap.openBox(folder, false, err => {
        if (err) {
          imap.end()
          return reject(err)
        }

        imap.addFlags(uid, '\\Seen', flagErr => {
          imap.end()
          if (flagErr) {
            return reject(flagErr)
          }
          resolve(true)
        })
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.connect()
  })
}
