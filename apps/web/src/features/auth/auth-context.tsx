import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, jsonBody, refreshSession, setAccessToken, setSessionLostHandler, type AuthSession } from '@/lib/api'

export type AuthUser = AuthSession['user']

/** Rol y permisos efectivos del usuario en una planta (GET /auth/me). */
export type PlantAccess = {
  plantId: string
  slug: string
  name: string
  roles: string[]
  permissions: string[]
}

type Status = 'loading' | 'anonymous' | 'authenticated'

export type AuthContextValue = {
  status: Status
  user: AuthUser | null
  access: PlantAccess[]
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Solo una pista para no pedir refresh (y recibir un 401) a cada visitante anónimo. No es un secreto.
const SESSION_HINT = 'fur.session'
const setHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SESSION_HINT, '1')
    else localStorage.removeItem(SESSION_HINT)
  } catch {
    /* almacenamiento no disponible */
  }
}
const hasHint = () => {
  try {
    return localStorage.getItem(SESSION_HINT) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [access, setAccess] = useState<PlantAccess[]>([])

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setHint(false)
    setUser(null)
    setAccess([])
    setStatus('anonymous')
    // Nunca conservar datos de un usuario al cambiar de identidad.
    queryClient.clear()
  }, [queryClient])

  const loadMe = useCallback(async () => {
    const me = await api<{ user: AuthUser; plants: PlantAccess[] }>('/auth/me')
    setUser(me.user)
    setAccess(me.plants)
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    setSessionLostHandler(clearSession)
    return () => setSessionLostHandler(null)
  }, [clearSession])

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      if (!hasHint()) return setStatus('anonymous')
      const session = await refreshSession()
      if (cancelled) return
      if (!session) return clearSession()
      try {
        await loadMe()
      } catch {
        if (!cancelled) clearSession()
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [clearSession, loadMe])

  const start = useCallback(
    async (session: AuthSession) => {
      queryClient.clear()
      setAccessToken(session.accessToken)
      setHint(true)
      await loadMe()
    },
    [queryClient, loadMe],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      await start(await api<AuthSession>('/auth/login', { method: 'POST', ...jsonBody({ email, password }) }))
    },
    [start],
  )

  const register = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string }) => {
      await start(await api<AuthSession>('/auth/register', { method: 'POST', ...jsonBody(input) }))
    },
    [start],
  )

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
    }
  }, [clearSession])

  const value = useMemo(
    () => ({ status, user, access, login, register, logout }),
    [status, user, access, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
