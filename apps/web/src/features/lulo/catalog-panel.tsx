import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Library, Plus, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ApuChoice, LuloInput, Publication } from './types'

export function LuloCatalogPanel({ input, publications, disabled, plantSlug, publicationLocked = false, onSelect, onAdd, onManual }: { input: LuloInput; publications: Publication[]; disabled: boolean; plantSlug?: string; publicationLocked?: boolean; onSelect: (id: string) => void; onAdd: (apu: ApuChoice) => void; onManual: () => void }) {
  const [term, setTerm] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1)
  const historical = publications.find(p => p.id === input.publicationId)?.historical
  const results = useQuery({ queryKey: ['lulo', 'catalog', plantSlug, input.publicationId, historical, search, page], enabled: !!input.publicationId && !!publications.length,
    queryFn: () => api<{ items: ApuChoice[]; total: number; pageSize: number }>(plantSlug && historical ? `/plants/${plantSlug}/lulo/masters?${new URLSearchParams({ catalogId: input.publicationId!, kind: 'ITEM', search, page: String(page) })}` : `/budget-estimates/publications/${input.publicationId}/apus?${new URLSearchParams({ search, page: String(page) })}`) })
  return <aside className="lulo-panel lulo-library"><header><Library className="size-4" /><h2>Biblioteca de partidas</h2></header><div className="lulo-panel-body space-y-4">
    <label className="lulo-label">Catálogo compartido<select aria-label="Catálogo compartido" disabled={disabled || publicationLocked} value={input.publicationId ?? ''} onChange={e => { onSelect(e.target.value); setPage(1) }}><option value="">Solo partidas manuales</option>{publications.map(p => <option key={p.id} value={p.id}>{p.label} · v{p.version}{p.demo ? ' · DEMO' : ''}</option>)}</select></label>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(term); setPage(1) }}><Input aria-label="Buscar partidas LULO" placeholder="Código o descripción" value={term} onChange={e => setTerm(e.target.value)} /><Button type="submit" size="icon" variant="outline" aria-label="Buscar partidas"><Search /></Button></form>
    {!input.publicationId ? <p className="lulo-hint">Selecciona una biblioteca publicada o crea partidas manuales con tus propios precios.</p> : results.isLoading ? <p className="lulo-hint" role="status">Buscando partidas…</p> : results.isError ? <p role="alert" className="lulo-hint">No se pudo cargar esta publicación. Selecciona otra o reintenta.<Button variant="ghost" onClick={() => void results.refetch()}>Reintentar</Button></p> : <>
      <p className="lulo-hint">{results.data?.total} partidas disponibles</p><ul className="lulo-catalog-list">{results.data?.items.map(a => <li key={a.id}><button disabled={disabled || input.lines.length >= 200} onClick={() => onAdd(a)}><span className="font-mono text-[10px] text-muted-foreground">{a.code}</span><strong>{a.name}</strong><span className="lulo-catalog-unit">{a.unit}<Plus className="size-4" /></span></button></li>)}</ul>
      {results.data?.total === 0 && <p className="lulo-hint">No hay coincidencias con esta búsqueda.</p>}
      <div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><span className="lulo-hint">{page}</span><Button size="sm" variant="outline" disabled={page * (results.data?.pageSize ?? 20) >= (results.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
    </>}
    <Button className="w-full" variant="outline" disabled={disabled || input.lines.length >= 200} onClick={onManual}><Plus /> Partida manual</Button>
    <p className="lulo-hint">Agregar una partida no modifica el catálogo. Los ajustes que registres pertenecen a tu estimación.</p>
  </div></aside>
}
