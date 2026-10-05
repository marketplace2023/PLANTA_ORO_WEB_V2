import { AlertTriangle, ArrowRight, Cog, Package, Spline, Undo2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { KpiCard } from '@/components/industrial/kpi-card'
import { PageHeader } from '@/components/layout/page-header'
import { ConnectionsDialog } from '@/components/process/connections-dialog'
import { StatusSummary } from '@/components/process/status-summary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlantProcess, type ProcessOverview, type ProcessStage, type StageConnection } from '@/features/process/use-process'
import { flowLabel, STAGE_COLORS, stageGroupLabel } from '@/lib/process'
import { useUrlFilters } from '@/lib/use-url-filters'
import { usePlantOutlet } from './plant-route'

type Links = { incoming: StageConnection[]; outgoing: StageConnection[] }

function linksOf(overview: ProcessOverview) {
  const map = new Map<string, Links>(overview.stages.map((s) => [s.id, { incoming: [], outgoing: [] }]))
  for (const c of overview.connections) {
    map.get(c.sourceStageId)?.outgoing.push(c)
    map.get(c.targetStageId)?.incoming.push(c)
  }
  return map
}

function Flow({ title, conns, side, byId }: { title: string; conns: StageConnection[]; side: 'sourceStageId' | 'targetStageId'; byId: Map<string, ProcessStage> }) {
  if (conns.length === 0) return null
  return (
    <p className="text-xs text-fur-gray-600">
      <span className="font-medium">{title}: </span>
      {conns.map((c, i) => {
        const other = byId.get(c[side])
        return (
          <span key={c.id}>
            {i > 0 && ', '}
            <span className="fur-code">{other?.code ?? '?'}</span>
            {c.flowType !== 'MATERIAL' && <span> ({flowLabel(c.flowType).toLowerCase()})</span>}
            {c.isReturnFlow && (
              <span className="inline-flex items-center gap-0.5 align-middle" title="Flujo de retorno (recirculación)">
                <Undo2 className="size-3" aria-hidden />
                <span className="sr-only">retorno</span>
              </span>
            )}
          </span>
        )
      })}
    </p>
  )
}

function StageCard({ stage, links, byId, slug }: { stage: ProcessStage; links: Links; byId: Map<string, ProcessStage>; slug: string }) {
  return (
    <Card size="sm" className="border-l-4" style={{ borderLeftColor: STAGE_COLORS[stage.colorToken ?? ''] }}>
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="fur-code rounded-md bg-fur-navy-900 px-2 py-1 text-fur-gold-400">{stage.code}</span>
          <h3 className="text-sm leading-snug font-semibold text-fur-navy-900">{stage.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stage.assetCount !== null ? (
            <Link to={`/plants/${slug}/assets?stage=${stage.code}`} className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline">
              <Package className="size-4" aria-hidden /> {stage.assetCount} {stage.assetCount === 1 ? 'activo' : 'activos'}
            </Link>
          ) : null}
          {stage.attentionAssets ? (
            <Badge variant="outline" className="gap-1 border-fur-red-500 text-fur-red-500">
              <AlertTriangle aria-hidden /> {stage.attentionAssets} requieren atención
            </Badge>
          ) : null}
          {stage.openWorkOrders ? (
            <Badge variant="outline" className="gap-1">
              <Wrench aria-hidden /> {stage.openWorkOrders} OT abiertas
            </Badge>
          ) : null}
        </div>
        <StatusSummary counts={stage.statusCounts} total={stage.assetCount} />
        <Flow title="Recibe de" conns={links.incoming} side="sourceStageId" byId={byId} />
        <Flow title="Envía a" conns={links.outgoing} side="targetStageId" byId={byId} />
      </CardContent>
    </Card>
  )
}

/** Procesos (design.md §30): mapa por grupos de etapas con su flujo, y lista tabular. Solo etapas habilitadas. */
export function ProcessesPage() {
  const plant = usePlantOutlet()
  const { params, setParam } = useUrlFilters()
  const view = params.get('view') === 'list' ? 'list' : 'map'
  const { data, isLoading, isError, refetch } = usePlantProcess(plant.slug)
  const [editing, setEditing] = useState(false)

  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Procesos" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando procesos">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </>
    )
  }

  const byId = new Map(data.stages.map((s) => [s.id, s]))
  const links = linksOf(data)
  const groups = data.stages.reduce<Array<{ group: string; stages: ProcessStage[] }>>((acc, s) => {
    const last = acc.at(-1)
    if (last && last.group === s.stageGroup) last.stages.push(s)
    else acc.push({ group: s.stageGroup, stages: [s] })
    return acc
  }, [])

  return (
    <>
      <PageHeader
        title="Procesos"
        description="Etapas habilitadas de la planta, su flujo y el estado de los activos de cada una."
        actions={
          <PermissionGate permission="plant.configure">
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={data.stages.length < 2}>
              <Spline /> Editar conexiones
            </Button>
          </PermissionGate>
        }
      />

      {data.stages.length === 0 ? (
        <EmptyState icon={Cog} title="No hay etapas para mostrar" description="La planta no tiene etapas habilitadas o no publica su proceso." />
      ) : (
        <>
          {data.totals && (
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <KpiCard title="Etapas habilitadas" value={data.stages.length} icon={Cog} />
              <KpiCard title="Activos en proceso" value={data.totals.assets} icon={Package} />
              <KpiCard title="Requieren atención" value={data.totals.attention} icon={AlertTriangle} tone={data.totals.attention > 0 ? 'danger' : 'default'} hint="Crítico, fuera de servicio, en reparación o mantenimiento" />
            </div>
          )}

          <Tabs value={view} onValueChange={(v) => setParam({ view: v === 'map' ? undefined : v }, true)}>
            <div className="mb-4 overflow-x-auto">
              <TabsList className="w-max">
                <TabsTrigger value="map">Mapa de proceso</TabsTrigger>
                <TabsTrigger value="list">Lista de etapas</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          {view === 'map' ? (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={`${g.group}-${g.stages[0].id}`} aria-labelledby={`grp-${g.stages[0].id}`}>
                  <h2 id={`grp-${g.stages[0].id}`} className="mb-3 flex items-center gap-2 text-lg font-semibold text-fur-navy-900">
                    <ArrowRight className="size-4" aria-hidden /> {stageGroupLabel(g.group)}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {g.stages.map((s) => (
                      <StageCard key={s.id} stage={s} links={links.get(s.id)!} byId={byId} slug={plant.slug} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-right">Activos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Atención</TableHead>
                    <TableHead className="text-right">OT abiertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stages.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <span className="fur-code mr-2">{s.code}</span>
                        {s.name}
                      </TableCell>
                      <TableCell>{stageGroupLabel(s.stageGroup)}</TableCell>
                      <TableCell className="text-right">
                        {s.assetCount === null ? (
                          '—'
                        ) : (
                          <Link to={`/plants/${plant.slug}/assets?stage=${s.code}`} className="underline-offset-2 hover:underline">
                            {s.assetCount}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusSummary counts={s.statusCounts} total={s.assetCount} />
                      </TableCell>
                      <TableCell className="text-right">{s.attentionAssets ?? '—'}</TableCell>
                      <TableCell className="text-right">{s.openWorkOrders ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {editing && <ConnectionsDialog slug={plant.slug} overview={data} onClose={() => setEditing(false)} />}
    </>
  )
}
