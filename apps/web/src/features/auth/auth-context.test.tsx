import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setAccessToken, setSessionLostHandler } from '@/lib/api'
import { mockApi, SESSION, USER } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { AuthProvider, useAuth } from './auth-context'

const ME = {
  user: USER,
  plants: [{ plantId: 'p1', slug: 'revemin-ii', name: 'REVEMIN II', roles: ['PLANT_ADMIN'], permissions: ['plant.update'] }],
}

function Probe() {
  const { status, user, access, login, logout } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.email ?? '-'}</p>
      <p data-testid="access">{access.map((a) => `${a.slug}:${a.roles}`).join(',') || '-'}</p>
      <button onClick={() => void login('gerente@fur.local', 'x').catch(() => undefined)}>entrar</button>
      <button onClick={() => void logout()}>salir</button>
    </div>
  )
}

const renderProbe = () =>
  renderWithProviders(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )

describe('AuthProvider', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    setAccessToken(null)
    setSessionLostHandler(null)
    localStorage.clear()
  })

  it('un visitante sin sesión previa queda anónimo sin llamar al servidor', async () => {
    const mock = mockApi({})
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(mock.calls).toHaveLength(0)
  })

  it('con sesión previa restaura al usuario vía refresh + /auth/me', async () => {
    localStorage.setItem('fur.session', '1')
    mockApi({ 'POST /auth/refresh': { body: SESSION }, 'GET /auth/me': { body: ME } })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('gerente@fur.local')
    expect(screen.getByTestId('access')).toHaveTextContent('revemin-ii:PLANT_ADMIN')
  })

  it('si la sesión previa ya no es válida, vuelve a anónimo y olvida la pista', async () => {
    localStorage.setItem('fur.session', '1')
    mockApi({ 'POST /auth/refresh': { status: 401 } })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(localStorage.getItem('fur.session')).toBeNull()
  })

  it('login: guarda al usuario y su acceso por planta', async () => {
    mockApi({ 'POST /auth/login': { body: SESSION }, 'GET /auth/me': { body: ME } })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await userEvent.click(screen.getByRole('button', { name: 'entrar' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(localStorage.getItem('fur.session')).toBe('1')
  })

  it('un login fallido no cambia el estado', async () => {
    mockApi({ 'POST /auth/login': { status: 401, body: { message: 'Credenciales inválidas' } } })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await userEvent.click(screen.getByRole('button', { name: 'entrar' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(localStorage.getItem('fur.session')).toBeNull()
  })

  it('logout revoca en el servidor y limpia usuario, acceso y caché', async () => {
    localStorage.setItem('fur.session', '1')
    const mock = mockApi({
      'POST /auth/refresh': { body: SESSION },
      'GET /auth/me': { body: ME },
      'POST /auth/logout': { status: 204 },
    })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'salir' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(mock.count('POST /auth/logout')).toBe(1)
    expect(screen.getByTestId('user')).toHaveTextContent('-')
    expect(screen.getByTestId('access')).toHaveTextContent('-')
    expect(localStorage.getItem('fur.session')).toBeNull()
  })

  it('si la sesión se pierde a mitad de uso (refresh rechazado), pasa a anónimo', async () => {
    localStorage.setItem('fur.session', '1')
    mockApi({ 'POST /auth/refresh': { body: SESSION }, 'GET /auth/me': { body: ME } })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    // Una petición posterior recibe 401 y el refresh ya no es válido: el proveedor debe enterarse.
    mockApi({ 'GET /plants': { status: 401 }, 'POST /auth/refresh': { status: 401 } })
    await api('/plants').catch(() => undefined)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(localStorage.getItem('fur.session')).toBeNull()
  })
})
