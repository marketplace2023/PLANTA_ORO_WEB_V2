import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlantSummary } from '@/features/plant/plant-context'
import { renderWithProviders } from '@/test/render'
import { PlantsPage } from './plants-page'

const state = vi.hoisted(() => ({
  plants: [] as unknown[],
  loading: false,
  user: null as null | { isGlobalAdmin: boolean },
  select: vi.fn(),
  error: false,
  reload: vi.fn(),
}))

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ availablePlants: state.plants, isLoadingPlants: state.loading, currentPlant: null, selectPlant: state.select, plantsError: state.error, reloadPlants: state.reload }),
}))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: state.user }) }))

const plant = (over: Partial<PlantSummary>): PlantSummary => ({
  id: 'p1',
  code: 'REV-II',
  name: 'REVEMIN II',
  slug: 'revemin-ii',
  description: 'Planta de beneficio',
  countryCode: 'PE',
  timezone: 'America/Lima',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
  logoUrl: null,
  heroImageUrl: null,
  ...over,
})

describe('PlantsPage', () => {
  beforeEach(() => {
    state.plants = []
    state.loading = false
    state.user = null
    state.select.mockClear()
    state.error = false
    state.reload.mockClear()
  })

  it('muestra una tarjeta por planta con estado y visibilidad en texto, y enlace al dashboard', () => {
    state.plants = [plant({}), plant({ id: 'p2', name: 'Planta Piloto', code: 'PIL-01', slug: 'planta-piloto', visibility: 'PRIVATE' })]
    renderWithProviders(<PlantsPage />)

    const card = screen.getByRole('link', { name: /REVEMIN II/ })
    expect(card).toHaveAttribute('href', '/plants/revemin-ii/dashboard')
    expect(card).toHaveTextContent('REV-II')
    expect(card).toHaveTextContent('Activa')
    expect(card).toHaveTextContent('Pública')
    expect(screen.getByRole('link', { name: /Planta Piloto/ })).toHaveTextContent('Privada')
  })

  it('anónimo sin plantas: estado vacío sin botones de gestión', () => {
    renderWithProviders(<PlantsPage />)
    expect(screen.getByText('No hay plantas visibles')).toBeInTheDocument()
    expect(screen.getByText(/Inicia sesión para ver más plantas/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /planta/i })).not.toBeInTheDocument()
  })

  it('el botón "Nueva planta" solo lo ve el administrador del ecosistema', () => {
    state.plants = [plant({})]
    state.user = { isGlobalAdmin: false }
    const { unmount } = renderWithProviders(<PlantsPage />)
    expect(screen.queryByRole('button', { name: /Nueva planta/ })).not.toBeInTheDocument()
    unmount()

    state.user = { isGlobalAdmin: true }
    renderWithProviders(<PlantsPage />)
    expect(screen.getByRole('button', { name: /Nueva planta/ })).toBeInTheDocument()
  })

  it('el CTA del estado vacío también exige permiso', () => {
    state.user = { isGlobalAdmin: true }
    renderWithProviders(<PlantsPage />)
    expect(screen.getByRole('button', { name: /Crear la primera planta/ })).toBeInTheDocument()
  })

  it('si la lista no se pudo cargar muestra el error con reintento, NO el estado vacío "No hay plantas visibles"', async () => {
    state.error = true
    renderWithProviders(<PlantsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar la información.')
    expect(screen.queryByText('No hay plantas visibles')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(state.reload).toHaveBeenCalledTimes(1)
  })

  it('muestra esqueletos mientras carga (no el estado vacío)', () => {
    state.loading = true
    renderWithProviders(<PlantsPage />)
    expect(screen.queryByText('No hay plantas visibles')).not.toBeInTheDocument()
  })

  describe('viniendo de una sección de planta de la barra (?next=)', () => {
    const two = () => [plant({}), plant({ id: 'p2', name: 'Planta Piloto', code: 'PIL-01', slug: 'planta-piloto' })]

    it('cada tarjeta abre la sección pedida y la cabecera lo explica', () => {
      state.plants = two()
      renderWithProviders(<PlantsPage />, { route: '/plants?next=budgets' })
      expect(screen.getByText('Elige una planta para abrir Presupuestos (LULO).')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /REVEMIN II/ })).toHaveAttribute('href', '/plants/revemin-ii/budgets')
      expect(screen.getByRole('link', { name: /Planta Piloto/ })).toHaveAttribute('href', '/plants/planta-piloto/budgets')
    })

    it('un valor desconocido o de otro tipo se ignora (no se navega a rutas arbitrarias)', () => {
      state.plants = two()
      renderWithProviders(<PlantsPage />, { route: '/plants?next=../../login' })
      expect(screen.getByRole('link', { name: /REVEMIN II/ })).toHaveAttribute('href', '/plants/revemin-ii/dashboard')
      expect(screen.queryByText(/Elige una planta para abrir/)).not.toBeInTheDocument()
    })

    it('con una sola planta visible entra directo a la sección y la deja seleccionada', async () => {
      state.plants = [plant({})]
      renderWithProviders(
        <Routes>
          <Route path="/plants" element={<PlantsPage />} />
          <Route path="/plants/:slug/budgets" element={<p>Presupuestos de la planta</p>} />
        </Routes>,
        { route: '/plants?next=budgets' },
      )
      expect(await screen.findByText('Presupuestos de la planta')).toBeInTheDocument()
      expect(state.select).toHaveBeenCalledWith('p1')
    })

    it('sin ?next= con una sola planta NO redirige (se ve la lista)', async () => {
      state.plants = [plant({})]
      renderWithProviders(<PlantsPage />, { route: '/plants' })
      await waitFor(() => expect(screen.getByRole('link', { name: /REVEMIN II/ })).toBeInTheDocument())
      expect(state.select).not.toHaveBeenCalled()
    })
  })
})
