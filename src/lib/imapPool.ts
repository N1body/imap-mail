import Imap from 'imap'
import { ImapConfig } from './imap'

interface PooledConnection {
  imap: Imap
  config: ImapConfig
  key: string
  inUse: boolean
  lastUsed: number
  createdAt: number
}

interface ConnectionRequest {
  resolve: (imap: Imap) => void
  reject: (error: Error) => void
}

// Connection pool for reusing IMAP connections
class ImapConnectionPool {
  private connections: Map<string, PooledConnection[]> = new Map()
  private pendingRequests: Map<string, ConnectionRequest[]> = new Map()
  private readonly maxIdleTime = 60000 // 60 seconds idle timeout
  private readonly maxConnectionAge = 300000 // 5 minutes max age
  private readonly maxConnectionsPerKey = 2
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Start cleanup timer
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000)
  }

  private getConnectionKey(config: ImapConfig): string {
    return `${config.user}@${config.host}:${config.port}`
  }

  private createConnection(config: ImapConfig): Promise<Imap> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.user,
        password: config.password,
        host: config.host,
        port: config.port,
        tls: config.tls,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 30000,
        connTimeout: 30000,
        keepalive: {
          interval: 10000,
          idleInterval: 300000,
          forceNoop: true,
        },
      })

      const timeout = setTimeout(() => {
        try {
          imap.end()
        } catch {}
        reject(new Error('Connection timeout'))
      }, 30000)

      imap.once('ready', () => {
        clearTimeout(timeout)
        resolve(imap)
      })

      imap.once('error', (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      })

      imap.connect()
    })
  }

  async acquire(config: ImapConfig): Promise<Imap> {
    const key = this.getConnectionKey(config)
    const pool = this.connections.get(key) || []

    // Try to find an available connection
    for (const conn of pool) {
      if (!conn.inUse && this.isConnectionValid(conn)) {
        conn.inUse = true
        conn.lastUsed = Date.now()
        return conn.imap
      }
    }

    // Check if we can create a new connection
    const activeConnections = pool.filter(c => this.isConnectionValid(c)).length
    if (activeConnections < this.maxConnectionsPerKey) {
      // Create new connection
      const imap = await this.createConnection(config)
      const pooledConn: PooledConnection = {
        imap,
        config,
        key,
        inUse: true,
        lastUsed: Date.now(),
        createdAt: Date.now(),
      }

      pool.push(pooledConn)
      this.connections.set(key, pool)

      // Handle connection close/error
      imap.once('end', () => this.removeConnection(pooledConn))
      imap.once('error', () => this.removeConnection(pooledConn))

      return imap
    }

    // All connections are in use, wait for one to become available
    return new Promise((resolve, reject) => {
      const requests = this.pendingRequests.get(key) || []
      requests.push({ resolve, reject })
      this.pendingRequests.set(key, requests)

      // Timeout for waiting
      setTimeout(() => {
        const reqs = this.pendingRequests.get(key) || []
        const index = reqs.findIndex(r => r.reject === reject)
        if (index !== -1) {
          reqs.splice(index, 1)
          reject(new Error('Connection acquisition timeout'))
        }
      }, 30000)
    })
  }

  release(imap: Imap): void {
    for (const [key, pool] of this.connections.entries()) {
      const conn = pool.find(c => c.imap === imap)
      if (conn) {
        conn.inUse = false
        conn.lastUsed = Date.now()

        // Check if there are pending requests
        const requests = this.pendingRequests.get(key)
        if (requests && requests.length > 0) {
          const request = requests.shift()!
          conn.inUse = true
          request.resolve(imap)
        }
        return
      }
    }
  }

  private isConnectionValid(conn: PooledConnection): boolean {
    const now = Date.now()
    // Check if connection is too old or has been idle too long
    if (now - conn.createdAt > this.maxConnectionAge) return false
    if (!conn.inUse && now - conn.lastUsed > this.maxIdleTime) return false
    return true
  }

  private removeConnection(conn: PooledConnection): void {
    const pool = this.connections.get(conn.key)
    if (pool) {
      const index = pool.indexOf(conn)
      if (index !== -1) {
        pool.splice(index, 1)
        try {
          conn.imap.end()
        } catch {}
      }
    }
  }

  private cleanup(): void {
    for (const [key, pool] of this.connections.entries()) {
      const validConnections = pool.filter(conn => {
        if (!this.isConnectionValid(conn)) {
          try {
            conn.imap.end()
          } catch {}
          return false
        }
        return true
      })

      if (validConnections.length === 0) {
        this.connections.delete(key)
      } else {
        this.connections.set(key, validConnections)
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    for (const pool of this.connections.values()) {
      for (const conn of pool) {
        try {
          conn.imap.end()
        } catch {}
      }
    }
    this.connections.clear()
    this.pendingRequests.clear()
  }
}

// Singleton instance
export const imapPool = new ImapConnectionPool()

// Helper function to use pooled connection with auto-release
export async function withPooledConnection<T>(
  config: ImapConfig,
  operation: (imap: Imap) => Promise<T>
): Promise<T> {
  const imap = await imapPool.acquire(config)
  try {
    return await operation(imap)
  } finally {
    imapPool.release(imap)
  }
}
