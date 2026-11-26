import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { MainNavbar } from './main-navbar'
import { ModuleShortcuts } from './module-shortcuts'

const state = vi.hoisted(() => ({ currentPlant: null as { slug: string } | null }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ currentPlant: state.currentPlant }) }))

const PLANT_LABELS = ['Catálogo', 'Activos Físicos', 'Procesos', 'Mantenimiento', 'WMS / Inventario', 'Documentos']
const SERVICE_LABELS = ['Marketplace', 'Servicios Profesionales', 'Cursos (LMS)', 'Presupuestos (LULO)']

describe('Navegación unificada', () => {
  beforeEach(() => { state.currentPlant = null })

  it.each(['horizontal', 'vertical'] as const)('muestra solo Inicio, Gestión de planta y Servicios en orientación %s', (orientation) => {
    renderWithProviders(<MainNavbar orientation={orientation} />)
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Página principal'])
    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Gestión de planta', 'Servicios'])
    expect(screen.queryByRole('button', { name: 'Más' })).not.toBeInTheDocument()
    expect(screen.queryByText('Redes Transversales')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboards')).not.toBeInTheDocument()
  })

  it.each(['horizontal', 'vertical'] as const)('Gestión de planta conserva sus herramientas operativas (%s)', async (orientation) => {
    const user = userEvent.setup()
    state.currentPlant = { slug: 'revemin-ii' }
    const onNavigate = vi.fn()
    renderWithProviders(<MainNavbar orientation={orientation} onNavigate={onNavigate} />, { route: '/plants/revemin-ii/inventory' })
    const trigger = screen.getByRole('button', { name: 'Gestión de planta' })
    expect(trigger).toHaveClass(orientation === 'vertical' ? 'bg-fur-gold-500' : 'border-fur-navy-900')
    await user.click(trigger)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(PLANT_LABELS)
    expect(screen.getByRole('menuitem', { name: 'Mantenimiento' })).toHaveAttribute('href', '/plants/revemin-ii/maintenance')
    expect(screen.getByRole('menuitem', { name: 'WMS / Inventario' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('menuitem', { name: 'Presupuestos (LULO)' })).not.toBeInTheDocument()
    const documents = screen.getByRole('menuitem', { name: 'Documentos' })
    expect(documents).toHaveAttribute('href', '/plants/revemin-ii/documents')
    await user.click(documents)
    expect(onNavigate).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('sin planta elegida conserva el módulo solicitado y no marca todas las herramientas como activas', async () => {
    renderWithProviders(<MainNavbar />, { route: '/plants?next=budgets' })
    await userEvent.click(screen.getByRole('button', { name: 'Gestión de planta' }))
    for (const [label, path] of [['Mantenimiento', 'maintenance'], ['WMS / Inventario', 'inventory'], ['Documentos', 'documents']]) {
      const link = screen.getByRole('menuitem', { name: label })
      expect(link).toHaveAttribute('href', `/plants?next=${path}`)
      expect(link).not.toHaveAttribute('aria-current')
    }
    expect(screen.getByRole('menuitem', { name: 'Catálogo' })).toHaveAttribute('href', '/catalog')
  })

  it('Servicios conserva sus secciones unificadas y el cierre por teclado', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MainNavbar />)
    await user.click(screen.getByRole('button', { name: 'Servicios' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(SERVICE_LABELS)
    expect(screen.getByRole('menuitem', { name: 'Marketplace' })).toHaveAttribute('href', '/marketplace')
    expect(screen.getByRole('menuitem', { name: 'Presupuestos (LULO)' })).toHaveAttribute('href', '/budgets')
    expect(screen.queryByRole('menuitem', { name: 'Mantenimiento' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Servicios' })).toHaveFocus()
  })

  it('los accesos visuales muestran los mismos grupos y omiten las secciones retiradas', () => {
    state.currentPlant = { slug: 'revemin-ii' }
    renderWithProviders(<ModuleShortcuts />)
    expect(within(screen.getByRole('group', { name: 'Gestión de planta' })).getAllByRole('link').map((link) => link.textContent)).toEqual(PLANT_LABELS)
    expect(within(screen.getByRole('group', { name: 'Servicios' })).getAllByRole('link').map((link) => link.textContent)).toEqual(SERVICE_LABELS)
    expect(screen.getByRole('link', { name: 'Documentos' })).toHaveAttribute('href', '/plants/revemin-ii/documents')
    expect(screen.queryByRole('link', { name: 'Redes Transversales' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboards' })).not.toBeInTheDocument()
  })

  it('los accesos visuales sin planta también conservan el contexto solicitado', () => {
    renderWithProviders(<ModuleShortcuts />, { route: '/plants' })
    const inventory = screen.getByRole('link', { name: 'WMS / Inventario' })
    expect(inventory).toHaveAttribute('href', '/plants?next=inventory')
    expect(inventory).not.toHaveAttribute('aria-current')
  })
})
