import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlantMapCards } from './plant-map-cards'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Mapas apilados del hero', () => {
  it('recorre las cuatro plantas y vuelve al inicio conservando los archivos originales', () => {
    render(<PlantMapCards />)
    for (const name of ['Caratal', 'Mina Colombia', 'Revemin', 'Mina Sosa']) {
      expect(screen.getByRole('img', { name: `Mapa de ${name}` })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Ampliar el mapa/ })).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Planta siguiente' }))
    }
    expect(screen.getByRole('img', { name: 'Mapa de Caratal' })).toHaveAttribute('src', '/MAPA%20CARATAL.jpeg')
    fireEvent.click(screen.getByRole('button', { name: 'Planta anterior' }))
    expect(screen.getByRole('img', { name: 'Mapa de Mina Sosa' })).toBeInTheDocument()
  })

  it('permite elegir una planta y amplía el mapa seleccionado', () => {
    render(<PlantMapCards />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver mapa de Revemin' }))
    expect(screen.getByRole('button', { name: 'Ver mapa de Revemin' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar el mapa de Revemin' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'Mapa de Revemin' })).toHaveAttribute('src', '/MAPA%20REVEMIN.png')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(within(dialog).getByRole('img', { name: 'Mapa de Revemin' })).toBeInTheDocument()
  })

  it('admite flechas de teclado y mantiene ocultas las tarjetas del fondo', () => {
    const { container } = render(<PlantMapCards />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Planta siguiente' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('img', { name: 'Mapa de Mina Sosa' })).toBeInTheDocument()
    expect(container.querySelectorAll('.hero-map-card[inert]')).toHaveLength(3)
  })

  it('la reproducción es opcional y se pausa al explorar con el puntero', () => {
    vi.useFakeTimers()
    render(<PlantMapCards />)
    act(() => vi.advanceTimersByTime(12000))
    expect(screen.getByRole('img', { name: 'Mapa de Caratal' })).toBeInTheDocument()
    const play = screen.getByRole('button', { name: 'Reproducir mapas' })
    fireEvent.focus(play)
    fireEvent.click(play)
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByRole('img', { name: 'Mapa de Mina Colombia' })).toBeInTheDocument()
    const carousel = screen.getByRole('region', { name: 'Mapas de las plantas' })
    fireEvent.mouseEnter(carousel)
    act(() => vi.advanceTimersByTime(12000))
    expect(screen.getByRole('img', { name: 'Mapa de Mina Colombia' })).toBeInTheDocument()
    fireEvent.mouseLeave(carousel)
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByRole('img', { name: 'Mapa de Revemin' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar mapas' }))
    act(() => vi.advanceTimersByTime(12000))
    expect(screen.getByRole('img', { name: 'Mapa de Revemin' })).toBeInTheDocument()
  })

  it('respeta la preferencia de movimiento reducido y conserva la navegación manual', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<PlantMapCards />)
    expect(screen.queryByRole('button', { name: 'Reproducir mapas' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Planta siguiente' }))
    expect(screen.getByRole('img', { name: 'Mapa de Mina Colombia' })).toBeInTheDocument()
  })
})
