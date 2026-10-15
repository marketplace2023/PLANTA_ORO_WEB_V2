import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { RequireAuth } from './require-auth'

const state = vi.hoisted(() => ({ status: 'anonymous' as 'loading' | 'anonymous' | 'authenticated' }))

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ status: state.status }),
}))

function Harness() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="plants" element={<p>Contenido de plantas</p>} />
      </Route>
    </Routes>
  )
}

describe('RequireAuth', () => {
  afterEach(() => {
    state.status = 'anonymous'
  })

  it('sin sesión muestra el bloqueo con acceso a iniciar sesión y registrarse, y no el contenido', () => {
    renderWithProviders(<Harness />, { route: '/plants' })
    expect(screen.getByText('Contenido para usuarios registrados')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/register')
    expect(screen.queryByText('Contenido de plantas')).not.toBeInTheDocument()
  })

  it('con sesión muestra el contenido', () => {
    state.status = 'authenticated'
    renderWithProviders(<Harness />, { route: '/plants' })
    expect(screen.getByText('Contenido de plantas')).toBeInTheDocument()
    expect(screen.queryByText('Contenido para usuarios registrados')).not.toBeInTheDocument()
  })

  it('mientras se resuelve la sesión no muestra ni el bloqueo ni el contenido', () => {
    state.status = 'loading'
    renderWithProviders(<Harness />, { route: '/plants' })
    expect(screen.queryByText('Contenido para usuarios registrados')).not.toBeInTheDocument()
    expect(screen.queryByText('Contenido de plantas')).not.toBeInTheDocument()
  })
})
