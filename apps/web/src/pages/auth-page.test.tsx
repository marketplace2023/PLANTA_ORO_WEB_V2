import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/auth-context'
import { setAccessToken, setSessionLostHandler } from '@/lib/api'
import { mockApi, SESSION, USER } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { AuthPage } from './auth-page'

const ME = { user: USER, plants: [] }

function renderAuth(mode: 'login' | 'register') {
  return renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/" element={<p>Inicio</p>} />
      </Routes>
    </AuthProvider>,
    { route: `/${mode}` },
  )
}

async function fill(label: RegExp | string, value: string) {
  await userEvent.type(screen.getByLabelText(label), value)
}

describe('AuthPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    setAccessToken(null)
    setSessionLostHandler(null)
  })

  describe('login', () => {
    it('valida el formulario en el cliente sin llamar al servidor', async () => {
      const mock = mockApi({})
      renderAuth('login')
      await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))

      expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
      expect(screen.getByText('Ingresa tu contraseña')).toBeInTheDocument()
      expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true')
      expect(mock.calls).toHaveLength(0)
    })

    it('inicia sesión y redirige al inicio', async () => {
      const mock = mockApi({ 'POST /auth/login': { body: SESSION }, 'GET /auth/me': { body: ME } })
      renderAuth('login')

      await fill('Correo electrónico', 'gerente@fur.local')
      await fill('Contraseña', 'fur-local-2026')
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

      expect(await screen.findByText('Inicio')).toBeInTheDocument()
      const body = JSON.parse(mock.calls.find((c) => c.path === '/auth/login')!.init.body as string)
      expect(body).toEqual({ email: 'gerente@fur.local', password: 'fur-local-2026' })
    })

    it('credenciales incorrectas → mensaje genérico accesible, sin redirigir', async () => {
      mockApi({ 'POST /auth/login': { status: 401, body: { message: 'Credenciales inválidas' } } })
      renderAuth('login')

      await fill('Correo electrónico', 'gerente@fur.local')
      await fill('Contraseña', 'mala')
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos')
      expect(screen.queryByText('Inicio')).not.toBeInTheDocument()
    })

    it('límite de intentos (429) → mensaje claro', async () => {
      mockApi({ 'POST /auth/login': { status: 429, body: { message: 'ThrottlerException: Too Many Requests' } } })
      renderAuth('login')
      await fill('Correo electrónico', 'a@b.co')
      await fill('Contraseña', 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos')
    })

    it('servidor caído → mensaje de conexión', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      renderAuth('login')
      await fill('Correo electrónico', 'a@b.co')
      await fill('Contraseña', 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar')
    })

    it('deshabilita el botón mientras envía (evita doble envío)', async () => {
      let release!: () => void
      mockApi({
        'POST /auth/login': () => new Promise((r) => (release = () => r({ body: SESSION }))),
        'GET /auth/me': { body: ME },
      })
      renderAuth('login')
      await fill('Correo electrónico', 'a@b.co')
      await fill('Contraseña', 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

      expect(await screen.findByRole('button', { name: 'Un momento…' })).toBeDisabled()
      release()
      expect(await screen.findByText('Inicio')).toBeInTheDocument()
    })
  })

  describe('registro', () => {
    it('exige contraseña de al menos 10 caracteres', async () => {
      const mock = mockApi({})
      renderAuth('register')
      await fill('Nombre', 'Nueva')
      await fill('Apellido', 'Usuaria')
      await fill('Correo electrónico', 'nueva@fur.local')
      await fill('Contraseña', 'corta')
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('Mínimo 10 caracteres')).toBeInTheDocument()
      expect(mock.calls).toHaveLength(0)
    })

    it('crea la cuenta y entra', async () => {
      mockApi({ 'POST /auth/register': { status: 201, body: SESSION }, 'GET /auth/me': { body: ME } })
      renderAuth('register')
      await fill('Nombre', 'Nueva')
      await fill('Apellido', 'Usuaria')
      await fill('Correo electrónico', 'nueva@fur.local')
      await fill('Contraseña', 'una-clave-larga-1')
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
      expect(await screen.findByText('Inicio')).toBeInTheDocument()
    })

    it('correo ya registrado (409) → error en el campo correo', async () => {
      mockApi({ 'POST /auth/register': { status: 409, body: { message: 'Ya existe una cuenta con ese correo' } } })
      renderAuth('register')
      await fill('Nombre', 'A')
      await fill('Apellido', 'B')
      await fill('Correo electrónico', 'dup@fur.local')
      await fill('Contraseña', 'una-clave-larga-1')
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('Ya existe una cuenta con ese correo.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true'))
    })
  })
})
