import { ClipboardList, Cpu, Factory, Info, Package, Settings2, X, type LucideIcon } from 'lucide-react'
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
  const grouped = defs.some((d) => d.group)
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
 * Ficha técnica preliminar de un MODELO del catálogo global (con el formato de la ficha del activo físico): su
 * identificación y las variables por red transversal (proceso, potencia…). No es la ficha de un activo de una planta.
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

  // Variables que aplican a alguna de las etapas del tipo (si el tipo no tiene etapas asignadas, todas).
  const defs = (variables.data ?? []).filter(
    (d) => d.stageCodes.length === 0 || model.type.stageCodes.length === 0 || d.stageCodes.some((c) => model.type.stageCodes.includes(c)),
  )
  const orderedNetworks = [...networks.map((n) => n.code), ...defs.flatMap((d) => d.networkCodes)].filter((c, i, all) => all.indexOf(c) === i)
  const sections: Array<{ key: string; title: string; defs: ModelVariable[] }> = [
    ...orderedNetworks
      .map((code) => ({ key: code, title: `${networkName(code)} (${code})`, defs: defs.filter((d) => d.networkCodes.includes(code)) }))
      .filter((s) => s.defs.length > 0),
    ...(defs.some((d) => d.networkCodes.length === 0) ? [{ key: 'general', title: 'Parámetros generales', defs: defs.filter((d) => d.networkCodes.length === 0) }] : []),
  ]

  const specs = Object.entries({ ...model.technicalData, ...model.specifications })
  const imageUrl = model.imageUrl ? apiUrl(model.imageUrl) : null
  const manufacturer = model.manufacturer ? `${model.manufacturer.name}${model.manufacturer.countryCode ? ` · ${model.manufacturer.countryCode}` : ''}` : null

  // Numeración de las secciones: 1 identificación, luego una por red (o una sola si no hay variables) y al final las especificaciones.
  const parametersCount = variables.isLoading || sections.length === 0 ? 1 : sections.length
  const specsNumber = 2 + parametersCount
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
            <div className="flex flex-col justify-center rounded-lg bg-sky-100 px-5 py-4">
              <h2 className="text-2xl leading-tight font-black tracking-tight text-fur-navy-900 uppercase sm:text-4xl">{model.modelName}</h2>
              <p className="mt-1.5 text-base font-semibold text-sky-800 sm:text-lg">{model.type.name}</p>
              <p className="text-sm text-fur-gray-600">{manufacturer ?? 'Fabricante genérico'}</p>
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
                ['Familia', model.family.name],
                ['Tipo de activo', model.type.name],
                ['Modelo', model.modelName],
                ['Fabricante', manufacturer ?? <Pending>Genérico</Pending>],
                [
                  'Etapas del proceso',
                  model.type.stageCodes.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {model.type.stageCodes.map((c) => (
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
                ['Estado de la ficha', <span key="st" className="font-semibold text-fur-red-500">REFERENCIAL — catálogo global, pendiente de validación en planta</span>],
              ]}
            />
          </Section>

          {variables.isLoading ? (
            <Skeleton className="h-40 rounded-lg" aria-busy="true" aria-label="Cargando variables" />
          ) : sections.length === 0 ? (
            <Section n={2} icon={Settings2} title="Parámetros técnicos por confirmar">
              <p className="px-3 py-3 text-sm text-fur-gray-600">Este tipo de activo aún no tiene variables definidas.</p>
            </Section>
          ) : (
            <div className={sections.length > 1 ? 'grid gap-3 lg:grid-cols-2' : 'grid gap-3'}>
              {sections.map((s, i) => (
                <Section key={s.key} n={2 + i} icon={s.key === 'general' ? Cpu : Settings2} title={`Parámetros · ${s.title}`}>
                  <ParametersTable defs={s.defs} />
                </Section>
              ))}
            </div>
          )}

          {specs.length > 0 && (
            <Section n={specsNumber} icon={Factory} title="Especificaciones del modelo">
              <KeyValue rows={specs.map(([k, v]) => [humanizeKey(k), String(v)])} />
            </Section>
          )}

          <aside className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-fur-gray-800">
            <Info className="mt-0.5 size-5 shrink-0 text-fur-navy-800" aria-hidden />
            <div className="space-y-1">
              <p className="font-bold text-fur-navy-800 uppercase">Nota técnica</p>
              <p>
                Información preliminar y referencial del catálogo global: describe el modelo, no un equipo en particular. Los datos reales, componentes y
                mantenimiento de cada activo se registran en Activos Físicos de la planta y se validan con planos, manual del fabricante e inspección en campo.
              </p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}
