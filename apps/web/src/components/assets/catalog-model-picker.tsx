import { ModelFichaDialog } from '@/components/catalog/model-ficha-dialog'
import { useStageCatalog, useNetworkCatalog } from '@/features/catalog/use-catalog'
import { useState } from 'react'
import { ChevronsUpDown, Eye, Package, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import type { CatalogModel } from '@/features/assets/use-assets'

type Props = {
  value: string
  selectedIds?: string[]
  selected: { modelName: string; catalogTag?: string | null } | null
  items: CatalogModel[]
  total: number
  search: string
  onSearchChange: (value: string) => void
  onSelect: (model: CatalogModel) => void
  loading: boolean
  failed: boolean
  onRetry: () => void
  invalid?: boolean
  describedBy?: string
}

export function CatalogModelPicker({ value, selectedIds = [], selected, items, total, search, onSearchChange, onSelect, loading, failed, onRetry, invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<CatalogModel | null>(null)
  const label = selected ? `${selected.catalogTag ? `${selected.catalogTag} · ` : ''}${selected.modelName}` : ''

  return (
    // El menú se porta fuera del Dialog; su propio bloqueo permite scroll dentro.
    <>
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="assetModelId"
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Modelo del catálogo"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}
          title={label || undefined}
          className="h-11 w-full min-w-0 max-w-full justify-between gap-3 overflow-hidden rounded-lg bg-background px-3 font-normal shadow-none hover:bg-muted/40"
        >
          <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={`min-w-0 flex-1 truncate text-left ${label ? 'text-foreground' : 'text-muted-foreground'}`}>{label || 'Selecciona un modelo'}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent onCloseAutoFocus={event => { if (preview) event.preventDefault() }} aria-label="Elegir modelo del catálogo" align="start" sideOffset={6} className="flex max-h-[min(26rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl p-0 shadow-lg">
        <Command label="Buscar modelo del catálogo" shouldFilter={false} className="min-h-0 rounded-xl p-0">
          <div className="shrink-0 border-b border-border p-2 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:h-11! [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-muted/60">
            <CommandInput aria-label="Buscar modelo del catálogo" placeholder="Buscar por TAG, nombre o tipo…" maxLength={100} value={search} onValueChange={onSearchChange} />
          </div>
          <CommandList label="Modelos del catálogo" aria-busy={loading} className="min-h-0 max-h-64 flex-1 overscroll-contain scroll-py-2 p-2">
            {loading ? (
              <div role="status" aria-label="Buscando modelos" className="space-y-3 p-2">
                <span className="sr-only">Buscando modelos…</span>
                {[0, 1, 2].map(row => <div key={row} className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
              </div>
            ) : failed ? (
              <div role="alert" className="space-y-2 px-3 py-5 text-center text-sm">
                <p>No se pudo cargar el catálogo.</p>
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>
              </div>
            ) : items.length === 0 ? (
              <div role="status" className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
                <Search className="size-5" aria-hidden />
                <p>{search ? 'No hay modelos que coincidan con la búsqueda.' : 'No hay modelos activos disponibles.'}</p>
                <p className="text-xs">{search ? 'Prueba con otro TAG, nombre o tipo.' : 'Carga primero un modelo en el catálogo.'}</p>
              </div>
            ) : items.map(model => (
              <div key={model.id} className="flex min-w-0 items-center gap-1 rounded-lg has-[[data-selected=true]]:bg-fur-gold-500/10 has-[[data-checked=true]]:bg-fur-gold-500/10">
              <CommandItem
                value={model.id}
                data-checked={value === model.id || selectedIds.includes(model.id)}
                onSelect={() => { onSelect(model); setOpen(false) }}
                className="min-w-0 flex-1 gap-3 rounded-lg px-3 py-2.5 data-selected:bg-fur-gold-500/10 data-selected:text-foreground data-[checked=true]:bg-fur-gold-500/10"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-medium" title={model.modelName}>{model.modelName}</span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    {model.catalogTag && <span className="fur-code max-w-1/2 shrink-0 truncate rounded bg-muted px-1.5 py-0.5" title={model.catalogTag}>{model.catalogTag}</span>}
                    <span className="truncate" title={model.type.name}>{model.type.name}</span>
                  </span>
                </div>
                {(value === model.id || selectedIds.includes(model.id)) && <span className="sr-only">Seleccionado</span>}
              </CommandItem>
              <Button type="button" variant="ghost" size="icon-sm" className="mr-2 shrink-0"
                aria-label={`Ver ficha de ${model.modelName}${model.catalogTag ? ` (${model.catalogTag})` : ''}`}
                title="Ver ficha del modelo"
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
                onClick={event => { event.stopPropagation(); setPreview(model); setOpen(false) }}>
                <Eye className="size-4" aria-hidden />
              </Button>
              </div>
            ))}
          </CommandList>
          {!loading && !failed && total > 0 && (
            <p className="shrink-0 border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground" aria-live="polite">
              {total.toLocaleString('es')} {total === 1 ? 'modelo encontrado' : 'modelos encontrados'}{total > items.length ? `. Se muestran ${items.length}; afina la búsqueda.` : '.'}
            </p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
    {preview && <CatalogModelPreview model={preview} onClose={() => { setPreview(null); setOpen(true) }} />}
    </>
  )
}

/** La ficha se abre fuera del menú para no competir con su bloqueo de foco. */
function CatalogModelPreview({ model, onClose }: { model: CatalogModel; onClose: () => void }) {
  const stages = useStageCatalog()
  const networks = useNetworkCatalog()
  return <ModelFichaDialog model={model} stages={stages.data ?? []} networks={networks.data ?? []} onClose={onClose} />
}
