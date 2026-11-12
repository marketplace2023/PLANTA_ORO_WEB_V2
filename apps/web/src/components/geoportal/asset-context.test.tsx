import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asset, fur } from '@/test/assets-fixtures'
import { renderWithProviders } from '@/test/render'
import { AssetContext } from './asset-context'

const state = vi.hoisted(() => ({ data: undefined as ReturnType<typeof fur> | undefined, isError: false }))
vi.mock('@/features/assets/use-assets', () => ({ useAssetFur: () => ({ ...state, isLoading: false, refetch: vi.fn() }) }))

describe('Contexto del activo', () => {
  beforeEach(() => { state.data = fur(); state.isError = false })

  it('identifica los datos ausentes sin inventar sensores ni información restringida', () => {
    renderWithProviders(<AssetContext slug="revemin-ii" asset={asset()} />)
    expect(screen.getByText('Sin lecturas de sensores disponibles para este activo.')).toBeInTheDocument()
    expect(screen.getByText('Sin documentos vinculados.')).toBeInTheDocument()
    expect(screen.getByText('Información no disponible para tu perfil.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Explorar vendedores/ })).toHaveAttribute('href', '/marketplace?view=sellers&family=MOLINOS')
    expect(screen.getByRole('link', { name: /Explorar cursos/ })).toHaveAttribute('href', '/courses')
  })

  it('muestra documentos y lecturas del activo con enlaces funcionales', () => {
    state.data = fur({
      telemetry: { temperature: 42 }, maintenance: { openWorkOrders: 2, overdueWorkOrders: 1 },
      documents: [{ id: 'doc1', title: 'Manual del equipo', documentType: 'MANUAL', visibility: 'INTERNAL', status: 'ACTIVE', currentVersion: 3, createdAt: '', updatedAt: '', file: { originalName: 'manual.pdf', mimeType: 'application/pdf', sizeBytes: 100 }, assets: [], stages: [] }],
    })
    renderWithProviders(<AssetContext slug="revemin-ii" asset={asset()} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Órdenes abiertas').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByRole('link', { name: 'Manual del equipo' })).toHaveAttribute('href', '/plants/revemin-ii/documents?doc=doc1&assetId=a1')
    expect(screen.getByRole('link', { name: /Ver mantenimiento/ })).toHaveAttribute('href', '/plants/revemin-ii/maintenance?tab=orders&assetId=a1')
  })

  it('distingue un fallo de carga de un activo sin información', () => {
    state.data = undefined
    state.isError = true
    renderWithProviders(<AssetContext slug="revemin-ii" asset={asset()} />)
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
    expect(screen.queryByText('Sin documentos vinculados.')).not.toBeInTheDocument()
  })
})
