import { MapPin, Plus, Power, Warehouse as WarehouseIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  useCreateLocation,
  useCreateWarehouse,
  useLocations,
  useUpdateLocation,
  useUpdateWarehouse,
  useWarehouses,
  type StorageLocation,
  type Warehouse,
} from '@/features/inventory/use-inventory'
import { ApiError } from '@/lib/api'
import { LOCATION_TYPE_LABELS, LOCATION_TYPES, locationTypeLabel, type LocationType } from '@/lib/inventory'

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'No se pudo completar la acción')

function LocationRow({ slug, location }: { slug: string; location: StorageLocation }) {
  const update = useUpdateLocation(slug)
  const active = location.status === 'ACTIVE'
  return (
    <TableRow>
      <TableCell className="fur-code">{location.code}</TableCell>
      <TableCell>{location.name}</TableCell>
      <TableCell>{locationTypeLabel(location.locationType)}</TableCell>
      <TableCell>{active ? 'Activa' : <Badge variant="outline">Inactiva</Badge>}</TableCell>
      <TableCell className="text-right">
        <PermissionGate permission="inventory.update">
          <Button
            size="sm"
            variant="ghost"
            disabled={update.isPending}
            aria-label={`${active ? 'Desactivar' : 'Activar'} ubicación ${location.code}`}
            onClick={() => update.mutateAsync({ id: location.id, status: active ? 'INACTIVE' : 'ACTIVE' }).catch((e) => toast.error(errorMessage(e)))}
          >
            <Power /> {active ? 'Desactivar' : 'Activar'}
          </Button>
        </PermissionGate>
      </TableCell>
    </TableRow>
  )
}

/** Almacenes con sus ubicaciones (zona → rack → estante → bin). */
export function WarehousesView({ slug }: { slug: string }) {
  const warehouses = useWarehouses(slug)
  const locations = useLocations(slug)
  const createWarehouse = useCreateWarehouse(slug)
  const createLocation = useCreateLocation(slug)
  const updateWarehouse = useUpdateWarehouse(slug)
  const [newWarehouse, setNewWarehouse] = useState(false)
  const [newLocationIn, setNewLocationIn] = useState<Warehouse | null>(null)

  if (warehouses.isError || locations.isError) return <ErrorState onRetry={() => { void warehouses.refetch(); void locations.refetch() }} />
  if (warehouses.isLoading || locations.isLoading || !warehouses.data || !locations.data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando almacenes">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PermissionGate permission="inventory.create">
        <div className="flex justify-end">
          <Button onClick={() => setNewWarehouse(true)}>
            <Plus /> Nuevo almacén
          </Button>
        </div>
      </PermissionGate>

      {warehouses.data.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="No hay almacenes"
          description="Crea un almacén y sus ubicaciones para empezar a recibir stock."
          action={
            <PermissionGate permission="inventory.create">
              <Button onClick={() => setNewWarehouse(true)}>
                <Plus /> Nuevo almacén
              </Button>
            </PermissionGate>
          }
        />
      ) : (
        warehouses.data.map((w) => {
          const locs = locations.data.filter((l) => l.warehouseId === w.id)
          const active = w.status === 'ACTIVE'
          return (
            <section key={w.id} aria-labelledby={`wh-${w.id}`} className="rounded-lg border border-border bg-card">
              <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
                <WarehouseIcon className="size-5 text-fur-navy-800" aria-hidden />
                <h3 id={`wh-${w.id}`} className="text-base font-semibold text-fur-navy-900">
                  <span className="fur-code">{w.code}</span> · {w.name}
                </h3>
                {!active && <Badge variant="outline">Inactivo</Badge>}
                <div className="ml-auto flex gap-2">
                  <PermissionGate permission="inventory.create">
                    {active && (
                      <Button size="sm" variant="secondary" onClick={() => setNewLocationIn(w)}>
                        <MapPin /> Nueva ubicación
                      </Button>
                    )}
                  </PermissionGate>
                  <PermissionGate permission="inventory.update">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateWarehouse.isPending}
                      aria-label={`${active ? 'Desactivar' : 'Activar'} almacén ${w.code}`}
                      onClick={() => updateWarehouse.mutateAsync({ id: w.id, status: active ? 'INACTIVE' : 'ACTIVE' }).catch((e) => toast.error(errorMessage(e)))}
                    >
                      <Power /> {active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </PermissionGate>
                </div>
              </header>
              {locs.length === 0 ? (
                <p className="p-4 text-sm text-fur-gray-600">Este almacén aún no tiene ubicaciones.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locs.map((l) => (
                        <LocationRow key={l.id} slug={slug} location={l} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )
        })
      )}

      {newWarehouse && (
        <FieldsDialog
          title="Nuevo almacén"
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'ALM-CEN', help: 'Único en la planta; se guarda en mayúsculas.' },
            { name: 'name', label: 'Nombre', required: true },
          ]}
          submitLabel="Crear almacén"
          onClose={() => setNewWarehouse(false)}
          onSubmit={(v) => createWarehouse.mutateAsync({ code: String(v.code).trim(), name: String(v.name).trim() })}
        />
      )}
      {newLocationIn && (
        <FieldsDialog
          title={`Nueva ubicación en ${newLocationIn.name}`}
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'R-A1', help: 'Único dentro del almacén.' },
            { name: 'name', label: 'Nombre', required: true },
            { name: 'locationType', label: 'Tipo', type: 'select', required: true, options: LOCATION_TYPES.map((t) => ({ value: t, label: LOCATION_TYPE_LABELS[t] })) },
            {
              name: 'parentId',
              label: 'Ubicación padre',
              type: 'select',
              emptyLabel: 'Sin padre (nivel superior)',
              options: locations.data.filter((l) => l.warehouseId === newLocationIn.id && l.status === 'ACTIVE').map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
            },
          ]}
          initial={{ locationType: 'RACK' }}
          submitLabel="Crear ubicación"
          onClose={() => setNewLocationIn(null)}
          onSubmit={(v) =>
            createLocation.mutateAsync({
              warehouseId: newLocationIn.id,
              code: String(v.code).trim(),
              name: String(v.name).trim(),
              locationType: v.locationType as LocationType,
              parentId: String(v.parentId || '') || undefined,
            })
          }
        />
      )}
    </div>
  )
}
