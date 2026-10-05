import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { PlantSelector } from './plant-selector'

const state = vi.hoisted(() => ({
  plants: [] as Array<{ id: string; name: string; slug: string }>,
  loading: false,
  error: false,
  reload: vi.fn(),
  select: vi.fn(),
}))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ currentPlant: null, availablePlants: state.plants, isLoadingPlants: state.loading, plantsError: state.error, reloadPlants: state.reload, selectPlant: state.select }),
}))

const open = async () => {
  renderWithProviders(<PlantSelector />)
  await userEvent.click(screen.getByRole('button', { name: 'Seleccionar planta' }))
}

describe('PlantSelector: lista de plantas', () => {
  beforeEach(() => {
    state.plants = []
    state.loading = false
    state.error = false
    state.reload.mockClear()
  })

  it('con plantas las lista', async () => {
    state.plants = [{ id: 'p1', name: 'REVEMIN II', slug: 'revemin-ii' }]
    await open()
    expect(await screen.findByRole('menuitem', { name: /REVEMIN II/ })).toBeInTheDocument()
  })

  it('sin plantas visibles lo dice sin alarmar', async () => {
    await open()
    expect(await screen.findByText('Aún no hay plantas visibles.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si la lista no se pudo cargar (API o base de datos caída) NO dice "no hay plantas": avisa del error y permite reintentar', async () => {
    state.error = true
    await open()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las plantas')
    expect(screen.queryByText('Aún no hay plantas visibles.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(state.reload).toHaveBeenCalledTimes(1)
  })

  it('cargando muestra el estado de carga', async () => {
    state.loading = true
    await open()
    expect(await screen.findByText('Cargando plantas…')).toBeInTheDocument()
  })
})
