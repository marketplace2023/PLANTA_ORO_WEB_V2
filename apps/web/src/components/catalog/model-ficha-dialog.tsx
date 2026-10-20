import { ClipboardList, ExternalLink, Factory, Info, ListChecks, Package, Settings2, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useModelVariables, type CatalogModel, type ModelVariable } from '@/features/assets/use-assets'
import { apiUrl } from '@/lib/api'
import { formatVariableValue } from '@/lib/variable-value'

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
    <section className="overflow-hidden rounded-lg border border-sky-200 bg-white">
      <h3 className="flex items-center gap-2 bg-sky-100 px-3 py-2 text-sm font-bold tracking-wide text-fur-navy-800 uppercase">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span>
          {n}. {title}
        </span>
        {hint && <span className="text-[0.7rem] font-semibold text-fur-navy-800/70 normal-case">{hint}</span>}
      </h3>
      {children}
    </section>
  )
}

function KeyValue({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="divide-y divide-sky-100 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(7rem,34%)_1fr] gap-3 px-3 py-1.5">
          <dt className="font-semibold text-fur-navy-900">{label}</dt>
          <dd className="text-fur-gray-800">{value}</dd>
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
  const components = Array.isArray(componentes) ? componentes.filter((c): c is string => typeof c === 'string') : []
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

/** Un parámetro con su valor propio, el general de la variable o «Por determinar». */
function ValueCell({ def }: { def: ModelVariable }) {
  const own = def.value === null ? null : formatVariableValue(def.valueType, def.value, def.unit)
  if (own !== null) return <span className="font-medium text-fur-navy-900">{own}</span>
  const general = def.defaultValue === null || def.defaultValue === undefined ? null : formatVariableValue(def.valueType, def.defaultValue, def.unit)
  if (general !== null)
    return (
      <span className="font-medium text-fur-navy-900">
        {general} <span className="text-xs font-normal text-fur-gray-500">(general)</span>
      </span>
    )
  return <Pending />
}

function ParametersTable({ defs }: { defs: ModelVariable[] }) {
  const grouped = new Set(defs.map((d) => d.group ?? '')).size > 1
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-sky-100 text-left text-xs font-bold text-fur-navy-800">
          <th className="px-3 py-1.5">Parámetro técnico</th>
          <th className="w-24 px-3 py-1.5 text-center">Unidad</th>
          <th className="w-[38%] px-3 py-1.5">Valor / estado</th>
        </tr>
      </thead>
      <tbody>
        {defs.map((d, i) => {
          const header = grouped && (i === 0 || defs[i - 1].group !== d.group)
          return [
            header && (
              <tr key={`g-${d.id}`} className="bg-sky-50">
                <th colSpan={3} className="px-3 py-1 text-left text-[0.7rem] font-bold tracking-wide text-fur-navy-800/80 uppercase">
                  {d.group ?? 'Otros datos'}
                </th>
              </tr>
            ),
            <tr key={d.id} className="border-b border-sky-50 last:border-0">
              <td className="px-3 py-1.5 text-fur-gray-800">{d.label}</td>
              <td className="px-3 py-1.5 text-center text-fur-gray-600">{d.unit ?? '—'}</td>
              <td className="px-3 py-1.5">
                <ValueCell def={d} />
              </td>
            </tr>,
          ]
        })}
      </tbody>
    </table>
  )
}

/**
 * Ficha técnica preliminar de un MODELO del catálogo global, con la misma estructura para todos (la de la ficha del
 * activo físico): identificación, parámetros técnicos, componentes y fabricantes de referencia. Lo que aún no se
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
  const variables = useModelVariables(model.id)
  const stageName = (code: string) => stages.find((s) => s.code === code)?.name
  const networkName = (code: string) => networks.find((n) => n.code === code)?.name ?? code

  // Todos los parámetros del tipo en una sola tabla (como la ficha del activo): los que aplican a alguna de las etapas del
  // tipo, o a todas, en el orden en que se definieron.
  const defs = (variables.data ?? [])
    .filter((d) => d.stageCodes.length === 0 || model.stageCodes.length === 0 || d.stageCodes.some((c) => model.stageCodes.includes(c)))
    .sort((x, y) => x.sortOrder - y.sortOrder)

  const { identification, components, manufacturers, source, specs } = readTechnicalData(model.technicalData, model.specifications)
  const recordState = identification.find(([k]) => k === 'Estado de la ficha')?.[1]
  // Orden de la ficha de planta: proyecto, TAG activo, TAG mapa, FUR, etapa, clasificación, criticidad.
  const LEADING = ['Proyecto', 'TAG activo', 'TAG mapa', 'Código FUR', 'Etapa de proceso', 'Clasificación', 'Criticidad']
  const leading = LEADING.flatMap((k) => identification.filter(([key]) => key.toLocaleLowerCase('es') === k.toLocaleLowerCase('es')))
  const description = model.type.description?.trim() || null
  const imageUrl = model.imageUrl ? apiUrl(model.imageUrl) : null
  const manufacturer = model.manufacturer ? `${model.manufacturer.name}${model.manufacturer.countryCode ? ` · ${model.manufacturer.countryCode}` : ''}` : null

  const specsNumber = 5
  const noteNumber = specs.length > 0 ? 6 : 5
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[94vh] flex-col gap-0 overflow-hidden bg-sky-50/60 p-0 sm:max-w-6xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
      >
        <header className="flex items-center gap-4 bg-fur-navy-900 px-5 py-3.5 text-white sm:px-7">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl leading-tight font-black tracking-tight uppercase sm:text-3xl">Ficha técnica del activo físico</DialogTitle>
            <DialogDescription className="mt-1 text-xs font-semibold tracking-wide text-white/85 uppercase sm:text-sm">
              Catálogo FUR | {model.family.name} — {model.type.name}
            </DialogDescription>
          </div>
          <p className="hidden shrink-0 border-l border-white/40 pl-4 text-sm leading-tight text-white/90 sm:block">
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="flex items-center gap-4 rounded-lg bg-sky-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-2xl leading-tight font-black tracking-tight text-fur-navy-900 uppercase sm:text-3xl">{model.modelName}</h2>
                <p className="mt-1 text-base font-semibold text-sky-800 sm:text-lg">{description ?? model.type.name}</p>
                {description && <p className="text-sm text-fur-gray-600">{model.type.name}</p>}
                <p className="text-sm text-fur-gray-600">{manufacturer ?? 'Fabricante genérico'}</p>
              </div>
            </div>
            <div className="grid min-h-40 place-items-center overflow-hidden rounded-lg border border-sky-200 bg-white">
              {imageUrl ? (
                <img src={imageUrl} alt={`Foto de ${model.modelName}`} className="max-h-60 w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-1 py-6 text-xs text-fur-gray-500">
                  <Package className="size-10" aria-hidden />
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
                ['Fabricante', manufacturer ?? <Pending>Genérico</Pending>],
                [
                  'Etapas donde participa',
                  model.stageCodes.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {model.stageCodes.map((c) => (
                        <li key={c} className="rounded bg-fur-navy-900 px-1.5 py-0.5 text-xs text-white" title={stageName(c)}>
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
                  model.type.networkCodes.length > 0 ? model.type.networkCodes.map(networkName).join(' · ') : <Pending>Sin asignar</Pending>,
                ],
                [
                  'Estado de la ficha',
                  <span key="st" className="font-semibold text-fur-red-500">
                    {recordState ?? 'REFERENCIAL — catálogo global, pendiente de validación en planta'}
                  </span>,
                ],
              ]}
            />
          </Section>

          <div className="grid items-start gap-3 lg:grid-cols-2">
            {variables.isLoading ? (
              <Skeleton className="h-40 rounded-lg" aria-busy="true" aria-label="Cargando parámetros" />
            ) : (
              <Section n={2} icon={Settings2} title="Parámetros técnicos" hint="(por confirmar)">
                {defs.length > 0 ? (
                  <ParametersTable defs={defs} />
                ) : (
                  <p className="px-3 py-3 text-sm text-fur-gray-600">Este tipo de activo aún no tiene parámetros técnicos definidos.</p>
                )}
              </Section>
            )}

            <Section n={3} icon={ListChecks} title="Componentes principales" hint="(verificar en campo)">
              {components.length > 0 ? (
                <ol className="divide-y divide-sky-100 text-sm">
                  {components.map((c, i) => (
                    <li key={`${i}-${c}`} className="grid grid-cols-[2.5rem_1fr] gap-2 px-3 py-1.5">
                      <span className="text-center font-semibold text-sky-800">{i + 1}</span>
                      <span className="text-fur-gray-800">{c}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-3 py-3 text-sm">
                  <Pending />
                </p>
              )}
            </Section>
          </div>

          {specs.length > 0 && (
            <Section n={specsNumber} icon={Factory} title="Especificaciones del modelo">
              <KeyValue rows={specs.map(([k, v]) => [humanizeKey(k), String(v)])} />
            </Section>
          )}

          <div className="grid items-start gap-3 lg:grid-cols-2">
            <Section n={4} icon={Factory} title="Fabricantes de referencia y web">
              {manufacturers.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sky-100 text-left text-xs font-bold text-fur-navy-800">
                      <th className="px-3 py-1.5">Fabricante</th>
                      <th className="px-3 py-1.5">Descripción</th>
                      <th className="px-3 py-1.5">Sitio web</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manufacturers.map((m) => {
                      const url = safeUrl(m.sitioWeb)
                      return (
                        <tr key={`${m.nombre}-${m.alcance}`} className="border-b border-sky-50 last:border-0">
                          <td className="px-3 py-1.5 font-semibold text-fur-navy-900">{m.nombre}</td>
                          <td className="px-3 py-1.5 text-fur-gray-800">{m.alcance ?? '—'}</td>
                          <td className="px-3 py-1.5">
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-800 underline underline-offset-2">
                                {new URL(url).hostname.replace(/^www\./, '')} <ExternalLink className="size-3" aria-hidden />
                              </a>
                            ) : (
                              (m.sitioWeb ?? '—')
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-3 text-sm">
                  <Pending>Sin fabricantes de referencia registrados</Pending>
                </p>
              )}
            </Section>

            <aside className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-fur-gray-800">
              <Info className="mt-0.5 size-5 shrink-0 text-fur-navy-800" aria-hidden />
              <div className="space-y-1">
                <p className="font-bold text-fur-navy-800 uppercase">{noteNumber}. Nota técnica</p>
                <p>
                  Información preliminar y referencial del catálogo global: describe el modelo, no un equipo en particular. Los datos reales,
                  componentes y mantenimiento de cada activo se registran en Activos Físicos de la planta y se validan con planos, manual del fabricante e
                  inspección en campo. Los fabricantes son referencias comerciales, no marcas instaladas verificadas.
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
