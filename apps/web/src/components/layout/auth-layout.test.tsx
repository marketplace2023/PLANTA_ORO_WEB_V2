import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { AuthLayout } from './auth-layout'

describe('AuthLayout', () => {
  it('muestra solo la marca y el formulario: sin barra de navegación ni buscador', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<h1>Iniciar sesión</h1>} />
        </Route>
      </Routes>,
      { route: '/login' },
    )
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ecosistema FUR — inicio' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Búsqueda global')).not.toBeInTheDocument()
  })
})
