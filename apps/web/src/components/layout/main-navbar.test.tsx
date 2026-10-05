import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { MainNavbar } from './main-navbar'

const state = vi.hoisted(() => ({ currentPlant: null as { slug: string } | null }))

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ currentPlant: state.currentPlant }),
}))

// Nombres fijos: docs/design.md §9 y §56.
const NAV_LABELS = [
  'Todo el ecosistema',
  'Catálogo',
  'Activos Físicos',
  'Procesos',
  'Marketplace',
  'Proveedores',
  'Servicios Profesionales',
  'Cursos (LMS)',
  'Redes Transversales',
  'Mantenimiento',
  'WMS / Inventario',
  'Presupuestos (LULO)',
  'Documentos',
  'Dashboards',
]

describe('MainNavbar', () => {
  beforeEach(() => {
    state.currentPlant = null
  })

  it('muestra las 14 secciones con los nombres del diseño, en orden', () => {
    renderWithProviders(<MainNavbar />)
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(NAV_LABELS)
  })

  it('sin planta seleccionada, las secciones de planta llevan a elegir una planta y recuerdan cuál', () => {
    renderWithProviders(<MainNavbar />)
    expect(screen.getByRole('link', { name: 'Activos Físicos' })).toHaveAttribute('href', '/plants?next=assets')
    expect(screen.getByRole('link', { name: 'Presupuestos (LULO)' })).toHaveAttribute('href', '/plants?next=budgets')
    expect(screen.getByRole('link', { name: 'Presupuestos (LULO)' })).toHaveAttribute('title', 'Elige una planta para abrir esta sección')
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', '/marketplace')
  })

  it('sin planta, estando en /plants ninguna sección de planta se marca como activa', () => {
    renderWithProviders(<MainNavbar />, { route: '/plants?next=budgets' })
    for (const name of ['Activos Físicos', 'Procesos', 'Mantenimiento', 'Presupuestos (LULO)']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })

  it('sin planta, Dashboards abre el dashboard del ecosistema (no pide elegir planta)', () => {
    renderWithProviders(<MainNavbar />, { route: '/dashboards' })
    const link = screen.getByRole('link', { name: 'Dashboards' })
    expect(link).toHaveAttribute('href', '/dashboards')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).not.toHaveAttribute('title')
  })

  it('con planta seleccionada, las secciones de planta cuelgan de /plants/:slug', () => {
    state.currentPlant = { slug: 'revemin-ii' }
    renderWithProviders(<MainNavbar />)
    expect(screen.getByRole('link', { name: 'Activos Físicos' })).toHaveAttribute('href', '/plants/revemin-ii/assets')
    expect(screen.getByRole('link', { name: 'Dashboards' })).toHaveAttribute('href', '/plants/revemin-ii/dashboard')
    expect(screen.getByRole('link', { name: 'Cursos (LMS)' })).toHaveAttribute('href', '/courses')
  })

  it('marca la sección activa', () => {
    renderWithProviders(<MainNavbar />, { route: '/catalog' })
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Todo el ecosistema' })).not.toHaveAttribute('aria-current')
  })
})
