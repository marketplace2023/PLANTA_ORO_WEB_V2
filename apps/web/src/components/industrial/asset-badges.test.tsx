import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ASSET_CRITICALITIES, ASSET_STATUSES, STATUS_META } from '@/lib/assets'
import { AssetStatusBadge, CriticalityBadge } from './asset-badges'

describe('AssetStatusBadge', () => {
  it.each(ASSET_STATUSES)('%s se muestra con texto (no solo color) y con icono', (status) => {
    const { container } = render(<AssetStatusBadge status={status} />)
    expect(screen.getByText(STATUS_META[status].label)).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('cubre exactamente los 9 estados del diseño, con etiquetas únicas', () => {
    expect(ASSET_STATUSES).toHaveLength(9)
    const labels = ASSET_STATUSES.map((s) => STATUS_META[s].label)
    expect(new Set(labels).size).toBe(9)
  })

  it('un estado desconocido no rompe: muestra el código tal cual', () => {
    render(<AssetStatusBadge status="NUEVO_ESTADO" />)
    expect(screen.getByText('NUEVO_ESTADO')).toBeInTheDocument()
  })
})

describe('CriticalityBadge', () => {
  it.each([
    ['LOW', 'Baja'],
    ['MEDIUM', 'Media'],
    ['HIGH', 'Alta'],
    ['CRITICAL', 'Crítica'],
  ])('%s → %s', (value, label) => {
    render(<CriticalityBadge criticality={value} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('hay 4 niveles y uno desconocido cae al valor crudo', () => {
    expect(ASSET_CRITICALITIES).toHaveLength(4)
    render(<CriticalityBadge criticality="X" />)
    expect(screen.getByText('X')).toBeInTheDocument()
  })
})
