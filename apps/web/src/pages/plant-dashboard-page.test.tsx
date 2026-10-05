import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { PlantDashboardPage } from './plant-dashboard-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const detail = (roles: string[], permissions: string[]) => ({
  id: 'p1',
  code: 'REV-II',
  name: 'REVEMIN II',
  slug: 'revemin-ii',
  description: 'Planta de beneficio de oro',
  countryCode: 'PE',
  timezone: 'America/Lima',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
  logoUrl: null,
  heroImageUrl: null,
  settings: null,
  access: { roles, permissions },
})

const stages = [
  { id: 's1', code: 'D06', name: 'Molienda Primaria', displayName: 'Molino SAG', stageGroup: 'MOLIENDA', colorToken: 'blue', sequence: 6, isEnabled: true, isPublic: true },
  { id: 's2', code: 'D11', name: 'Lixiviación', displayName: 'Lixiviación', stageGroup: 'LIXIVIACION', colorToken: 'green', sequence: 11, isEnabled: false, isPublic: false },
]
const networks = [{ id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', colorToken: 'network-iot', isEnabled: true, isPublic: true }]

function renderDashboard(route = '/plants/revemin-ii/dashboard') {
  return renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="dashboard" element={<PlantDashboardPage />} />
      </Route>
    </Routes>,
    { route },
  )
}

describe('Dashboard de planta', () => {
  beforeEach(() => {
    state.permissions = []
  })
  afterEach(() => vi.unstubAllGlobals())

  it('visitante: lectura natural, sin herramientas de gestión, solo etapas habilitadas', async () => {
    mockApi({
      'GET /plants/revemin-ii': { body: detail([], []) },
      'GET /plants/revemin-ii/stages': { body: stages },
      'GET /plants/revemin-ii/networks': { body: networks },
    })
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'REVEMIN II' })).toBeInTheDocument()
    expect(screen.getByText('Estás viendo esta planta en modo solo lectura.')).toBeInTheDocument()
    expect(await screen.findByText('Molino SAG')).toBeInTheDocument() // usa el nombre propio de la planta
    expect(screen.getByText('D06')).toBeInTheDocument()
    expect(screen.queryByText('D11')).not.toBeInTheDocument() // deshabilitada
    expect(screen.getByText('FUR-IOT')).toBeInTheDocument()
    expect(screen.getByText('Planta: REVEMIN II')).toBeInTheDocument() // contexto de planta siempre visible
    expect(screen.queryByRole('button', { name: /Editar planta/ })).not.toBeInTheDocument()
  })

  it('administrador de planta: ve su rol y el botón Editar (PermissionGate)', async () => {
    state.permissions = ['plant.update', 'plant.configure']
    mockApi({
      'GET /plants/revemin-ii': { body: detail(['PLANT_ADMIN'], ['plant.update']) },
      'GET /plants/revemin-ii/stages': { body: [] },
      'GET /plants/revemin-ii/networks': { body: [] },
    })
    renderDashboard()

    expect(await screen.findByText('Administrador de planta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Editar planta/ })).toBeInTheDocument()
    expect(await screen.findByText('No hay etapas habilitadas o visibles en esta planta.')).toBeInTheDocument()
  })

  it('rol sin permiso de edición: se indica y no se ofrece la acción', async () => {
    mockApi({
      'GET /plants/revemin-ii': { body: detail(['MAINTENANCE_LEAD'], ['plant.read', 'asset.update']) },
      'GET /plants/revemin-ii/stages': { body: stages },
      'GET /plants/revemin-ii/networks': { body: networks },
    })
    renderDashboard()
    expect(await screen.findByText('Jefe de mantenimiento')).toBeInTheDocument()
    expect(screen.getByText(/Sin permisos de edición/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar planta/ })).not.toBeInTheDocument()
  })

  it('abre el formulario de edición y envía solo los campos editables con PATCH', async () => {
    state.permissions = ['plant.update']
    const mock = mockApi({
      'GET /plants/revemin-ii': { body: detail(['PLANT_ADMIN'], ['plant.update']) },
      'GET /plants/revemin-ii/stages': { body: [] },
      'GET /plants/revemin-ii/networks': { body: [] },
      'PATCH /plants/revemin-ii': { body: detail(['PLANT_ADMIN'], ['plant.update']) },
    })
    renderDashboard()

    await userEvent.click(await screen.findByRole('button', { name: /Editar planta/ }))
    const name = await screen.findByLabelText('Nombre')
    expect(name).toHaveValue('REVEMIN II')
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument() // el código no se edita

    await userEvent.clear(name)
    await userEvent.type(name, 'REVEMIN II Ampliada')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await vi.waitFor(() => expect(mock.count('PATCH /plants/revemin-ii')).toBe(1))
    const sent = JSON.parse(mock.calls.find((c) => c.method === 'PATCH')!.init.body as string)
    expect(sent).toEqual({ name: 'REVEMIN II Ampliada', description: 'Planta de beneficio de oro', visibility: 'PUBLIC' })
  })

  it('el backend rechaza (403): se muestra el error y el diálogo sigue abierto', async () => {
    state.permissions = ['plant.update'] // la UI se equivoca; el backend manda
    mockApi({
      'GET /plants/revemin-ii': { body: detail(['PLANT_ADMIN'], ['plant.update']) },
      'GET /plants/revemin-ii/stages': { body: [] },
      'GET /plants/revemin-ii/networks': { body: [] },
      'PATCH /plants/revemin-ii': { status: 403, body: { message: 'Falta el permiso plant.update en esta planta' } },
    })
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: /Editar planta/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No tienes permiso para esta acción.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('planta inexistente o privada sin acceso (404): mismo mensaje, con salida', async () => {
    mockApi({ 'GET /plants/planta-piloto': { status: 404, body: { message: 'Planta no encontrada' } } })
    renderDashboard('/plants/planta-piloto/dashboard')

    expect(await screen.findByText('Planta no encontrada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver plantas disponibles' })).toHaveAttribute('href', '/plants')
  })

  it('error del servidor: ofrece reintentar y se recupera', async () => {
    let fail = true
    mockApi({
      'GET /plants/revemin-ii': () => (fail ? { status: 500, body: { message: 'boom' } } : { body: detail([], []) }),
      'GET /plants/revemin-ii/stages': { body: [] },
      'GET /plants/revemin-ii/networks': { body: [] },
    })
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'REVEMIN II' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
