import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useNetworkCatalog } from '@/features/catalog/use-catalog'
import { useEnableNetwork, useUpdateNetwork } from '@/features/plant/use-plant-admin'
import { usePlantNetworks } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'

/** Redes transversales: el catálogo maestro y cuáles habilita esta planta (§12). */
export function NetworksTab({ slug }: { slug: string }) {
  const catalog = useNetworkCatalog()
  const networks = usePlantNetworks(slug)
  const enable = useEnableNetwork(slug)
  const update = useUpdateNetwork(slug)

  if (catalog.isError || networks.isError) return <ErrorState onRetry={() => { void catalog.refetch(); void networks.refetch() }} />
  if (catalog.isLoading || networks.isLoading || !catalog.data) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Cargando redes">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    )
  }

  const byCode = new Map((networks.data ?? []).map((n) => [n.code, n]))
  const fail = (err: unknown, fallback: string) => toast.error(err instanceof ApiError ? err.message : fallback)

  return (
    <>
      <p className="mb-3 text-sm text-fur-gray-600">
        {(networks.data ?? []).filter((n) => n.isEnabled).length} de {catalog.data.length} redes habilitadas. Una red no se puede deshabilitar mientras tenga activos relacionados.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Red</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pública</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.data.map((m) => {
              const n = byCode.get(m.code)
              const enabled = !!n?.isEnabled
              return (
                <TableRow key={m.code}>
                  <TableCell>
                    <span className="mr-2 inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: m.colorToken ? `var(--${m.colorToken})` : undefined }} aria-hidden />
                      <span className="fur-code">{m.code}</span>
                    </span>
                    <span className="font-medium">{m.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-card font-medium text-foreground">
                      {enabled ? 'Habilitada' : 'No habilitada'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {enabled ? (
                      <PermissionGate permission="plant.configure" fallback={<span>{n!.isPublic ? 'Sí' : 'No'}</span>}>
                        <Checkbox
                          checked={n!.isPublic}
                          aria-label={`${m.code} pública`}
                          onCheckedChange={(on) => update.mutate({ id: n!.id, isPublic: on === true }, { onError: (e) => fail(e, 'No se pudo actualizar.') })}
                        />
                      </PermissionGate>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <PermissionGate permission="plant.configure">
                      <div className="flex justify-end">
                        {enabled ? (
                          <Button size="sm" variant="secondary" aria-label={`Deshabilitar ${m.code}`} onClick={() => update.mutate({ id: n!.id, isEnabled: false }, { onError: (e) => fail(e, 'No se pudo deshabilitar.') })}>
                            Deshabilitar
                          </Button>
                        ) : (
                          <Button size="sm" aria-label={`Habilitar ${m.code}`} disabled={enable.isPending} onClick={() => enable.mutate({ networkCode: m.code }, { onError: (e) => fail(e, 'No se pudo habilitar.') })}>
                            Habilitar
                          </Button>
                        )}
                      </div>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
