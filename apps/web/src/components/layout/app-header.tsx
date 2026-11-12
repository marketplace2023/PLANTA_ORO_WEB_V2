import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Calculator, GraduationCap, Menu, Search, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MainNavbar } from './main-navbar'
import { PlantSelector } from './plant-selector'
import { UserMenu } from './user-menu'
import { BrandLogo } from './brand-logo'

export function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isLearning = /^\/(courses|my-learning)(\/|$)/.test(pathname)
  const isMarketplace = /^\/marketplace(\/|$)/.test(pathname)
  const isLuloPublic = pathname === '/budgets'
  const isGlobal = isLearning || isMarketplace || isLuloPublic
  return (
    <header className="app-header sticky top-0 z-40">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <div className="header-top">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></Button>
        <BrandLogo />
        <form className="header-search" role="search" onSubmit={(event) => { event.preventDefault(); navigate(`${isLearning ? '/courses' : isMarketplace ? '/marketplace' : '/catalog'}${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`) }}>
          <label htmlFor="global-search" className="sr-only">Búsqueda global</label>
          <span className="search-category">{isLearning ? 'Formación FUR' : isMarketplace ? 'Marketplace FUR' : 'Catálogo FUR'}</span>
          <Input id="global-search" type="search" placeholder={isLearning ? 'Buscar cursos por título, categoría o instructor…' : isMarketplace ? 'Buscar productos, marcas, SKU o tiendas…' : 'Buscar por FUR, nombre, categoría, fabricante…'} value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button type="submit" size="icon" aria-label={isLearning ? 'Buscar cursos' : isMarketplace ? 'Buscar productos' : 'Buscar en el catálogo'}><Search /></Button>
        </form>
        <div className="header-account">{isGlobal ? <div className="header-course-context">{isLearning ? <GraduationCap aria-hidden /> : isLuloPublic ? <Calculator aria-hidden /> : <Store aria-hidden />}<span><small>{isLearning ? 'FORMACIÓN' : isLuloPublic ? 'PRESUPUESTOS' : 'COMPRAS'}</small><strong>{isLuloPublic ? 'Estimación pública' : 'Catálogo global'}</strong></span></div> : <PlantSelector />}<UserMenu /></div>
      </div>
      <div className="header-nav hidden lg:block"><MainNavbar /></div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="mobile-navigation w-80">
          <SheetHeader><SheetTitle>Ecosistema FUR</SheetTitle></SheetHeader>
          <div className="overflow-y-auto px-2 pb-4"><MainNavbar orientation="vertical" onNavigate={() => setMenuOpen(false)} /></div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
