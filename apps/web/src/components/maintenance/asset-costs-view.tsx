import { Gauge, HardHat, Package, Truck, Wallet, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { KpiCard } from '@/components/industrial/kpi-card'
import { WorkOrderStatusBadge } from '@/components/maintenance/work-order-badges'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AssetCosts } from '@/features/maintenance/use-maintenance'
import { formatMoney } from '@/lib/format'
import { TYPE_LABELS } from '@/lib/maintenance'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** "2026-10" → "oct 2026". */
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-')
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`
}

/** Desglose de costos de un activo: por categoría, por mes, por tipo de orden y por orden (arquitectura §16, design.md §35). */
export function AssetCostsView({ slug, data }: { slug: string; data: AssetCosts }) {
  const c = data.currency
  const t = data.totals
  if (data.orderCount === 0) {
    return <EmptyState icon={Wallet} title="Este activo aún no tiene costos" description="Los costos salen de los repuestos y de la mano de obra, equipos y servicios registrados en sus órdenes de trabajo (sin contar las canceladas)." />
  }
  const max = Math.max(1, ...data.byMonth.map((m) => m.total))

  return (
    <div className="space-y-8">
      <section aria-labelledby="costs-summary">
        <h3 id="costs-summary" className="sr-only">
          Resumen de costos
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard title="Costo total" value={formatMoney(t.total, c)} icon={Wallet} hint={`${data.orderCount} órdenes de trabajo`} />
          <KpiCard
            title="Repuestos"
            value={formatMoney(t.parts, c)}
            icon={Package}
            tone={t.partsWithoutCost > 0 ? 'warning' : 'default'}
            hint={t.partsWithoutCost > 0 ? `${t.partsWithoutCost} consumo(s) sin costo cargado no suman` : 'Consumidos desde el inventario'}
          />
          <KpiCard title="Mano de obra" value={formatMoney(t.labor, c)} icon={HardHat} />
          <KpiCard title="Equipos" value={formatMoney(t.equipment, c)} icon={Gauge} />
          <KpiCard title="Transporte" value={formatMoney(t.transport, c)} icon={Truck} />
          <KpiCard title="Servicios externos y otros" value={formatMoney(t.service + t.other, c)} icon={Wrench} hint={`Servicios ${formatMoney(t.service, c)} · otros ${formatMoney(t.other, c)}`} />
        </div>
        <p className="mt-3 text-sm text-fur-gray-600">
          Suma de los costos de sus órdenes de trabajo, excluidas las canceladas, en la moneda de la planta. La depreciación aún no se calcula.
        </p>
      </section>

      <section aria-labelledby="costs-months">
        <h3 id="costs-months" className="mb-2 text-base font-semibold text-fur-navy-900">
          Últimos 12 meses
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="w-1/3">
                  <span className="sr-only">Gráfico</span>
                </TableHead>
                <TableHead className="text-right">Repuestos</TableHead>
                <TableHead className="text-right">Otros</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byMonth.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="whitespace-nowrap">{monthLabel(m.month)}</TableCell>
                  <TableCell aria-hidden>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-fur-navy-800" style={{ width: `${(m.total / max) * 100}%` }} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(m.parts, c)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(m.other, c)}</TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">{formatMoney(m.total, c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.beforeWindow > 0 && <p className="mt-2 text-sm text-fur-gray-600">Además, {formatMoney(data.beforeWindow, c)} anteriores a estos 12 meses (incluidos en el costo total).</p>}
      </section>

      <section aria-labelledby="costs-types">
        <h3 id="costs-types" className="mb-2 text-base font-semibold text-fur-navy-900">
          Por tipo de orden
        </h3>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.byType.map((x) => (
            <li key={x.type} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1">{TYPE_LABELS[x.type] ?? x.type}</span>
              <span className="text-fur-gray-600">{x.orders} {x.orders === 1 ? 'orden' : 'órdenes'}</span>
              <span className="font-medium">{formatMoney(x.total, c)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="costs-orders">
        <h3 id="costs-orders" className="mb-2 text-base font-semibold text-fur-navy-900">
          Órdenes con más costo
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orden</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Repuestos</TableHead>
                <TableHead className="text-right">Otros</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link to={`/plants/${slug}/maintenance?tab=orders&wo=${o.id}`} className="fur-code text-fur-navy-900 underline-offset-2 hover:underline">
                      {o.code}
                    </Link>
                    <div className="text-xs text-fur-gray-600">{o.title}</div>
                  </TableCell>
                  <TableCell>{TYPE_LABELS[o.type] ?? o.type}</TableCell>
                  <TableCell>
                    <WorkOrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(o.parts, c)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(o.other, c)}</TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">{formatMoney(o.total, c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.orderCount > data.orders.length && <p className="mt-2 text-sm text-fur-gray-600">Mostrando las {data.orders.length} de mayor costo, de {data.orderCount} órdenes con costos.</p>}
      </section>
    </div>
  )
}
