import { Ban, CheckCircle2, FileSearch, History, PackageCheck, Pencil, Send, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { PriorityBadge } from '@/components/maintenance/work-order-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { usePlant } from '@/features/plant/plant-context'
import { useCancelRfq, useRequisition, useRequisitionAction, type RequisitionDetail } from '@/features/procurement/use-procurement'
import { ApiError } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format'
import { QUOTE_STATUS_LABELS, requisitionStatusLabel, RFQ_STATUS_LABELS } from '@/lib/procurement'
import { RequisitionStatusBadge } from './requisition-badges'
import { ReasonDialog, ReceiveDialog, RfqDialog } from './requisition-dialogs'
import { RequisitionFormDialog } from './requisition-form-dialog'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

type Dialog = 'edit' | 'reject' | 'cancel' | 'rfq' | 'receive' | null

/** Detalle de una requisición: líneas, flujo de aprobación, cotizaciones y recepción. La UI solo ofrece lo que el usuario puede hacer. */
export function RequisitionSheet({ slug, id, onClose }: { slug: string; id: string; onClose: () => void }) {
  const { data: rq, isLoading, isError, error, refetch } = useRequisition(slug, id)
  const { permissions } = usePlant()
  const { user } = useAuth()
  const run = useRequisitionAction(slug, id)
  const cancelRfq = useCancelRfq(slug, id)
  const [dialog, setDialog] = useState<Dialog>(null)

  const can = (p: string) => permissions.includes(p)
  const isOwner = !!rq && !!user && rq.requestedBy?.id === user.id
  // Misma regla que el servidor: nadie decide sobre su propia requisición (salvo el administrador del ecosistema).
  const mayDecide = can('procurement.approve') && !(isOwner && !user?.isGlobalAdmin)
  const mayEdit = can('procurement.create') && (isOwner || can('procurement.approve'))

  async function go(input: Parameters<typeof run.mutateAsync>[0], ok: string) {
    try {
      await run.mutateAsync(input)
      toast.success(ok)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo completar la acción')
    }
  }

  const renderActions = (r: RequisitionDetail) => {
    const buttons: React.ReactNode[] = []
    const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>)
    if (r.status === 'DRAFT' && mayEdit) {
      add('submit', <Button size="sm" disabled={run.isPending} onClick={() => void go({ action: 'submit' }, 'Requisición enviada a aprobación')}><Send /> Enviar a aprobación</Button>)
      add('edit', <Button size="sm" variant="secondary" onClick={() => setDialog('edit')}><Pencil /> Editar</Button>)
    }
    if (r.status === 'SUBMITTED' && mayDecide) {
      add('approve', <Button size="sm" disabled={run.isPending} onClick={() => void go({ action: 'approve' }, 'Requisición aprobada')}><CheckCircle2 /> Aprobar</Button>)
      add('reject', <Button size="sm" variant="secondary" onClick={() => setDialog('reject')}><XCircle /> Rechazar</Button>)
    }
    if (r.status === 'APPROVED' && can('procurement.create')) {
      add('rfq', <Button size="sm" onClick={() => setDialog('rfq')}><FileSearch /> Solicitar cotización</Button>)
    }
    if (r.status === 'RFQ' && can('procurement.create')) {
      add('cancelRfq', <Button size="sm" variant="secondary" disabled={cancelRfq.isPending} onClick={() => cancelRfq.mutateAsync().then(() => toast.success('Solicitud de cotización cancelada'), (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cancelar'))}>Cancelar solicitud de cotización</Button>)
    }
    if (r.status === 'ORDERED' && can('inventory.move')) {
      add('receive', <Button size="sm" onClick={() => setDialog('receive')}><PackageCheck /> Registrar recepción</Button>)
    }
    if (['DRAFT', 'SUBMITTED', 'APPROVED', 'RFQ'].includes(r.status) && mayEdit) {
      add('cancel', <Button size="sm" variant="ghost" onClick={() => setDialog('cancel')}><Ban /> Cancelar requisición</Button>)
    }
    return buttons
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="fur-code">{rq?.code ?? 'Requisición'}</SheetTitle>
          <SheetDescription>{rq?.justification ?? 'Detalle de la requisición'}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-8" />
              <Skeleton className="h-40" />
            </div>
          ) : error instanceof ApiError && error.status === 404 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fur-gray-600">La requisición no existe o no es visible para tu cuenta.</p>
          ) : isError || !rq ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <RequisitionStatusBadge status={rq.status} />
                <PriorityBadge priority={rq.priority} />
              </div>

              {renderActions(rq).length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones de la requisición">
                  {renderActions(rq)}
                </div>
              )}

              {rq.decisionNote && (
                <p className="rounded-md border border-border bg-muted p-3 text-sm">
                  <strong>{rq.status === 'REJECTED' ? 'Motivo del rechazo: ' : 'Motivo: '}</strong>
                  {rq.decisionNote}
                </p>
              )}

              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Fact label="Solicitada por">{rq.requestedBy?.name ?? '—'}</Fact>
                <Fact label="Requerida para">{formatDate(rq.neededBy)}</Fact>
                <Fact label="Activo">
                  {rq.asset ? (
                    <Link to={`/plants/${slug}/assets/${rq.asset.id}`} className="underline-offset-2 hover:underline">
                      <span className="fur-code">{rq.asset.tag}</span> {rq.asset.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Fact>
                <Fact label="Orden de trabajo">
                  {rq.workOrder ? (
                    <Link to={`/plants/${slug}/maintenance?tab=orders&wo=${rq.workOrder.id}`} className="fur-code underline-offset-2 hover:underline">
                      {rq.workOrder.code}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Fact>
                <Fact label="Etapa">{rq.stage ? `${rq.stage.code} · ${rq.stage.name}` : '—'}</Fact>
                <Fact label="Total estimado">{formatMoney(rq.estimatedTotal)}</Fact>
              </dl>

              <section aria-labelledby="rq-lines">
                <h3 id="rq-lines" className="mb-2 text-base font-semibold text-fur-navy-900">
                  Líneas
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Estimado</TableHead>
                        {['ORDERED', 'RECEIVED'].includes(rq.status) && <TableHead className="text-right">Recibido</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rq.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            {l.item && <span className="fur-code mr-1.5">{l.item.sku}</span>}
                            {l.description}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {formatQuantity(l.quantity)} {l.uom}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatMoney(l.lineTotal)}</TableCell>
                          {['ORDERED', 'RECEIVED'].includes(rq.status) && (
                            <TableCell className="text-right whitespace-nowrap">
                              {formatQuantity(l.receivedQuantity)} / {formatQuantity(l.quantity)}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {rq.rfq && (
                <section aria-labelledby="rq-rfq" className="space-y-3">
                  <h3 id="rq-rfq" className="flex flex-wrap items-center gap-2 text-base font-semibold text-fur-navy-900">
                    Solicitud de cotización <span className="fur-code">{rq.rfq.code}</span>
                    <Badge variant="outline">{RFQ_STATUS_LABELS[rq.rfq.status]}</Badge>
                  </h3>
                  <p className="text-sm text-fur-gray-600">
                    Responder hasta {formatDateTime(rq.rfq.deadlineAt)}
                    {rq.rfq.expired && <span className="ml-2 font-medium text-fur-red-500">· plazo vencido</span>}. Invitados: {rq.rfq.invited.map((p) => p.name).join(', ')}.
                  </p>
                  {rq.rfq.quotes.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fur-gray-600">Aún no hay cotizaciones.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {rq.rfq.quotes.map((q) => (
                        <li key={q.id} className="flex flex-wrap items-center gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{q.providerName}</p>
                            <p className="text-xs text-fur-gray-600">
                              Entrega en {q.deliveryDays} días{q.conditions ? ` · ${q.conditions}` : ''}
                            </p>
                          </div>
                          <span className="font-semibold">{formatMoney(q.totalAmount, q.currency)}</span>
                          <Badge variant={q.status === 'AWARDED' ? 'default' : 'outline'}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
                          {rq.status === 'RFQ' && q.status === 'SUBMITTED' && can('procurement.approve') && (
                            <Button size="sm" disabled={run.isPending} aria-label={`Adjudicar a ${q.providerName}`} onClick={() => void go({ action: 'award', quoteId: q.id }, `Adjudicada a ${q.providerName}`)}>
                              Adjudicar
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section aria-labelledby="rq-hist">
                <h3 id="rq-hist" className="mb-3 flex items-center gap-2 text-base font-semibold text-fur-navy-900">
                  <History className="size-4" /> Historial
                </h3>
                <ol className="space-y-3 border-l-2 border-border pl-5">
                  {rq.history.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full border-2 border-card bg-fur-navy-800" aria-hidden />
                      <p className="text-sm">
                        {h.fromStatus && <>{requisitionStatusLabel(h.fromStatus)} → </>}
                        <strong>{requisitionStatusLabel(h.toStatus)}</strong>
                      </p>
                      {h.note && <p className="text-sm">{h.note}</p>}
                      <p className="text-xs text-fur-gray-600">
                        {formatDateTime(h.changedAt)}
                        {h.changedBy && ` · ${h.changedBy}`}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              {dialog === 'edit' && <RequisitionFormDialog slug={slug} requisition={rq} onClose={() => setDialog(null)} />}
              {dialog === 'reject' && <ReasonDialog slug={slug} id={id} action="reject" title="Rechazar requisición" submitLabel="Rechazar" onClose={() => setDialog(null)} />}
              {dialog === 'cancel' && <ReasonDialog slug={slug} id={id} action="cancel" title="Cancelar requisición" submitLabel="Cancelar requisición" onClose={() => setDialog(null)} />}
              {dialog === 'rfq' && <RfqDialog slug={slug} requisition={rq} onClose={() => setDialog(null)} />}
              {dialog === 'receive' && <ReceiveDialog slug={slug} requisition={rq} onClose={() => setDialog(null)} />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
