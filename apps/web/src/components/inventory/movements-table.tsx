import { Link } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Movement } from '@/features/inventory/use-inventory'
import { formatDateTime, formatQuantity } from '@/lib/format'
import { REFERENCE_LABELS } from '@/lib/inventory'
import { MovementBadge } from './item-badges'

/** Libro de movimientos (solo lectura). Las órdenes de trabajo enlazan a su detalle. */
export function MovementsTable({ slug, movements, showItem = true, onOpenItem }: { slug: string; movements: Movement[]; showItem?: boolean; onOpenItem?: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            {showItem && <TableHead>Ítem</TableHead>}
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Origen → destino</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead>Responsable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(m.performedAt)}</TableCell>
              <TableCell>
                <MovementBadge type={m.type} />
              </TableCell>
              {showItem && (
                <TableCell>
                  {onOpenItem ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onOpenItem(m.item.id)}>
                      <span className="fur-code">{m.item.sku}</span> {m.item.name}
                    </button>
                  ) : (
                    <>
                      <span className="fur-code">{m.item.sku}</span> {m.item.name}
                    </>
                  )}
                </TableCell>
              )}
              <TableCell className="text-right whitespace-nowrap">
                {formatQuantity(m.quantity)} {m.item.uom}
              </TableCell>
              <TableCell className="fur-code whitespace-nowrap">
                {m.from ?? '—'} → {m.to ?? '—'}
              </TableCell>
              <TableCell>
                {m.referenceType === 'WORK_ORDER' && m.referenceId ? (
                  <Link to={`/plants/${slug}/maintenance?tab=orders&wo=${m.referenceId}`} className="underline-offset-2 hover:underline">
                    {REFERENCE_LABELS.WORK_ORDER}
                  </Link>
                ) : (
                  (REFERENCE_LABELS[m.referenceType] ?? m.referenceType)
                )}
                {m.note && <div className="max-w-64 truncate text-xs text-fur-gray-600" title={m.note}>{m.note}</div>}
              </TableCell>
              <TableCell className="text-fur-gray-600">{m.performedBy ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
