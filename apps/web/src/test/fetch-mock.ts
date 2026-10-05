import { vi } from 'vitest'

/** `raw` entrega bytes/texto tal cual (descargas de archivos); `body` se serializa como JSON. */
type Reply = { status?: number; body?: unknown; raw?: string | Uint8Array; headers?: Record<string, string> }
type Handler = Reply | ((req: { path: string; init: RequestInit }) => Reply | Promise<Reply>)

export type Call = { method: string; path: string; query: URLSearchParams; init: RequestInit; headers: Headers }

/**
 * Simula la API: rutas con la forma "GET /plants". Devuelve respuestas reales (`Response`)
 * y registra las llamadas para poder afirmar sobre cabeceras, cuerpos y número de peticiones.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const parsed = new URL(String(url))
    const path = parsed.pathname.replace(/^\/api\/v1/, '')
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ method, path, query: parsed.searchParams, init, headers: new Headers(init.headers) })

    const handler = routes[`${method} ${path}`]
    if (!handler) throw new Error(`Ruta no simulada: ${method} ${path}`)
    const reply = typeof handler === 'function' ? await handler({ path, init }) : handler
    const status = reply.status ?? 200
    const payload = status === 204 ? null : reply.raw !== undefined ? reply.raw : JSON.stringify(reply.body ?? {})
    return new Response(payload as BodyInit | null, {
      status,
      headers: { ...(reply.raw === undefined ? { 'Content-Type': 'application/json' } : {}), ...reply.headers },
    })
  })
  vi.stubGlobal('fetch', fn)
  return { calls, count: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length }
}

export const USER = { id: 'u1', email: 'gerente@fur.local', firstName: 'Gabriel', lastName: 'Gerente', isGlobalAdmin: false }
export const SESSION = { accessToken: 'tok-1', expiresIn: 900, user: USER }
