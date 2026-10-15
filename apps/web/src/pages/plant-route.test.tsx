import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { PlantRoute } from './plant-route'

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: [], currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const renderRoute = () =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="assets" element={<p>Datos de la planta</p>} />
      </Route>
    </Routes>,
    { route: '/plants/revemin-ii/assets' },
  )

describe('PlantRoute: acceso por pertenencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('quien no tiene rol en la planta ve el bloqueo con «Solicitar acceso» y ningún dato', async () => {
    mockApi({
      'GET /plants/revemin-ii': { body: plantDetail([], []) },
      'GET /plant-access-requests/mine': { body: [] },
    })
    renderRoute()

    expect(await screen.findByText('No perteneces a REVEMIN II')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solicitar acceso' })).toBeInTheDocument()
    expect(screen.queryByText('Datos de la planta')).not.toBeInTheDocument()
  })

  it('un miembro ve la sección', async () => {
    mockApi({ 'GET /plants/revemin-ii': { body: plantDetail(['CONSUMER'], []) } })
    renderRoute()

    expect(await screen.findByText('Datos de la planta')).toBeInTheDocument()
    expect(screen.queryByText('No perteneces a REVEMIN II')).not.toBeInTheDocument()
  })
})
