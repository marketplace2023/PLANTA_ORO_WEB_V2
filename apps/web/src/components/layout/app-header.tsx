import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Menu, Search, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MainNavbar } from './main-navbar'
import { PlantSelector } from './plant-selector'
import { UserMenu } from './user-menu'

const headerIconButton = 'text-white hover:bg-fur-navy-800 hover:text-white'

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-white" aria-label="Ecosistema FUR — inicio">
      <span className="grid size-9 place-items-center rounded-md bg-fur-gold-500 font-mono text-sm font-bold text-fur-navy-900">
        FUR
      </span>
      <span className="hidden text-base font-bold tracking-tight sm:block">Ecosistema FUR</span>
    </Link>
  )
}

export function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 bg-fur-navy-900 text-white shadow-md">
      <div className="mx-auto flex h-16 max-w-fur items-center gap-3 px-4 md:px-5 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className={`${headerIconButton} lg:hidden`}
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu />
        </Button>

        <Logo />
        <PlantSelector />

        <div className="relative mx-2 hidden max-w-xl flex-1 md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" />
          <Input
            type="search"
            aria-label="Búsqueda global"
            placeholder="Buscar activos, procesos, servicios, cursos, proveedores, documentos..."
            className="h-10 border-transparent bg-white pl-9 text-fur-gray-900"
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className={headerIconButton} aria-label="Favoritos">
            <Star />
          </Button>
          <Button variant="ghost" size="icon" className={headerIconButton} aria-label="Alertas">
            <Bell />
          </Button>
          <UserMenu />
        </div>
      </div>

      <div className="hidden border-t border-fur-navy-800 lg:block">
        <div className="mx-auto max-w-fur overflow-x-auto px-6">
          <MainNavbar />
        </div>
      </div>

      {/* En mobile la navbar pasa a drawer (docs/design.md §49) */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 border-fur-navy-800 bg-fur-navy-900 text-white">
          <SheetHeader>
            <SheetTitle className="text-white">Ecosistema FUR</SheetTitle>
          </SheetHeader>
          <div className="px-2 pb-4">
            <MainNavbar orientation="vertical" onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
