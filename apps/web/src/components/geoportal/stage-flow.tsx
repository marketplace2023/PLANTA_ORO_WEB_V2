import { ArrowRight, Spline, Undo2 } from 'lucide-react'
import type { ProcessOverview, StageConnection } from '@/features/process/use-process'
import { flowLabel } from '@/lib/process'
import { GeoPanel } from './geo-panel'
import { stageNumber } from './stage-number'

/** Flujo de la etapa elegida: de qué etapas recibe y a cuáles envía (conexiones del proceso de la planta). */
export function StageFlow({ overview, stageCode }: { overview: ProcessOverview | undefined; stageCode: string | undefined }) {
  const stage = overview?.stages.find((s) => s.code === stageCode)
  if (!overview || !stage) return null
  const codeOf = (id: string) => overview.stages.find((s) => s.id === id)
  const incoming = overview.connections.filter((c) => c.targetStageId === stage.id)
  const outgoing = overview.connections.filter((c) => c.sourceStageId === stage.id)

  const list = (conns: StageConnection[], side: 'sourceStageId' | 'targetStageId') =>
    conns.length === 0 ? (
      <span className="text-fur-gray-500">Sin conexiones</span>
    ) : (
      <ul className="flex flex-wrap gap-1.5">
        {conns.map((c) => {
          const other = codeOf(c[side])
          return (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-fur-gray-800">
              <span className="fur-code">{other ? stageNumber(other.code) : '?'}</span>
              <span className="max-w-40 truncate">{other?.name}</span>
              {c.flowType !== 'MATERIAL' && <span className="text-fur-gray-600">({flowLabel(c.flowType).toLowerCase()})</span>}
              {c.isReturnFlow && (
                <>
                  <Undo2 className="size-3" aria-hidden />
                  <span className="sr-only">retorno</span>
                </>
              )}
            </li>
          )
        })}
      </ul>
    )

  return (
    <GeoPanel title={`Flujo del proceso · Etapa ${stageNumber(stage.code)}`} icon={Spline} className="mt-3">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="flex items-center gap-1 font-semibold text-fur-navy-900">
            <ArrowRight className="size-3.5 rotate-180" aria-hidden /> Recibe de
          </dt>
          <dd>{list(incoming, 'sourceStageId')}</dd>
        </div>
        <div className="space-y-1">
          <dt className="flex items-center gap-1 font-semibold text-fur-navy-900">
            <ArrowRight className="size-3.5" aria-hidden /> Envía a
          </dt>
          <dd>{list(outgoing, 'targetStageId')}</dd>
        </div>
      </dl>
    </GeoPanel>
  )
}
