import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { AppHeader } from './app-header'

vi.mock('./plant-selector',()=>({PlantSelector:()=> <button>Seleccionar planta</button>}))
vi.mock('./user-menu',()=>({UserMenu:()=> <span>Mi cuenta</span>}))
vi.mock('./main-navbar',()=>({MainNavbar:()=> <nav aria-label="Navegación principal" />}))
function Location() { const location = useLocation(); return <output aria-label="Destino">{location.pathname}{location.search}</output> }

describe('Header search context',()=>{
  it('searches store products without a plant filter in the marketplace',async()=>{
    renderWithProviders(<><AppHeader /><Location /></>,{route:'/marketplace'})
    expect(screen.queryByRole('button',{name:'Seleccionar planta'})).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'),'SKU-123')
    await userEvent.click(screen.getByRole('button',{name:'Buscar productos'}))
    await waitFor(()=>expect(screen.getByLabelText('Destino')).toHaveTextContent('/marketplace?search=SKU-123'))
  })
  it('searches global courses and removes the plant selector inside a course',async()=>{
    renderWithProviders(<><AppHeader /><Location /></>,{route:'/courses/course-id'})
    expect(screen.getByText('Catálogo global')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Seleccionar planta'})).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'),'perforación')
    await userEvent.click(screen.getByRole('button',{name:'Buscar cursos'}))
    await waitFor(()=>expect(screen.getByLabelText('Destino')).toHaveTextContent('/courses?search=perforaci%C3%B3n'))
  })
  it('keeps plant context and catalogue search in physical assets',async()=>{
    renderWithProviders(<><AppHeader /><Location /></>,{route:'/plants/revemin-ii/assets'})
    expect(screen.getByRole('button',{name:'Seleccionar planta'})).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'),'motor')
    await userEvent.click(screen.getByRole('button',{name:'Buscar en el catálogo'}))
    await waitFor(()=>expect(screen.getByLabelText('Destino')).toHaveTextContent('/catalog?search=motor'))
  })
})
