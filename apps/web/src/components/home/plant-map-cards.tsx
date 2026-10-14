import { Maximize2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/** Mapas (diagramas) de las plantas del ecosistema, servidos desde /public. Los nombres de archivo llevan espacios: se codifican. */
const MAPS = [
  { name: 'Caratal', file: 'MAPA CARATAL.jpeg' },
  { name: 'Mina Sosa', file: 'MAPA MINA SOSA.jpeg' },
  { name: 'Minacolombia', file: 'MAPA MINACOLOMBIA.jpeg' },
  { name: 'Revemin', file: 'MAPA REVEMIN.png' },
].map((m) => ({ ...m, url: `/${encodeURIComponent(m.file)}` }))

type MapCard = (typeof MAPS)[number]

/**
 * Página principal: una tarjeta con la imagen del mapa de cada planta. Al pulsarla se abre a tamaño completo (los
 * diagramas tienen letra pequeña).
 */
export function PlantMapCards() {
  const [open, setOpen] = useState<MapCard | null>(null)

  return (
    <section aria-labelledby="home-maps-title">
      <h2 id="home-maps-title" className="sr-only">
        Mapas de las plantas
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MAPS.map((m) => (
          <li key={m.name}>
            <button
              type="button"
              onClick={() => setOpen(m)}
              aria-label={`Ampliar el mapa de ${m.name}`}
              className="group block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-white">
                <img src={m.url} alt={`Mapa de ${m.name}`} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-fur-navy-900/85 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 className="size-3.5" aria-hidden /> Ampliar
                </span>
              </span>
              <span className="block border-t border-border px-4 py-3 text-base font-semibold text-fur-navy-900">{m.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="w-[96vw] max-w-[96vw] gap-2 p-2 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Mapa de {open?.name}</DialogTitle>
          <DialogDescription className="sr-only">Imagen del mapa a tamaño completo.</DialogDescription>
          {open && (
            <div className="max-h-[88vh] overflow-auto rounded-md bg-white">
              <img src={open.url} alt={`Mapa de ${open.name}`} className="mx-auto h-auto w-full max-w-none" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
