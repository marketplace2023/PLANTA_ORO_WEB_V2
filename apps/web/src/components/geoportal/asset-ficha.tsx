import { ClipboardList, ExternalLink, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssetFur, useModelVariables, type AssetItem } from '@/features/assets/use-assets'
import { apiUrl } from '@/lib/api'
import { criticalityLabel, STATUS_META, type AssetStatus } from '@/lib/assets'
import { specLabel } from '@/lib/spec-label'
import { stageGroupLabel } from '@/lib/stage-groups'
import { networkSuffix, variableSections } from '@/lib/model-variables'
import { GeoPanel } from './geo-panel'
import { stageNumber } from './stage-number'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-b border-border/60 py-1.5 text-sm last:border-b-0">
      <dt className="text-fur-gray-600">{label}</dt>
      <dd className="min-w-0 font-medium break-words text-fur-navy-900">{children}</dd>
    </div>
  )
}

/** Fecha corta (AAAA-MM-DD) de una marca de tiempo ISO. */
const shortDate = (iso: string) => iso.slice(0, 10)

/** Especificaciones del modelo que se muestran como filas (las primeras; el resto está en la ficha completa). */
const MAX_SPECS = 5

/**
 * Ficha técnica del activo elegido: foto del modelo, estado, códigos y datos clave, como en la ficha de referencia.
 * Cambia con el activo seleccionado (tarjeta o marcador del mapa); la ficha completa se abre desde aquí.
 */
