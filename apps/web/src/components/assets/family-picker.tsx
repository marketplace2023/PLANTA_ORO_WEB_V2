import { useState } from 'react'
import { ChevronsUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Family = { id: string; name: string; code: string; tagCode?: string }
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function FamilyPicker({ value, items, onChange, loading, failed, onRetry, invalid }: {
  value: string; items: Family[]; onChange: (id: string) => void; loading: boolean; failed: boolean; onRetry: () => void; invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = items.find(item => item.id === value)
  const matches = items.filter(item => normalized(`${item.name} ${item.code} ${item.tagCode ?? ''}`).includes(normalized(search)))
  return <Popover modal open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id="familyId" type="button" variant="outline" role="combobox" aria-label="Familia" aria-expanded={open} aria-invalid={invalid}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}
      className="h-11 w-full min-w-0 justify-between gap-3 rounded-lg bg-background font-normal">
      <span className="min-w-0 truncate">{selected ? `${selected.tagCode ?? selected.code} · ${selected.name}` : 'Selecciona una familia'}</span><ChevronsUpDown className="size-4 shrink-0" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] overflow-hidden p-0">
      <Command label="Buscar familia" shouldFilter={false}>
        <CommandInput placeholder="Buscar por nombre o código…" value={search} onValueChange={setSearch} />
        <CommandList label="Familias" className="max-h-64 overscroll-contain">
          {loading ? <p role="status" className="p-4 text-sm">Cargando familias…</p> : failed ? <div role="alert" className="p-4"><p>No se pudieron cargar las familias.</p><Button type="button" variant="outline" onClick={onRetry}>Reintentar</Button></div> : matches.length === 0 ? <p role="status" className="p-4 text-sm">No hay familias coincidentes.</p> : matches.map(item => <CommandItem key={item.id} value={item.id} onSelect={() => { onChange(item.id); setOpen(false); setSearch('') }}>
            <span className="min-w-0 flex-1 truncate">{item.tagCode ?? item.code} · {item.name}</span>{item.id === value && <Check className="size-4" />}
          </CommandItem>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
