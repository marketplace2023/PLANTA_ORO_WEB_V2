import { ClipboardList, ExternalLink, Factory, Info, ListChecks, Maximize2, Package, Settings2, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { CatalogModel } from '@/features/assets/use-assets'
import { apiUrl } from '@/lib/api'

type NamedCode = { code: string; name: string }

const PENDING = 'Por determinar'

/** «diameterIn» → «Diameter in»; las claves de las especificaciones vienen en camelCase. */
const humanizeKey = (key: string) => {
  // Las etiquetas importadas ya tienen nombre y unidad legibles (p. ej. «Potencia (kW)»).
  if (/\s|[()]/u.test(key)) return key
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function Section({ n, icon: Icon, title, hint, children }: { n: number; icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
      <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 text-sm font-semibold text-fur-navy-900 sm:px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-fur-navy-900/5">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {n}. {title}
          {hint && <span className="mt-0.5 block text-xs font-normal text-fur-gray-600 sm:ml-2 sm:inline">{hint}</span>}
        </span>
      </h3>
      {children}
    </section>
  )
}

function KeyValue({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1.5 px-4 py-3 odd:bg-fur-gray-50/70 sm:grid-cols-[minmax(0,32%)_minmax(0,1fr)] sm:gap-5 sm:px-5">
          <dt className="min-w-0 leading-relaxed font-medium text-fur-navy-900 [overflow-wrap:anywhere]">{label}</dt>
          <dd className="min-w-0 leading-relaxed text-fur-gray-800 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Pending({ children = PENDING }: { children?: ReactNode }) {
  return <span className="text-fur-gray-500">{children}</span>
}

type ReferenceManufacturer = { nombre: string; alcance: string | null; sitioWeb: string | null }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textOrNull = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)

/**
 * Los datos técnicos del modelo traen, además de pares clave-valor sueltos, tres bloques que la ficha muestra en su
 * propia sección: `identificacion` (etiqueta → valor), `componentes` (lista) y `fabricantesReferencia`.
 */
function readTechnicalData(technicalData: Record<string, unknown>, specifications: Record<string, unknown>) {
  const { identificacion, componentes, fabricantesReferencia, fuente, ...rest } = technicalData
  const identification: Array<[string, string]> = isRecord(identificacion)
    ? Object.entries(identificacion).flatMap(([k, v]): Array<[string, string]> => {
        const text = textOrNull(v)
        return text ? [[k, text]] : []
      })
    : []
  const components = Array.isArray(componentes) ? componentes.filter((c): c is string => typeof c === 'string' && c.trim().length > 0) : []
  const manufacturers: ReferenceManufacturer[] = Array.isArray(fabricantesReferencia)
    ? fabricantesReferencia.filter(isRecord).flatMap((m) => {
        const nombre = textOrNull(m.nombre)
        return nombre ? [{ nombre, alcance: textOrNull(m.alcance), sitioWeb: textOrNull(m.sitioWeb) }] : []
      })
    : []
  return { identification, components, manufacturers, source: textOrNull(fuente), specs: Object.entries({ ...rest, ...specifications }) }
}

/** Solo se enlazan direcciones http(s); cualquier otra cosa se muestra como texto. */
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

/**
 * Ficha técnica preliminar de un MODELO del catálogo global, con la misma estructura para todos (la de la ficha del
 * activo físico): identificación, especificaciones técnicas, componentes y fabricantes de referencia. Lo que aún no se
 * conoce se muestra como «Por determinar». No es la ficha de un activo de una planta.
 */
export function ModelFichaDialog({
  model,
  stages,
  networks,
  onClose,
}: {
  model: CatalogModel
  stages: NamedCode[]
  networks: NamedCode[]
  onClose: () => void
}) {
  const stageName = (code: string) => stages.find((s) => s.code === code)?.name
  const networkName = (code: string) => networks.find((n) => n.code === code)?.name ?? code

  const { identification, components, manufacturers, source, specs } = readTechnicalData(model.technicalData, model.specifications)
  const hasComponents = components.length > 0
  const manufacturersSectionNumber = hasComponents ? 4 : 3
  const recordState = identification.find(([k]) => k === 'Estado de la ficha')?.[1]
  // Orden de la ficha de planta: proyecto, TAG activo, TAG mapa, FUR, etapa, clasificación, criticidad.
  const LEADING = ['Proyecto', 'TAG activo', 'TAG mapa', 'Código FUR', 'Etapa de proceso', 'Clasificación', 'Criticidad']
  const leading = LEADING.flatMap((k) => identification.filter(([key]) => key.toLocaleLowerCase('es') === k.toLocaleLowerCase('es')))
  const description = model.type.description?.trim() || null
  const imageUrl = model.imageUrl ? apiUrl(model.imageUrl) : null


  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-2xl bg-fur-gray-50 p-0 shadow-2xl sm:max-w-6xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
      >
        <header className="flex shrink-0 items-center gap-4 border-b-2 border-fur-gold-500 bg-fur-navy-900 px-4 py-4 text-white sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base leading-snug font-semibold tracking-tight sm:text-xl">Ficha técnica del activo físico</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed text-white/70">
              Catálogo FUR | {model.family.name} — {model.type.name}
            </DialogDescription>
          </div>
          <p className="hidden shrink-0 border-l border-white/20 pl-4 text-xs leading-relaxed text-white/70 lg:block">
            Planta de
            <br />
            beneficio de oro
          </p>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-white hover:bg-white/15 hover:text-white" aria-label="Cerrar">
              <X />
            </Button>
          </DialogClose>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 sm:p-6">
          <div className="grid overflow-hidden rounded-xl border border-border bg-white md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex items-center p-5 sm:p-7">
              <div className="min-w-0 space-y-4">
                <span className="inline-block border-l-2 border-fur-gold-500 pl-2 text-xs font-semibold text-fur-navy-900">{model.family.name}</span>
                <h2 className="text-2xl leading-tight font-semibold tracking-tight text-fur-navy-900 [overflow-wrap:anywhere] sm:text-3xl">{model.modelName}</h2>
                <div className="space-y-1">
                  <p className="text-sm leading-relaxed font-medium text-fur-gray-800">{description ?? model.type.name}</p>
                  {description && <p className="text-xs leading-relaxed text-fur-gray-600">{model.type.name}</p>}
                  {manufacturers.length > 0 && <p className="text-xs leading-relaxed text-fur-gray-600">{[...new Set(manufacturers.map(m => m.nombre))].join(', ')}</p>}
                </div>
              </div>
            </div>
            <div className="relative grid min-h-48 place-items-center overflow-hidden border-t border-border bg-fur-gray-100/60 md:border-t-0 md:border-l">
              {imageUrl ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="group relative block min-h-48 w-full cursor-zoom-in self-stretch outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-fur-gold-500 sm:min-h-80" aria-label={`Ampliar foto de ${model.modelName}`}>
                      <img src={imageUrl} alt={`Foto de ${model.modelName}`} className="absolute inset-0 size-full object-cover" />
                      <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-fur-navy-900 shadow-sm transition-colors group-hover:bg-fur-gold-500 group-focus-visible:bg-fur-gold-500">
                        <Maximize2 className="size-3.5" aria-hidden /> Ampliar
                      </span>
                    </button>
                  </DialogTrigger>
                  <DialogContent showCloseButton={false} className="flex max-h-[94dvh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden rounded-xl bg-fur-navy-950 p-0 text-white shadow-2xl sm:max-w-[96vw]">
                    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
                      <DialogTitle className="line-clamp-2 text-sm leading-snug font-medium" title={model.modelName}>Imagen de {model.modelName}</DialogTitle>
                      <DialogDescription className="sr-only">Fotografía ampliada del modelo. Cierra esta vista para volver a la ficha técnica.</DialogDescription>
                      <DialogClose asChild>
                        <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-white hover:bg-white/15 hover:text-white" aria-label="Cerrar imagen">
                          <X />
                        </Button>
                      </DialogClose>
                    </header>
                    <div className="flex min-h-0 items-center justify-center bg-black/20 p-2 sm:p-3">
                      <img src={imageUrl} alt={`Foto ampliada de ${model.modelName}`} className="max-h-[calc(94dvh-6rem)] w-full object-contain" />
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <span className="flex flex-col items-center gap-3 py-10 text-xs text-fur-gray-600">
                  <Package className="size-12 text-fur-navy-900/35" strokeWidth={1} aria-hidden />
                  Sin foto del modelo
                </span>
              )}
            </div>
          </div>

          <Section n={1} icon={ClipboardList} title="Identificación del activo">
            <KeyValue
              rows={[
                // Primero lo que identifica al activo en el inventario (como en la ficha de planta), luego lo del catálogo.
                ...leading.map(([k, v]): [string, ReactNode] => [k, v]),
                ['Familia', model.family.name],
                ['Tipo de activo', model.type.name],
                ['Modelo', model.modelName],
                [
                  'Etapas donde participa',
                  model.stageCodes.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {model.stageCodes.map((c) => (
                        <li key={c} className="rounded-md bg-fur-navy-900/5 px-2 py-1 text-xs text-fur-navy-900" title={stageName(c)}>
                          <span className="fur-code">{c}</span>
                          {stageName(c) && <span className="hidden sm:inline"> · {stageName(c)}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Pending>Sin asignar</Pending>
                  ),
                ],
                [
                  'Redes transversales',
                  model.networkCodes.length > 0 ? model.networkCodes.map(networkName).join(' · ') : <Pending>Sin asignar</Pending>,
                ],
                [
                  'Estado de la ficha',
                  <span key="st" className="font-medium text-amber-900">
                    {recordState ?? 'REFERENCIAL — catálogo global, pendiente de validación en planta'}
                  </span>,
                ],
              ]}
            />
          </Section>

          <Section n={2} icon={Settings2} title="Especificaciones Técnicas">
            {specs.length > 0 ? (
              <KeyValue rows={specs.map(([k, v]) => [humanizeKey(k), String(v)])} />
            ) : (
              <p className="px-5 py-5 text-sm text-fur-gray-600">Sin especificaciones técnicas registradas.</p>
            )}
          </Section>

          {hasComponents && (
            <Section n={3} icon={ListChecks} title="Componentes principales" hint="(verificar en campo)">
              <ol className="divide-y divide-border text-sm">
                {components.map((c, i) => (
                  <li key={`${i}-${c}`} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-fur-gold-500/15 font-mono text-xs font-medium text-fur-navy-900">{i + 1}</span>
                    <span className="min-w-0 leading-relaxed text-fur-gray-800 [overflow-wrap:anywhere]">{c}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <div className="grid items-stretch gap-5 lg:grid-cols-2">
            <Section n={manufacturersSectionNumber} icon={Factory} title="Fabricantes de referencia y web">
              {manufacturers.length > 0 ? (
                <ul className="divide-y divide-border">
                  {manufacturers.map((m, i) => {
                    const url = safeUrl(m.sitioWeb)
                    return (
                      <li key={`${i}-${m.nombre}`} className="space-y-2 px-4 py-4 sm:px-5">
                        <div className="flex items-start gap-3">
                          <Factory className="mt-0.5 size-4 shrink-0 text-fur-gray-500" aria-hidden />
                          <div className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]">
                            <p className="text-sm font-semibold text-fur-navy-900">{m.nombre}</p>
                            {m.alcance && <p className="text-sm leading-relaxed text-fur-gray-600">{m.alcance}</p>}
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-sm text-xs font-medium text-fur-navy-800 underline decoration-fur-gold-500 decoration-2 underline-offset-4 outline-none hover:decoration-fur-navy-900 focus-visible:ring-2 focus-visible:ring-ring">
                                <span className="min-w-0 [overflow-wrap:anywhere]">{new URL(url).hostname.replace(/^www\./, '')}</span> <ExternalLink className="size-3 shrink-0" aria-hidden />
                              </a>
                            ) : (
                              m.sitioWeb && <p className="text-xs text-fur-gray-600">{m.sitioWeb}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-5 py-5 text-sm">
                  <Pending>Sin fabricantes de referencia registrados</Pending>
                </p>
              )}
            </Section>

            <aside className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-sm text-fur-gray-800">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-fur-gold-500/20">
                <Info className="size-4 text-amber-900" aria-hidden />
              </span>
              <div className="min-w-0 space-y-3">
                <p className="pt-1 font-semibold text-fur-navy-900">{manufacturersSectionNumber + 1}. Nota técnica</p>
                <p className="leading-relaxed">
                  Información preliminar y referencial del catálogo global: describe el modelo, no un equipo en particular. Los fabricantes son
                  referencias comerciales, no marcas instaladas verificadas.
                </p>
                {source && <p className="text-xs text-fur-gray-600">Fuente: {source}</p>}
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
