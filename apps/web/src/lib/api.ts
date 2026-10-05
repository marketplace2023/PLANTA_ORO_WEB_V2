const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  /** Errores de validación por campo, si el backend los envía. */
  fieldErrors: Array<{ path: string; message: string }>

  constructor(status: number, message: string, fieldErrors: Array<{ path: string; message: string }> = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export type AuthSession = {
  accessToken: string
  expiresIn: number
  user: { id: string; email: string; firstName: string; lastName: string; isGlobalAdmin: boolean }
}

// El access token vive solo en memoria (no en localStorage): un XSS no puede robarlo para usarlo después.
// El refresh token es una cookie httpOnly que el JavaScript nunca ve.
let accessToken: string | null = null
let onSessionLost: (() => void) | null = null

export const setAccessToken = (token: string | null) => {
  accessToken = token
}

/** Se invoca cuando la sesión caducó y no se pudo renovar. */
export const setSessionLostHandler = (handler: (() => void) | null) => {
  onSessionLost = handler
}

let refreshing: Promise<AuthSession | null> | null = null

/**
 * Renueva la sesión con la cookie de refresh. Una sola petición a la vez: el backend rota el token y
 * trata la reutilización de uno viejo como robo, así que dos refrescos simultáneos cerrarían la sesión.
 */
export function refreshSession(): Promise<AuthSession | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) return null
      const session = (await res.json()) as AuthSession
      accessToken = session.accessToken
      return session
    } catch {
      return null
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** Petición con sesión: adjunta el token, renueva una vez ante un 401 y lanza ApiError si no es 2xx. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        // Con FormData el navegador fija multipart/form-data con su boundary; forzar un tipo lo rompería.
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    })

  let res = await send()

  // Token expirado: renovar una vez y reintentar. Las rutas /auth/* gestionan su propia sesión.
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const session = await refreshSession()
    if (session) {
      res = await send()
    } else {
      accessToken = null
      onSessionLost?.()
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.message ?? res.statusText, body?.errors ?? [])
  }
  return res
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Descarga un archivo autenticado como Blob. Los documentos internos no se pueden abrir con un enlace
 * directo porque necesitan el token en la cabecera; por eso se baja con fetch y se usa un object URL.
 */
export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path)).blob()
}

/** Cuerpo multipart para subir archivos: `fields` van como texto y el archivo en el campo `file`. */
export function formBody(fields: Record<string, string | undefined>, file: File): RequestInit {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') form.append(key, value)
  form.append('file', file)
  return { body: form }
}

/** URL absoluta de un recurso de la API, p. ej. la imagen de un modelo del catálogo. */
export const apiUrl = (path: string) => `${API_URL}${path}`

export const jsonBody = (data: unknown): RequestInit => ({ body: JSON.stringify(data) })
