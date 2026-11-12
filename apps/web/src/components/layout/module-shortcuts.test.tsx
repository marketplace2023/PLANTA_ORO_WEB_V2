import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { ModuleShortcuts } from './module-shortcuts'

vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ currentPlant: { slug: 'caratal' } }) }))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Carrusel de categorías', () => {
  it('reúne las diez categorías sin divisiones y mantiene sus destinos', () => {
    renderWithProviders(<ModuleShortcuts variant="featured" />)
    const track = screen.getByRole('group', { name: 'Todas las categorías' })
    expect(within(track).getAllByRole('link')).toHaveLength(10)
    expect(track.querySelectorAll('img')).toHaveLength(10)
    expect(screen.queryByText('Gestión de planta')).not.toBeInTheDocument()
    expect(screen.queryByText('Servicios', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mantenimiento' })).toHaveAttribute('href', '/plants/caratal/maintenance')
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', '/marketplace')
  })

  it('avanza por tarjetas completas y desactiva las flechas en los extremos', () => {
    renderWithProviders(<ModuleShortcuts variant="featured" />)
    const track = screen.getByRole('group', { name: 'Todas las categorías' })
    const scrollBy = vi.fn()
    Object.defineProperties(track, {
      clientWidth: { value: 600 }, scrollWidth: { value: 2200 },
      scrollLeft: { value: 0, writable: true }, scrollBy: { value: scrollBy },
    })
    vi.spyOn(track.firstElementChild!, 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect)
    fireEvent.scroll(track)
    expect(screen.getByRole('button', { name: 'Categorías anteriores' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Categorías siguientes' }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 600, behavior: 'smooth' })
    track.scrollLeft = 1600
    fireEvent.scroll(track)
    expect(screen.getByRole('button', { name: 'Categorías siguientes' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Categorías anteriores' }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -600, behavior: 'smooth' })
  })

  it('permite ir a los extremos por teclado y respeta el movimiento reducido', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    renderWithProviders(<ModuleShortcuts variant="featured" />)
    const track = screen.getByRole('group', { name: 'Todas las categorías' })
    const scrollTo = vi.fn()
    Object.defineProperties(track, { scrollWidth: { value: 2200 }, scrollTo: { value: scrollTo } })
    fireEvent.keyDown(track, { key: 'End' })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2200, behavior: 'auto' })
    fireEvent.keyDown(track, { key: 'Home' })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'auto' })
  })

  it('conserva la variante de iconos del catálogo sin fotografías ni controles', () => {
    renderWithProviders(<ModuleShortcuts variant="icons" />)
    const navigation = screen.getByRole('navigation')
    expect(navigation.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Gestión de planta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Categorías siguientes' })).not.toBeInTheDocument()
  })
})
