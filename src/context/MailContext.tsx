'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { ImapServer, ImapAccount, Folder } from '@/types'

interface MailContextType {
  // Servers
  servers: ImapServer[]
  addServer: (server: Omit<ImapServer, 'id'>) => void
  removeServer: (id: string) => boolean
  getServer: (id: string) => ImapServer | undefined

  // Accounts
  accounts: ImapAccount[]
  selectedAccount: ImapAccount | null
  setSelectedAccount: (account: ImapAccount | null) => void
  addAccount: (account: Omit<ImapAccount, 'id'>) => void
  removeAccount: (id: string) => void

  // Folders
  folders: Folder[]
  setFolders: (folders: Folder[]) => void

  // Loading state
  isDataLoaded: boolean
}

const MailContext = createContext<MailContextType | null>(null)

export function MailProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ImapServer[]>([])
  const [accounts, setAccounts] = useState<ImapAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<ImapAccount | null>(
    null
  )
  const [folders, setFolders] = useState<Folder[]>([])
  const [isDataLoaded, setIsDataLoaded] = useState(false)

  // Load data from localStorage
  useEffect(() => {
    const savedServers = localStorage.getItem('imap-servers')
    if (savedServers) {
      const parsed = JSON.parse(savedServers)
      if (parsed.length > 0) {
        setServers(parsed)
      }
    }

    const savedAccounts = localStorage.getItem('imap-accounts-v2')
    if (savedAccounts) {
      const parsed = JSON.parse(savedAccounts)
      setAccounts(parsed)
      if (parsed.length > 0) {
        // Try to restore previously selected account
        const savedSelectedId = localStorage.getItem('imap-selected-account-id')
        const savedSelected = savedSelectedId
          ? parsed.find((a: ImapAccount) => a.id === savedSelectedId)
          : null
        setSelectedAccount(savedSelected || parsed[0])
      }
    }

    setIsDataLoaded(true)
  }, [])

  // Save servers to localStorage
  useEffect(() => {
    if (!isDataLoaded) return
    if (servers.length > 0) {
      localStorage.setItem('imap-servers', JSON.stringify(servers))
    } else {
      localStorage.removeItem('imap-servers')
    }
  }, [servers, isDataLoaded])

  // Save accounts to localStorage
  useEffect(() => {
    if (!isDataLoaded) return
    if (accounts.length > 0) {
      localStorage.setItem('imap-accounts-v2', JSON.stringify(accounts))
    } else {
      localStorage.removeItem('imap-accounts-v2')
    }
  }, [accounts, isDataLoaded])

  // Save selected account ID to localStorage
  useEffect(() => {
    if (!isDataLoaded) return
    if (selectedAccount) {
      localStorage.setItem('imap-selected-account-id', selectedAccount.id)
    } else {
      localStorage.removeItem('imap-selected-account-id')
    }
  }, [selectedAccount, isDataLoaded])

  const getServer = useCallback(
    (serverId: string): ImapServer | undefined => {
      return servers.find(s => s.id === serverId)
    },
    [servers]
  )

  const addServer = useCallback((server: Omit<ImapServer, 'id'>) => {
    const newServer: ImapServer = {
      ...server,
      id: Date.now().toString(),
    }
    setServers(prev => [...prev, newServer])
  }, [])

  const removeServer = useCallback(
    (id: string): boolean => {
      const usedByAccounts = accounts.some(a => a.serverId === id)
      if (usedByAccounts) {
        return false
      }
      setServers(prev => prev.filter(s => s.id !== id))
      return true
    },
    [accounts]
  )

  const addAccount = useCallback(
    (account: Omit<ImapAccount, 'id'>) => {
      const newAccount: ImapAccount = {
        ...account,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }
      setAccounts(prev => [...prev, newAccount])
      if (!selectedAccount) {
        setSelectedAccount(newAccount)
      }
    },
    [selectedAccount]
  )

  const removeAccount = useCallback(
    (id: string) => {
      setAccounts(prev => {
        const updated = prev.filter(a => a.id !== id)
        if (selectedAccount?.id === id) {
          setSelectedAccount(updated[0] || null)
        }
        return updated
      })
    },
    [selectedAccount]
  )

  return (
    <MailContext.Provider
      value={{
        servers,
        addServer,
        removeServer,
        getServer,
        accounts,
        selectedAccount,
        setSelectedAccount,
        addAccount,
        removeAccount,
        folders,
        setFolders,
        isDataLoaded,
      }}
    >
      {children}
    </MailContext.Provider>
  )
}

export function useMailContext() {
  const context = useContext(MailContext)
  if (!context) {
    throw new Error('useMailContext must be used within a MailProvider')
  }
  return context
}
