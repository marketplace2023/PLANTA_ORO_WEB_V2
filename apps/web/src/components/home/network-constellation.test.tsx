import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NetworkMaster } from '@/features/catalog/use-catalog'
import { NetworkConstellation } from './network-constellation'

const networks: NetworkMaster[] = [
  { id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', description: null, icon: 'radio', colorToken: 'network-iot', layoutImageUrl: null },
  { id: 'n2', code: 'FUR-LAB', name: 'Laboratorios', description: null, icon: 'flask', colorToken: 'network-lab', layoutImageUrl: null },
  { id: 'n3', code: 'FUR-NEW', name: 'Nueva especialidad', description: null, icon: null, colorToken: null, layoutImageUrl: null },
]

afterEach(() => vi.restoreAllMocks())

describe('NetworkConstellation', () => {
  it('muestra cada red sin cambiar su orden y abre la ficha seleccionada', () => {
    const onSelect = vi.fn()
    render(<NetworkConstellation networks={networks} onSelect={onSelect} />)
    const list = screen.getByRole('list', { name: 'Redes del ecosistema' })
    expect(within(list).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(networks.map((network) => `Ver la red ${network.code}: ${network.name}`))
    expect(screen.getByText('3 redes transversales')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ver la red FUR-NEW/ }))
    expect(onSelect).toHaveBeenCalledWith(networks[2])
  })

  it('destaca la conexión de una red al pasar el puntero o enfocarla con teclado', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200 } as DOMRect)
    const { container } = render(<NetworkConstellation networks={networks} onSelect={vi.fn()} />)
    const button = screen.getByRole('button', { name: /Ver la red FUR-IOT/ })
    fireEvent.mouseEnter(button)
    expect(button).toHaveAttribute('data-active', 'true')
    expect(container.querySelectorAll('.network-link[data-active=true]')).toHaveLength(1)
    fireEvent.mouseLeave(button)
    expect(button).toHaveAttribute('data-active', 'false')
    fireEvent.focus(button)
    expect(button).toHaveAttribute('data-active', 'true')
    fireEvent.blur(button)
    expect(container.querySelectorAll('.network-link[data-active=true]')).toHaveLength(0)
  })

  it('permite pausar y reanudar la animación y la suspende al abrir una ficha', () => {
    const onSelect = vi.fn()
    const { container, rerender } = render(<NetworkConstellation networks={networks} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pausar animación de redes' }))
    expect(container.firstChild).toHaveAttribute('data-paused', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar animación de redes' }))
    expect(container.firstChild).toHaveAttribute('data-paused', 'false')
    rerender(<NetworkConstellation networks={networks} onSelect={onSelect} suspended />)
    expect(container.firstChild).toHaveAttribute('data-paused', 'true')
  })

  it('admite un catálogo vacío y dibuja todas las conexiones cuando llegan los datos', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200 } as DOMRect)
    const onSelect = vi.fn()
    const { container, rerender } = render(<NetworkConstellation networks={[]} onSelect={onSelect} />)
    expect(screen.getByText('Aún no hay redes registradas.')).toBeInTheDocument()
    rerender(<NetworkConstellation networks={networks} onSelect={onSelect} />)
    expect(container.querySelectorAll('.network-link')).toHaveLength(networks.length)
    expect(container.querySelector('.network-links')).toHaveAttribute('viewBox', '0 0 1200 240')
  })
})
