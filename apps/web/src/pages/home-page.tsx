import { Cable, ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorState } from '@/components/base/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PlantMapCards } from '@/components/home/plant-map-cards'
import { useNetworkCatalog, useStageCatalog, type NetworkMaster, type StageMaster } from '@/features/catalog/use-catalog'
import { apiUrl } from '@/lib/api'
import { stageGroupLabel } from '@/lib/stage-groups'

/** Lo que el detalle necesita de una etapa o de una red del catálogo maestro. */
type CatalogEntry = { id: string; code: string; name: string; description: string | null; layoutImageUrl: string | null }

/** Textos del detalle según sea una etapa o una red (el diseño es el mismo). */
const KIND = {
  stage: { noun: 'Etapa', navPrev: 'Etapa anterior', navNext: 'Etapa siguiente', navLabel: 'Navegar entre etapas', imageAlt: 'Layout de la etapa', zoomAlt: 'Ampliar el layout de la etapa', noImage: 'Esta etapa aún no tiene imagen de layout.', noDescription: 'Esta etapa aún no tiene descripción.', zoomCaption: 'Imagen del layout a tamaño completo.' },
  network: { noun: 'Red', navPrev: 'Red anterior', navNext: 'Red siguiente', navLabel: 'Navegar entre redes', imageAlt: 'Imagen de la red', zoomAlt: 'Ampliar la imagen de la red', noImage: 'Esta red aún no tiene imagen.', noDescription: 'Esta red aún no tiene descripción.', zoomCaption: 'Imagen de la red a tamaño completo.' },
} as const

