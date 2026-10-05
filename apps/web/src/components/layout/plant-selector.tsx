import { Check, ChevronsUpDown, Factory, Globe } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePlant } from '@/features/plant/plant-context'

/** El selector define el contexto de trabajo, no es un filtro visual (docs/design.md §10). */
export function PlantSelector() {
  const { currentPlant, availablePlants, selectPlant, isLoadingPlants, plantsError, reloadPlants } = usePlant()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function choose(plant: (typeof availablePlants)[number] | null) {
    selectPlant(plant?.id ?? null)
    if (!plant) return navigate('/')
    // Si ya estás dentro de un módulo de planta, conservas la sección en la planta nueva.
    const section = pathname.match(/^\/plants\/[^/]+\/([^/]+)/)?.[1] ?? 'dashboard'
    navigate(`/plants/${plant.slug}/${section}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 border border-white/20 px-3 text-white hover:bg-fur-navy-800 hover:text-white aria-expanded:bg-fur-navy-800"
          aria-label="Seleccionar planta"
        >
          {currentPlant ? <Factory /> : <Globe />}
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] font-semibold tracking-wider text-fur-gold-400 uppercase">
              {currentPlant ? 'Planta' : 'Contexto'}
            </span>
            <span className="max-w-40 truncate text-sm">
              {currentPlant ? currentPlant.name : 'Ecosistema global'}
            </span>
          </span>
          <ChevronsUpDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Contexto de trabajo</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => choose(null)}>
          <Globe /> Ecosistema global
          {!currentPlant && <Check className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Plantas disponibles</DropdownMenuLabel>
        {isLoadingPlants ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Cargando plantas…</p>
        ) : plantsError ? (
          <div className="space-y-2 px-2 py-3 text-sm" role="alert">
            <p className="text-fur-red-500">No se pudieron cargar las plantas. Revisa que la API y la base de datos estén en marcha.</p>
            <Button size="sm" variant="secondary" onClick={() => reloadPlants?.()}>
              Reintentar
            </Button>
          </div>
        ) : availablePlants.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Aún no hay plantas visibles.</p>
        ) : (
          availablePlants.map((plant) => (
            <DropdownMenuItem key={plant.id} onSelect={() => choose(plant)}>
              <Factory /> {plant.name}
              {plant.id === currentPlant?.id && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
