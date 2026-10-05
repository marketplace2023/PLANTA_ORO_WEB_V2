import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, History, Pencil, Power, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useItem, useUpdateItem } from '@/features/inventory/use-inventory'
import { ApiError } from '@/lib/api'
import { formatMoney, formatQuantity } from '@/lib/format'
import { ItemFormDialog } from './item-form-dialog'
import { ItemTypeBadge, StockFlags } from './item-badges'
import { MovementDialog, type MoveKind } from './movement-dialog'
import { MovementsTable } from './movements-table'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

const ACTIONS: Array<{ kind: MoveKind; label: string; icon: typeof ArrowDownToLine }> = [
  { kind: 'receipt', label: 'Recibir', icon: ArrowDownToLine },
  { kind: 'issue', label: 'Emitir', icon: ArrowUpFromLine },
  { kind: 'transfer', label: 'Transferir', icon: ArrowLeftRight },
  { kind: 'adjust', label: 'Ajustar', icon: SlidersHorizontal },
]

/** Detalle de un ítem: existencias por ubicación, costo y últimos movimientos, con las operaciones de stock. */
export function ItemSheet({ slug, itemId, currency, onClose }: { slug: string; itemId: string; currency: string; onClose: () => void }) {
  const { data: item, isLoading, isError, error, refetch } = useItem(slug, itemId)
  const update = useUpdateItem(slug, itemId)
  const [moving, setMoving] = useState<MoveKind | null>(null)
  const [editing, setEditing] = useState(false)

  async function toggleStatus() {
    if (!item) return
    try {
      await update.mutateAsync({ status: item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      toast.success(item.status === 'ACTIVE' ? `${item.sku} desactivado` : `${item.sku} activado`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el ítem')
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="fur-code">{item?.sku ?? 'Ítem'}</SheetTitle>
          <SheetDescription>{item?.name ?? 'Detalle del ítem'}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-8" />
              <Skeleton className="h-40" />
            </div>
          ) : error instanceof ApiError && error.status === 404 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fur-gray-600">El ítem no existe o no es visible para tu cuenta.</p>
          ) : isError || !item ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ItemTypeBadge type={item.itemType} />
                <StockFlags belowMin={item.belowMin} isCritical={item.isCritical} />
                {item.status === 'INACTIVE' && <Badge variant="outline">Inactivo</Badge>}
              </div>

              <PermissionGate permission="inventory.move">
                {item.status === 'ACTIVE' || item.stock.length > 0 ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Operaciones de stock">
                    {ACTIONS.filter((a) => item.status === 'ACTIVE' || a.kind === 'issue').map(({ kind, label, icon: Icon }) => (
                      <Button key={kind} size="sm" variant={kind === 'receipt' ? 'default' : 'secondary'} onClick={() => setMoving(kind)}>
                        <Icon /> {label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </PermissionGate>

              {item.description && <p className="text-sm whitespace-pre-wrap">{item.description}</p>}

              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Fact label="Existencias totales">
                  <span className={item.belowMin ? 'font-semibold text-fur-red-500' : 'font-semibold'}>
                    {formatQuantity(item.onHand)} {item.uom}
                  </span>
                </Fact>
                <Fact label="Valor del stock">{formatMoney(item.value, currency)}</Fact>
                <Fact label="Mínimo / máximo">
                  {formatQuantity(item.minStock)} / {item.maxStock === null ? '—' : formatQuantity(item.maxStock)} {item.uom}
                </Fact>
                <Fact label="Costo promedio">{item.unitCost === null ? 'Sin costo cargado' : formatMoney(item.unitCost, currency)}</Fact>
                <Fact label="Modelo del catálogo">{item.model?.name ?? '—'}</Fact>
              </dl>

              <PermissionGate permission="inventory.update">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleStatus()} disabled={update.isPending}>
                    <Power /> {item.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </PermissionGate>

              <section aria-labelledby="stock-title">
                <h3 id="stock-title" className="mb-2 text-base font-semibold text-fur-navy-900">
                  Existencias por ubicación
                </h3>
                {item.stock.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fur-gray-600">Sin existencias en ninguna ubicación.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Almacén</TableHead>
                          <TableHead>Ubicación</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {item.stock.map((s) => (
                          <TableRow key={s.locationId}>
                            <TableCell>{s.warehouseName}</TableCell>
                            <TableCell>
                              <span className="fur-code">{s.locationCode}</span> {s.locationName}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatQuantity(s.quantity)} {item.uom}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              <section aria-labelledby="moves-title">
                <h3 id="moves-title" className="mb-2 flex items-center gap-2 text-base font-semibold text-fur-navy-900">
                  <History className="size-4" /> Últimos movimientos
                </h3>
                {item.recentMovements.length === 0 ? (
                  <p className="text-sm text-fur-gray-600">Este ítem aún no tiene movimientos.</p>
                ) : (
                  <MovementsTable slug={slug} movements={item.recentMovements} showItem={false} />
                )}
              </section>

              {moving && <MovementDialog slug={slug} kind={moving} item={item} onClose={() => setMoving(null)} />}
              {editing && <ItemFormDialog slug={slug} item={item} onClose={() => setEditing(false)} />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
