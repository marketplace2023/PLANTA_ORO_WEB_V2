import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateConnection, useDeleteConnection, type FlowType, type ProcessOverview } from '@/features/process/use-process'
import { ApiError } from '@/lib/api'
import { FLOW_LABELS, FLOW_TYPES, flowLabel } from '@/lib/process'

/** Edición del flujo (plant.configure): lista las conexiones y permite agregar o quitar. El servidor rechaza ciclos no marcados como retorno. */
export function ConnectionsDialog({ slug, overview, onClose }: { slug: string; overview: ProcessOverview; onClose: () => void }) {
  const create = useCreateConnection(slug)
  const remove = useDeleteConnection(slug)
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [flowType, setFlowType] = useState<FlowType>('MATERIAL')
  const [isReturnFlow, setReturn] = useState(false)
  const [error, setError] = useState<string>()
  const byId = new Map(overview.stages.map((s) => [s.id, s]))
  const label = (id: string) => (byId.has(id) ? `${byId.get(id)!.code} · ${byId.get(id)!.name}` : id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!source || !target) return setError('Elige la etapa de origen y la de destino')
    if (source === target) return setError('El origen y el destino deben ser distintos')
    try {
      await create.mutateAsync({ sourceStageId: source, targetStageId: target, flowType, isReturnFlow })
      toast.success('Conexión agregada')
      setTarget('')
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo agregar la conexión')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conexiones del flujo</DialogTitle>
          <DialogDescription>El flujo principal no admite ciclos: las recirculaciones se marcan como «flujo de retorno».</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate aria-label="Nueva conexión">
          {(
            [
              ['Origen', source, setSource],
              ['Destino', target, setTarget],
            ] as const
          ).map(([name, value, set]) => (
            <div key={name} className="space-y-1">
              <Label htmlFor={`cn-${name}`} className="text-xs">
                {name}
              </Label>
              <Select value={value} onValueChange={set}>
                <SelectTrigger id={`cn-${name}`} className="h-9 w-full" aria-label={name}>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {overview.stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="cn-flow" className="text-xs">
              Tipo de flujo
            </Label>
            <Select value={flowType} onValueChange={(v) => setFlowType(v as FlowType)}>
              <SelectTrigger id="cn-flow" className="h-9 w-full" aria-label="Tipo de flujo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOW_TYPES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FLOW_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <Checkbox checked={isReturnFlow} onCheckedChange={(on) => setReturn(on === true)} />
            Flujo de retorno (recirculación)
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-fur-red-500/10 p-2 text-sm text-fur-red-500 sm:col-span-2">
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={create.isPending}>
              Agregar conexión
            </Button>
          </div>
        </form>

        <section aria-labelledby="cn-list">
          <h3 id="cn-list" className="mb-2 text-sm font-semibold text-fur-navy-900">
            Conexiones actuales ({overview.connections.length})
          </h3>
          {overview.connections.length === 0 ? (
            <p className="text-sm text-fur-gray-600">Aún no hay conexiones.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {overview.connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {label(c.sourceStageId)} → {label(c.targetStageId)}
                  </span>
                  <span className="text-xs text-fur-gray-600">
                    {flowLabel(c.flowType)}
                    {c.isReturnFlow ? ' · retorno' : ''}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar conexión ${label(c.sourceStageId)} a ${label(c.targetStageId)}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutateAsync(c.id).then(() => toast.success('Conexión quitada'), (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar'))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
