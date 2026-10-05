import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCatalogFamilies } from '@/features/assets/use-assets'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useUpdateProvider, type ProviderDetail } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { CheckGroup } from './check-group'

/** Etapas y familias que atiende un proveedor (alimentan los filtros del listado público). */
export function CoverageDialog({ provider, onClose }: { provider: ProviderDetail; onClose: () => void }) {
  const update = useUpdateProvider(provider.id)
  const stages = useStageCatalog()
  const families = useCatalogFamilies()
  const [stageCodes, setStageCodes] = useState(provider.stages.map((s) => s.code))
  const [familyCodes, setFamilyCodes] = useState(provider.families.map((f) => f.code))
  const [error, setError] = useState<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync({ stageCodes, familyCodes })
      toast.success('Cobertura actualizada')
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Etapas y familias</DialogTitle>
          <DialogDescription>Los compradores encuentran a tu empresa filtrando por estas etapas del proceso y familias de equipos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <CheckGroup legend="Etapas que atiendes" options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} value={stageCodes} onChange={setStageCodes} />
          <CheckGroup legend="Familias de equipos" options={(families.data ?? []).map((f) => ({ value: f.code, label: f.name }))} value={familyCodes} onChange={setFamilyCodes} />
          {error && (
            <p role="alert" className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
