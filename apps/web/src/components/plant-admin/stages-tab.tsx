import { Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useEnableStage, useUpdateStage } from '@/features/plant/use-plant-admin'
import { usePlantStages, type PlantStage } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'

const GROUP_LABELS: Record<string, string> = {
  TRITURACION: 'Trituración',
  MOLIENDA: 'Molienda',
  LIXIVIACION: 'Lixiviación',
  CARBON: 'Carbón',
  ELUCION: 'Elución / Recuperación',
  RELAVES: 'Relaves',
}

function EditDialog({ slug, stage, onClose }: { slug: string; stage: PlantStage; onClose: () => void }) {
  const update = useUpdateStage(slug)
  const [name, setName] = useState(stage.name === stage.displayName ? '' : stage.displayName)
  const [sequence, setSequence] = useState(String(stage.sequence))
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const seq = Number(sequence)
    if (!Number.isInteger(seq) || seq < 1) return setErrors({ sequence: 'Debe ser un entero mayor o igual a 1' })
    try {
      await update.mutateAsync({ id: stage.id, sequence: seq, nameOverride: name.trim() || null })
      toast.success('Etapa actualizada')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ form: err instanceof ApiError ? err.message : 'No se pudo guardar.' })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Editar {stage.code}
          </DialogTitle>
          <DialogDescription>El nombre propio reemplaza al del catálogo solo en esta planta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="stage-name">Nombre propio (opcional)</Label>
            <Input id="stage-name" className="h-10" value={name} placeholder={stage.name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-seq">Orden en el proceso</Label>
            <Input id="stage-seq" type="number" min={1} className="h-10" value={sequence} onChange={(e) => setSequence(e.target.value)} aria-invalid={!!errors.sequence} />
            {errors.sequence && <p className="text-sm text-fur-red-500">{errors.sequence}</p>}
          </div>
          <div role="alert" aria-live="polite">
            {errors.form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors.form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Etapas del proceso: el catálogo maestro (D01…D19) y cuáles usa esta planta. */
export function StagesTab({ slug }: { slug: string }) {
  const catalog = useStageCatalog()
  const stages = usePlantStages(slug)
  const enable = useEnableStage(slug)
  const update = useUpdateStage(slug)
  const [editing, setEditing] = useState<PlantStage | null>(null)

  if (catalog.isError || stages.isError) return <ErrorState onRetry={() => { void catalog.refetch(); void stages.refetch() }} />
  if (catalog.isLoading || stages.isLoading || !catalog.data) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Cargando etapas">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    )
  }

  const byCode = new Map((stages.data ?? []).map((s) => [s.code, s]))
  const fail = (err: unknown, fallback: string) => toast.error(err instanceof ApiError ? err.message : fallback)

  return (
    <>
      <p className="mb-3 text-sm text-fur-gray-600">
        {(stages.data ?? []).filter((s) => s.isEnabled).length} de {catalog.data.length} etapas habilitadas. Una etapa no se puede deshabilitar mientras tenga activos.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Etapa</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pública</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.data.map((m) => {
              const s = byCode.get(m.code)
              const enabled = !!s?.isEnabled
              return (
                <TableRow key={m.code}>
                  <TableCell>
                    <span className="fur-code mr-2 rounded-md bg-fur-navy-900 px-2 py-0.5 text-fur-gold-400">{m.code}</span>
                    <span className="font-medium">{s?.displayName ?? m.name}</span>
                    {s && s.displayName !== m.name && <span className="ml-2 text-xs text-fur-gray-600">({m.name})</span>}
                  </TableCell>
                  <TableCell>{GROUP_LABELS[m.stageGroup] ?? m.stageGroup}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-card font-medium text-foreground">
                      {enabled ? 'Habilitada' : 'No habilitada'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {enabled ? (
                      <PermissionGate permission="plant.configure" fallback={<span>{s!.isPublic ? 'Sí' : 'No'}</span>}>
                        <Checkbox
                          checked={s!.isPublic}
                          aria-label={`${m.code} pública`}
                          onCheckedChange={(on) => update.mutate({ id: s!.id, isPublic: on === true }, { onError: (e) => fail(e, 'No se pudo actualizar.') })}
                        />
                      </PermissionGate>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <PermissionGate permission="plant.configure">
                      <div className="flex justify-end gap-1">
                        {enabled ? (
                          <>
                            <Button size="icon-sm" variant="ghost" aria-label={`Editar ${m.code}`} onClick={() => setEditing(s!)}>
                              <Pencil />
                            </Button>
                            <Button size="sm" variant="secondary" aria-label={`Deshabilitar ${m.code}`} onClick={() => update.mutate({ id: s!.id, isEnabled: false }, { onError: (e) => fail(e, 'No se pudo deshabilitar.') })}>
                              Deshabilitar
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" aria-label={`Habilitar ${m.code}`} disabled={enable.isPending} onClick={() => enable.mutate({ stageCode: m.code }, { onError: (e) => fail(e, 'No se pudo habilitar.') })}>
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
      {editing && <EditDialog slug={slug} stage={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
