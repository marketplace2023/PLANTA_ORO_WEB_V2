import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StageMaster } from '@/features/catalog/use-catalog'
import { ProcessCycle } from './process-cycle'

const stages: StageMaster[] = [
  { id: '2', code: 'D02', name: 'Trituración primaria', sequenceDefault: 2, description: null, stageGroup: 'TRITURACION', colorToken: null, layoutImageUrl: null },
  { id: '1', code: 'D01', name: 'Recepción', sequenceDefault: 1, description: null, stageGroup: 'TRITURACION', colorToken: null, layoutImageUrl: null },
]

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ProcessCycle', () => {
  it('muestra el estado vacío y mide el recorrido cuando llegan las etapas', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600 } as DOMRect)
    const onSelect = vi.fn()
    const { container, rerender } = render(<ProcessCycle stages={[]} onSelect={onSelect} />)
    expect(screen.getByText('Aún no hay etapas registradas.')).toBeInTheDocument()
    rerender(<ProcessCycle stages={stages} onSelect={onSelect} />)
    expect(container.querySelector('.cycle-connection')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[1]).toHaveStyle({ gridRow: '1', gridColumn: '2' })
  })

  it('ordena el recorrido por secuencia y abre la ficha de la etapa elegida', () => {
    const onSelect = vi.fn()
    render(<ProcessCycle stages={stages} onSelect={onSelect} />)
    expect(screen.getAllByRole('button', { name: /Ver la etapa/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['Ver la etapa D01: Recepción', 'Ver la etapa D02: Trituración primaria'])
    fireEvent.click(screen.getByRole('button', { name: /Ver la etapa D02/ }))
    expect(onSelect).toHaveBeenCalledWith(stages[0])
  })

  it('avanza, cierra el ciclo y permite pausar y reanudar el recorrido', () => {
    vi.useFakeTimers()
    render(<ProcessCycle stages={stages} onSelect={vi.fn()} />)
    const first = screen.getByRole('button', { name: /Ver la etapa D01/ })
    const second = screen.getByRole('button', { name: /Ver la etapa D02/ })
    expect(first).toHaveAttribute('data-highlighted', 'true')
    act(() => vi.advanceTimersByTime(2400))
    expect(second).toHaveAttribute('data-highlighted', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Pausar recorrido' }))
    act(() => vi.advanceTimersByTime(4800))
    expect(second).toHaveAttribute('data-highlighted', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar recorrido' }))
    act(() => vi.advanceTimersByTime(2400))
    expect(first).toHaveAttribute('data-highlighted', 'true')
  })

  it('suspende la animación mientras la ficha está abierta', () => {
    vi.useFakeTimers()
    render(<ProcessCycle stages={stages} onSelect={vi.fn()} suspended />)
    act(() => vi.advanceTimersByTime(7200))
    expect(screen.getByRole('button', { name: /Ver la etapa D01/ })).toHaveAttribute('data-highlighted', 'true')
  })

  it('respeta la preferencia de movimiento reducido', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<ProcessCycle stages={stages} onSelect={vi.fn()} />)
    act(() => vi.advanceTimersByTime(2400))
    expect(screen.getByRole('button', { name: /Ver la etapa D01/ })).toHaveAttribute('data-highlighted', 'true')
    expect(screen.queryByRole('button', { name: 'Pausar recorrido' })).not.toBeInTheDocument()
  })

  it('dibuja las conexiones al ancho del contenedor y mantiene el orden serpenteante', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200 } as DOMRect)
    const many = Array.from({ length: 7 }, (_, i) => ({ ...stages[0], id: String(i), code: `D0${i + 1}`, sequenceDefault: i + 1 }))
    const { container } = render(<ProcessCycle stages={many} onSelect={vi.fn()} />)
    expect(container.querySelectorAll('.cycle-connection')).toHaveLength(6)
    expect(container.querySelector('.cycle-return')).toBeInTheDocument()
    const nodes = screen.getAllByRole('listitem')
    expect(nodes[3]).toHaveStyle({ gridRow: '1', gridColumn: '4' })
    expect(nodes[4]).toHaveStyle({ gridRow: '2', gridColumn: '4' })
    expect(nodes[6]).toHaveStyle({ gridRow: '2', gridColumn: '2' })
  })
})