export function AssetFicha({
  plantSlug,
  plantName,
  asset,
  networkName,
  networkCode,
  maxHeight,
}: {
  plantSlug: string
  plantName: string
  asset: AssetItem | undefined
  networkName: string | undefined
  networkCode?: string
  /** Altura máxima en píxeles (la de la columna central); el contenido se desplaza dentro. Sin valor, un tope relativo a la pantalla. */
  maxHeight?: number
}) {
  const fur = useAssetFur(plantSlug, asset?.id)
  const variables = useModelVariables(asset?.model.id)
  const base = networkName ? `Ficha técnica general / ${networkName}` : 'Ficha técnica general'
  const title = asset ? `${base} – ${asset.tag}` : base

  if (!asset) {
    return (
      <GeoPanel title={title} icon={ClipboardList}>
        <p className="py-6 text-center text-sm text-muted-foreground">Elige un activo para ver su ficha técnica.</p>
      </GeoPanel>
    )
  }

  const meta = STATUS_META[asset.status as AssetStatus]
  const detail = fur.data?.asset
  const specs = Object.entries(detail?.specifications ?? {}).slice(0, MAX_SPECS)
  const sections = variableSections(variables.data ?? [], asset, networkCode)
  // «Variables clave»: nombres de las variables marcadas como clave que aplican a este activo.
  const keyLabels = [...new Set(sections.flatMap((s) => s.items.filter((i) => i.def.isKey).map((i) => i.def.label.toLowerCase())))]
  const documents = fur.data?.documents.length

  return (
    <GeoPanel
      title={title}
      icon={ClipboardList}
      className="flex flex-col max-xl:max-h-[70vh]"
      style={maxHeight ? { maxHeight } : undefined}
      bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain p-0"
    >
      <div className="flex gap-3 border-b border-border p-3">
        <div className="grid h-20 w-24 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white">
          {asset.model.imageUrl ? (
            <img src={apiUrl(asset.model.imageUrl)} alt={`Foto de ${asset.model.name}`} className="h-full w-full object-contain" />
          ) : (
            <Package className="size-8 text-fur-gray-300" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold">
            <span className="size-2 rounded-full" style={{ backgroundColor: meta?.color ?? 'var(--fur-steel-500)' }} aria-hidden />
            {meta?.label ?? asset.status}
          </p>
          <p className="fur-code mt-1 text-lg leading-tight font-bold text-fur-navy-900">{asset.tag}</p>
          <p className="text-sm leading-tight font-semibold">{asset.name}</p>
          <p className="text-xs text-fur-gray-600">{asset.type.description ?? asset.type.name}</p>
        </div>
      </div>

      <dl className="px-3 py-1" aria-label="Datos del activo">
        <Row label="Código de activo">
          <span className="fur-code">{asset.tag}</span>
        </Row>
        <Row label="FUR-EQP">
          <span className="fur-code">{asset.tag}-EQP-001</span>
        </Row>
        {networkCode && (
          <Row label={networkCode}>
            <span className="fur-code">
              {asset.tag}-{networkSuffix(networkCode)}-001
            </span>
          </Row>
        )}
        <Row label="Asset tag">
          <span className="fur-code">{asset.tag}</span>
        </Row>
        <Row label="Nombre">{asset.name}</Row>
        <Row label="Tipo">{asset.type.name}</Row>
        <Row label="Modelo">{asset.manufacturer ? `${asset.model.name} · ${asset.manufacturer}` : asset.model.name}</Row>
        <Row label="Etapa">{asset.stage ? `${stageNumber(asset.stage.code)} - ${asset.stage.name}` : '—'}</Row>
        {networkCode ? (
          <Row label="Red activa">
            <span className="fur-code">{networkCode}</span> · {networkName ?? networkCode}
          </Row>
        ) : (
          <Row label="Redes activas">
            {asset.networks.length === 0 ? (
              '—'
            ) : (
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {asset.networks.map((n) => (
                  <li key={n.code} className="inline-flex items-center gap-1 text-[13px]" title={n.name}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: n.colorToken ? `var(--${n.colorToken})` : undefined }} aria-hidden />
                    <span className="fur-code">{n.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        )}
        <Row label="Sección">{asset.stage ? stageGroupLabel(asset.stage.group) : '—'}</Row>
        <Row label="Estado documental">
          {documents === undefined ? (
            '—'
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: documents > 0 ? 'var(--fur-green-500)' : 'var(--fur-steel-500)' }} aria-hidden />
              {documents > 0 ? `Activo · ${documents} ${documents === 1 ? 'documento' : 'documentos'}` : 'Sin documentos'}
            </span>
          )}
        </Row>
        <Row label="Ubicación">{asset.location ? `${plantName} - ${asset.location}` : plantName}</Row>
        <Row label="Criticidad">{criticalityLabel(asset.criticality)}</Row>
        {keyLabels.length > 0 && <Row label="Variables clave">{keyLabels.join(', ')}</Row>}
        <Row label="Última actualización">{shortDate(asset.updatedAt)}</Row>
        <Row label="Código FUR">
          <span className="fur-code">{asset.furCode}</span>
        </Row>
      </dl>

      {variables.isLoading && (
        <div className="space-y-1.5 border-t border-border px-3 py-2" aria-label="Cargando variables">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      )}
      {sections.map((section) => (
        <section key={section.title} aria-label={section.title} className="border-t border-border px-3 py-2">
          <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-fur-navy-900 uppercase">{section.title}</h3>
          <dl>
            {section.items.map(({ def, text, general }) => (
              <Row key={def.id} label={def.label}>
                {text === null ? (
                  <span className="font-normal text-muted-foreground">Sin registrar</span>
                ) : (
                  <>
                    {text}
                    {general && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(general)</span>}
                  </>
                )}
              </Row>
            ))}
          </dl>
          {section.items.some((i) => i.text === null) && (
            <p className="mt-1 text-[11px] text-muted-foreground">Faltan datos del fabricante: se registran en el catálogo del administrador (Modelos → Datos del fabricante).</p>
          )}
        </section>
      ))}

      {(fur.isLoading || specs.length > 0) && (
        <section aria-label="Especificaciones del modelo" className="border-t border-border px-3 py-2">
          <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-fur-navy-900 uppercase">Especificaciones del modelo</h3>
          {fur.isLoading ? (
            <div className="space-y-1.5 py-1" aria-label="Cargando especificaciones">
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
            </div>
          ) : (
            <dl>
              {specs.map(([key, value]) => (
                <Row key={key} label={specLabel(key)}>
                  {String(value)}
                </Row>
              ))}
            </dl>
          )}
        </section>
      )}

      <div className="border-t border-border p-3">
        <Link to={`/plants/${plantSlug}/assets/${asset.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fur-navy-900 underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <ExternalLink className="size-4" aria-hidden /> Abrir la ficha completa (FUR)
        </Link>
      </div>
    </GeoPanel>
  )
}