/** Detalle de una etapa o red: su imagen y la descripción que el administrador registró en el catálogo maestro. */
function CatalogDetailDialog<T extends CatalogEntry>({
  kind,
  items,
  item,
  subtitle,
  onSelect,
  onClose,
}: {
  kind: keyof typeof KIND
  items: T[]
  item: T
  subtitle: string
  onSelect: (item: T) => void
  onClose: () => void
}) {
  const t = KIND[kind]
  const [zoomed, setZoomed] = useState(false)
  const imageUrl = item.layoutImageUrl ? apiUrl(item.layoutImageUrl) : null
  const imageAlt = `${t.imageAlt} ${item.code}: ${item.name}`
  const index = items.findIndex((s) => s.id === item.id)
  const prev = index > 0 ? items[index - 1] : null
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null

  // Flechas ← → para recorrer el catálogo (en la ventana: al deshabilitarse un botón el foco sale del diálogo).
  useEffect(() => {
    if (zoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prev) onSelect(prev)
      if (e.key === 'ArrowRight' && next) onSelect(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed, prev, next, onSelect])

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          // El foco inicial no debe quedar en un botón (se vería marcado al abrir).
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).focus()
          }}
        >
          <DialogHeader className="flex-row items-center gap-3 bg-fur-navy-900 px-5 py-3.5 text-white">
            <span className="fur-code rounded-md bg-fur-gold-400 px-2 py-1 text-sm font-semibold text-fur-navy-900">{item.code}</span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg leading-tight text-balance text-white">{item.name}</DialogTitle>
              <DialogDescription className="text-xs text-white/70">
                {subtitle} · {t.noun} {index + 1} de {items.length}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-white hover:bg-white/15 hover:text-white" aria-label="Cerrar">
                <X />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label={`${t.zoomAlt} ${item.code}`}
                className="group relative block w-full cursor-zoom-in bg-fur-gray-100 p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <img src={imageUrl} alt={imageAlt} className="mx-auto max-h-[max(220px,calc(94vh_-_380px))] w-full rounded-md object-contain shadow-sm" />
                <span className="absolute right-5 bottom-5 inline-flex items-center gap-1.5 rounded-md bg-fur-navy-900/90 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm">
                  <Maximize2 className="size-3.5" aria-hidden /> Ampliar
                </span>
              </button>
            ) : (
              <p className="m-5 grid h-36 place-items-center gap-1 rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
                <ImageOff className="size-6" aria-hidden />
                {t.noImage}
              </p>
            )}

            <div className="px-5 py-5 sm:px-8 sm:py-6">
              {item.description ? (
                <div className="mx-auto max-w-[76ch]">
                  <h3 className="mb-2 text-[0.7rem] font-semibold tracking-widest text-fur-gray-500 uppercase">Descripción</h3>
                  {/* Justificado en una columna de lectura, sin línea final huérfana. En pantallas anchas no se corta ninguna palabra; en el celular la columna es tan corta que sí se separa en sílabas para no abrir huecos. */}
                  <p className="text-[0.95rem] leading-7 whitespace-pre-line text-justify text-fur-gray-800 [text-justify:inter-word] [text-wrap:pretty] max-sm:hyphens-auto">
                    {item.description}
                  </p>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">{t.noDescription}</p>
              )}
            </div>
          </div>

          <nav aria-label={t.navLabel} className="flex items-center justify-between gap-2 border-t border-border bg-fur-gray-50 px-3 py-2">
            <Button type="button" variant="ghost" size="sm" disabled={!prev} onClick={() => prev && onSelect(prev)} aria-label={t.navPrev} className="min-w-0 justify-start disabled:invisible">
              <ChevronLeft />
              {prev && (
                <span className="min-w-0 truncate">
                  <span className="fur-code">{prev.code}</span>
                  <span className="hidden text-muted-foreground sm:inline"> · {prev.name}</span>
                </span>
              )}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!next} onClick={() => next && onSelect(next)} aria-label={t.navNext} className="min-w-0 justify-end disabled:invisible">
              {next && (
                <span className="min-w-0 truncate">
                  <span className="hidden text-muted-foreground sm:inline">{next.name} · </span>
                  <span className="fur-code">{next.code}</span>
                </span>
              )}
              <ChevronRight />
            </Button>
          </nav>
        </DialogContent>
      </Dialog>

      {zoomed && imageUrl && (
        <Dialog open onOpenChange={(open) => !open && setZoomed(false)}>
          <DialogContent className="w-[96vw] max-w-[96vw] gap-2 p-2 sm:max-w-[96vw]">
            <DialogTitle className="sr-only">{imageAlt}</DialogTitle>
            <DialogDescription className="sr-only">{t.zoomCaption}</DialogDescription>
            <div className="max-h-[90vh] overflow-auto rounded-md bg-white">
              <img src={imageUrl} alt={imageAlt} className="mx-auto h-auto w-full max-w-none" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function NetworkCatalog() {
  const { data, isLoading, isError, refetch } = useNetworkCatalog()
  const [open, setOpen] = useState<NetworkMaster | null>(null)

  return (
    <section aria-labelledby="networks-title">
      <h2 id="networks-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
        <Cable className="size-5" /> Redes Transversales
      </h2>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)
            : data?.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setOpen(n)}
                  aria-label={`Ver la red ${n.code}: ${n.name}`}
                  className="rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card className="h-full border-l-4 transition-shadow hover:shadow-md" style={{ borderLeftColor: n.colorToken ? `var(--${n.colorToken})` : undefined }}>
                    <CardContent className="space-y-1">
                      <p className="fur-code text-fur-navy-900">{n.code}</p>
                      <p className="font-semibold">{n.name}</p>
                    </CardContent>
                  </Card>
                </button>
              ))}
        </div>
      )}
      {open && data && <CatalogDetailDialog kind="network" items={data} item={open} subtitle="Red transversal" onSelect={setOpen} onClose={() => setOpen(null)} />}
    </section>
  )
}

function StageCatalog() {
  const { data, isLoading, isError, refetch } = useStageCatalog()
  const [open, setOpen] = useState<StageMaster | null>(null)

  return (
    <section aria-labelledby="stages-title">
      <h2 id="stages-title" className="mb-3 text-xl text-fur-navy-900">
        Etapas del proceso
      </h2>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-16" />)
            : data?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setOpen(s)}
                  aria-label={`Ver la etapa ${s.code}: ${s.name}`}
                  className="rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card size="sm" className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-3">
                      <span className="fur-code rounded-md bg-fur-navy-900 px-2 py-1 text-fur-gold-400">{s.code}</span>
                      <span className="text-sm font-medium">{s.name}</span>
                    </CardContent>
                  </Card>
                </button>
              ))}
        </div>
      )}
      {open && data && <CatalogDetailDialog kind="stage" items={data} item={open} subtitle={stageGroupLabel(open.stageGroup)} onSelect={setOpen} onClose={() => setOpen(null)} />}
    </section>
  )
}

export function HomePage() {
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Página principal</h1>
      <PlantMapCards />
      <StageCatalog />
      <NetworkCatalog />
    </div>
  )
}
