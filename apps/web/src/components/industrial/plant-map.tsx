import { Map as MapIcon, Maximize2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { usePlant, type PlantSummary } from '@/features/plant/plant-context'
import { plantMapUrl } from '@/lib/plant-maps'

type Entry = { plant: PlantSummary; url: string }

/** Imagen del mapa; al pulsarla se abre a tamaño completo (los diagramas tienen letra pequeña). */
function MapFigure({ entry, onOpen, large }: { entry: Entry; onOpen: (e: Entry) => void; large?: boolean }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="group relative block w-full cursor-zoom-in bg-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Ampliar el mapa de ${entry.plant.name}`}
      >
        <img
          src={entry.url}
          alt={`Mapa de ${entry.plant.name}`}
          loading="lazy"
          className={large ? 'mx-auto max-h-[36rem] w-full object-contain' : 'aspect-[3/2] w-full object-contain'}
        />
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-fur-navy-900/85 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="size-3.5" aria-hidden /> Ampliar
        </span>
      </button>
      <figcaption className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm">
        <span className="font-semibold text-fur-navy-900">{entry.plant.name}</span>
        <span className="fur-code text-fur-gray-600">{entry.plant.code}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Mapa de la planta seleccionada (selector de contexto). Sin planta elegida ("Ecosistema global") muestra los mapas
 * de todas las plantas visibles. Una planta sin mapa no muestra nada, salvo aviso si es la elegida.
 */
export function PlantMap() {
  const { currentPlant, availablePlants } = usePlant()
  const [open, setOpen] = useState<Entry | null>(null)

  const entries: Entry[] = (currentPlant ? [currentPlant] : availablePlants).flatMap((plant) => {
    const url = plantMapUrl(plant.code)
    return url ? [{ plant, url }] : []
  })

  if (entries.length === 0 && !currentPlant) return null

  return (
    <section aria-labelledby="plant-map-title" className="mb-6">
      <h2 id="plant-map-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
        <MapIcon className="size-5" aria-hidden /> {currentPlant ? `Mapa de ${currentPlant.name}` : 'Mapas de las plantas'}
      </h2>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {currentPlant?.name} aún no tiene un mapa cargado.
        </p>
      ) : (
        <div className={currentPlant ? '' : 'grid gap-4 md:grid-cols-2'}>
          {entries.map((e) => (
            <MapFigure key={e.plant.id} entry={e} onOpen={setOpen} large={!!currentPlant} />
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="w-[96vw] max-w-[96vw] gap-2 p-2 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Mapa de {open?.plant.name}</DialogTitle>
          <DialogDescription className="sr-only">Imagen del mapa a tamaño completo.</DialogDescription>
          {open && (
            <div className="max-h-[88vh] overflow-auto rounded-md bg-white">
              <img src={open.url} alt={`Mapa de ${open.plant.name}`} className="mx-auto h-auto w-full max-w-none" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
