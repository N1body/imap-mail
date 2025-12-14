export interface ImapServer {
  id: string
  name: string
  host: string
  port: number
  tls: boolean
}

export interface ImapAccount {
  id: string
  name: string
  email: string
  serverId: string
  password: string
}

export interface Folder {
  name: string
  path: string
  messageCount: number
}

export interface Email {
  uid: number
  subject: string
  from: string
  to: string
  date: string
  seen: boolean
  hasAttachments: boolean
  snippet: string
}

export interface EmailDetail extends Email {
  html: string | null
  text: string | null
  attachments: Array<{
    filename: string
    contentType: string
    size: number
  }>
}
