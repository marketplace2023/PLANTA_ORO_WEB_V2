import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, SESSION } from '@/test/fetch-mock'
import { api, apiBlob, ApiError, formBody, jsonBody, refreshSession, setAccessToken, setSessionLostHandler } from './api'

describe('api()', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setAccessToken(null)
    setSessionLostHandler(null)
  })

  it('devuelve el JSON y envía cookies (credentials: include)', async () => {
    const { calls } = mockApi({ 'GET /health': { body: { ok: 1 } } })
    await expect(api('/health')).resolves.toEqual({ ok: 1 })
    expect(calls[0].init.credentials).toBe('include')
  })

  it('no fuerza Content-Type en GET (evita preflights innecesarios) y sí lo pone con cuerpo', async () => {
    const { calls } = mockApi({ 'GET /a': {}, 'POST /b': {} })
    await api('/a')
    await api('/b', { method: 'POST', ...jsonBody({ x: 1 }) })
    expect(calls[0].headers.get('Content-Type')).toBeNull()
    expect(calls[1].headers.get('Content-Type')).toBe('application/json')
    expect(calls[1].init.body).toBe('{"x":1}')
  })

  it('adjunta el access token como Bearer', async () => {
    const { calls } = mockApi({ 'GET /x': {} })
    setAccessToken('abc')
    await api('/x')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer abc')
  })

  it('maneja 204 sin cuerpo', async () => {
    mockApi({ 'POST /auth/logout': { status: 204 } })
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('lanza ApiError con status, mensaje y errores por campo', async () => {
    mockApi({
      'POST /x': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'email', message: 'Correo inválido' }] } },
      'GET /y': { status: 403, body: { message: 'Sin permiso' } },
    })
    const err = await api('/x', { method: 'POST' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, message: 'Datos inválidos', fieldErrors: [{ path: 'email', message: 'Correo inválido' }] })
    await expect(api('/y')).rejects.toMatchObject({ status: 403, message: 'Sin permiso' })
  })

  it('usa statusText si el cuerpo de error no es JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502, statusText: 'Bad Gateway' })))
    await expect(api('/x')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' })
  })

  describe('archivos (multipart y descargas)', () => {
    it('con FormData NO fuerza Content-Type (el navegador pone multipart con su boundary)', async () => {
      const { calls } = mockApi({ 'POST /up': {} })
      await api('/up', { method: 'POST', ...formBody({ title: 'Manual' }, new File(['x'], 'a.pdf')) })
      expect(calls[0].headers.get('Content-Type')).toBeNull()
      expect(calls[0].init.body).toBeInstanceOf(FormData)
    })

    it('formBody: texto + archivo en el campo "file", omitiendo campos vacíos', () => {
      const file = new File(['x'], 'a.pdf')
      const form = formBody({ title: 'T', note: undefined, assetIds: '' }, file).body as FormData
      expect(form.get('title')).toBe('T')
      expect([...form.keys()].sort()).toEqual(['file', 'title'])
      expect((form.get('file') as File).name).toBe('a.pdf')
    })

    it('apiBlob devuelve el binario, con token, y renueva la sesión ante un 401', async () => {
      let first = true
      const mock = mockApi({
        'GET /plants/p/documents/d/download': () => {
          if (first) {
            first = false
            return { status: 401, body: { message: 'expirado' } }
          }
          return { raw: '%PDF-', headers: { 'Content-Type': 'application/pdf' } }
        },
        'POST /auth/refresh': { body: { ...SESSION, accessToken: 'tok-nuevo' } },
      })
      setAccessToken('viejo')

      const blob = await apiBlob('/plants/p/documents/d/download')
      expect(await blob.text()).toBe('%PDF-')
      expect(mock.count('POST /auth/refresh')).toBe(1)
      expect(mock.calls.at(-1)!.headers.get('Authorization')).toBe('Bearer tok-nuevo')
    })

    it('apiBlob lanza ApiError si el archivo no está disponible', async () => {
      mockApi({ 'GET /x/download': { status: 404, body: { message: 'Documento no encontrado' } } })
      await expect(apiBlob('/x/download')).rejects.toMatchObject({ status: 404, message: 'Documento no encontrado' })
    })
  })

  describe('renovación de sesión', () => {
    it('ante un 401 renueva el token una vez y reintenta con el token nuevo', async () => {
      let first = true
      const mock = mockApi({
        'GET /plants': ({ init }) => {
          const auth = new Headers(init.headers).get('Authorization')
          if (first) {
            first = false
            return { status: 401, body: { message: 'Token inválido o expirado' } }
          }
          return { body: [{ token: auth }] }
        },
        'POST /auth/refresh': { body: { ...SESSION, accessToken: 'tok-nuevo' } },
      })
      setAccessToken('tok-viejo')

      await expect(api('/plants')).resolves.toEqual([{ token: 'Bearer tok-nuevo' }])
      expect(mock.count('POST /auth/refresh')).toBe(1)
      expect(mock.count('GET /plants')).toBe(2)
    })

    it('varias peticiones que expiran a la vez comparten UN solo refresh (el backend trata la reutilización como robo)', async () => {
      let refreshed = false
      const mock = mockApi({
        'GET /a': () => (refreshed ? { body: 'a' } : { status: 401, body: {} }),
        'GET /b': () => (refreshed ? { body: 'b' } : { status: 401, body: {} }),
        'GET /c': () => (refreshed ? { body: 'c' } : { status: 401, body: {} }),
        'POST /auth/refresh': async () => {
          await new Promise((r) => setTimeout(r, 20))
          refreshed = true
          return { body: SESSION }
        },
      })
      setAccessToken('viejo')

      await expect(Promise.all([api('/a'), api('/b'), api('/c')])).resolves.toEqual(['a', 'b', 'c'])
      expect(mock.count('POST /auth/refresh')).toBe(1)
    })

    it('si el refresh falla, avisa de la sesión perdida y propaga el 401', async () => {
      mockApi({ 'GET /plants': { status: 401, body: { message: 'Token inválido' } }, 'POST /auth/refresh': { status: 401 } })
      const lost = vi.fn()
      setSessionLostHandler(lost)
      setAccessToken('viejo')

      await expect(api('/plants')).rejects.toMatchObject({ status: 401 })
      expect(lost).toHaveBeenCalledTimes(1)
    })

    it('no intenta renovar sin sesión previa ni en rutas /auth/*', async () => {
      const mock = mockApi({
        'GET /plants': { status: 401 },
        'POST /auth/login': { status: 401, body: { message: 'Credenciales inválidas' } },
      })
      await expect(api('/plants')).rejects.toMatchObject({ status: 401 }) // anónimo: sin token
      setAccessToken('t')
      await expect(api('/auth/login', { method: 'POST', ...jsonBody({}) })).rejects.toMatchObject({ status: 401 })
      expect(mock.count('POST /auth/refresh')).toBe(0)
    })

    it('refreshSession guarda el token nuevo y devuelve null si falla', async () => {
      mockApi({ 'POST /auth/refresh': { body: SESSION } })
      await expect(refreshSession()).resolves.toMatchObject({ user: { email: 'gerente@fur.local' } })

      mockApi({ 'POST /auth/refresh': { status: 401 } })
      await expect(refreshSession()).resolves.toBeNull()

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      await expect(refreshSession()).resolves.toBeNull()
    })
  })
})
