import Imap from 'imap'
import { simpleParser, ParsedMail } from 'mailparser'

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

export function getEmails(
  config: ImapConfig,
  folder: string,
  limit: number = 50,
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
        // offset 0 = last 'limit' messages
        // offset 50 = messages before that, etc.
        const end = Math.max(1, totalMessages - offset)
        const start = Math.max(1, end - limit + 1)

        if (end < 1 || start > totalMessages) {
          imap.end()
          return resolve({ emails: [], total: totalMessages, hasMore: false })
        }

        const fetchRange = `${start}:${end}`
        const hasMore = start > 1

        const fetch = imap.seq.fetch(fetchRange, {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
          struct: true,
        })

        fetch.on('message', (msg, seqno) => {
          let uid = seqno
          const header: Buffer[] = []
          let attrs: Imap.ImapMessageAttributes | null = null

          msg.on('body', stream => {
            stream.on('data', (chunk: Buffer) => {
              header.push(chunk)
            })
          })

          msg.once('attributes', a => {
            attrs = a
            uid = a.uid
          })

          msg.once('end', () => {
            const headerStr = Buffer.concat(header).toString('utf8')
            const headerLines = headerStr.split(/\r?\n/)
            let subject = ''
            let from = ''
            let to = ''
            let date = ''

            for (const line of headerLines) {
              if (line.toLowerCase().startsWith('subject:')) {
                subject = line.substring(8).trim()
              } else if (line.toLowerCase().startsWith('from:')) {
                from = line.substring(5).trim()
              } else if (line.toLowerCase().startsWith('to:')) {
                to = line.substring(3).trim()
              } else if (line.toLowerCase().startsWith('date:')) {
                date = line.substring(5).trim()
              }
            }

            const flags = attrs?.flags || []
            const struct = attrs?.struct || []

            emails.push({
              uid,
              subject: subject || '(No Subject)',
              from: from || 'Unknown',
              to: to || 'Unknown',
              date: date || new Date().toISOString(),
              seen: flags.includes('\\Seen'),
              hasAttachments: JSON.stringify(struct).includes('attachment'),
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
  limit: number = 50,
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

          const fetch = imap.fetch(paginatedResults, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
            struct: true,
          })

          fetch.on('message', msg => {
            let uid = 0
            const header: Buffer[] = []
            let attrs: Imap.ImapMessageAttributes | null = null

            msg.on('body', stream => {
              stream.on('data', (chunk: Buffer) => {
                header.push(chunk)
              })
            })

            msg.once('attributes', a => {
              attrs = a
              uid = a.uid
            })

            msg.once('end', () => {
              const headerStr = Buffer.concat(header).toString('utf8')
              const headerLines = headerStr.split(/\r?\n/)
              let subject = ''
              let from = ''
              let to = ''
              let date = ''

              for (const line of headerLines) {
                if (line.toLowerCase().startsWith('subject:')) {
                  subject = line.substring(8).trim()
                } else if (line.toLowerCase().startsWith('from:')) {
                  from = line.substring(5).trim()
                } else if (line.toLowerCase().startsWith('to:')) {
                  to = line.substring(3).trim()
                } else if (line.toLowerCase().startsWith('date:')) {
                  date = line.substring(5).trim()
                }
              }

              const flags = attrs?.flags || []
              const struct = attrs?.struct || []

              emails.push({
                uid,
                subject: subject || '(No Subject)',
                from: from || 'Unknown',
                to: to || 'Unknown',
                date: date || new Date().toISOString(),
                seen: flags.includes('\\Seen'),
                hasAttachments: JSON.stringify(struct).includes('attachment'),
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
              from: parsed.from?.text || 'Unknown',
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

export function deleteEmail(
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

        imap.addFlags(uid, '\\Deleted', flagErr => {
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
