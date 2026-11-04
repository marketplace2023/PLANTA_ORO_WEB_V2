import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'
import { useCatalogFamilies } from '@/features/assets/use-assets'
import { FieldsDialog, type Field } from '@/components/base/fields-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FamilySpecification } from '@/components/assets/family-specification-fields'

const types = { TEXT: 'Texto', NUMBER: 'Número', RANGE: 'Rango', BOOLEAN: 'Sí / No', LIST: 'Lista de textos' }
export function SpecificationsAdmin() {
  const families = useCatalogFamilies()
  const [familyId, setFamilyId] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ row?: FamilySpecification } | null>(null)
  const [deleting, setDeleting] = useState<FamilySpecification | null>(null)
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['catalog', 'specifications', familyId], enabled: !!familyId, queryFn: () => api<FamilySpecification[]>(`/catalog/specifications?familyId=${encodeURIComponent(familyId)}`) })
  const remove = useMutation({ mutationFn: (id: string) => api(`/catalog/specifications/${id}`, { method: 'DELETE' }), onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['catalog', 'specifications'] }) } })
  const fields: Field[] = [
    { name: 'label', label: 'Nombre', required: true }, { name: 'unit', label: 'Unidad' },
    { name: 'valueType', label: 'Tipo', type: 'select', required: true, options: Object.entries(types).map(([value, label]) => ({ value, label })) },
    { name: 'required', label: 'Obligatoria', type: 'checkbox' }, { name: 'sortOrder', label: 'Orden', type: 'number', min: 0, step: 1 },
  ]
  return <section className="space-y-4 rounded-xl border border-border bg-card p-4">
    <h2 className="text-lg font-semibold">Especificaciones por familia</h2>
    <div className="flex flex-wrap gap-3">
      <select aria-label="Familia de especificaciones" className="h-10 max-w-full rounded-lg border border-border px-3" value={familyId} onChange={e => { setFamilyId(e.target.value); setSearch('') }}><option value="">Selecciona una familia</option>{families.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <Input className="w-60" aria-label="Buscar especificación" placeholder="Nombre o unidad…" value={search} onChange={e => setSearch(e.target.value)} />
      <Button disabled={!familyId} onClick={() => setForm({})}>Nueva especificación</Button>
    </div>
    {!familyId ? <p>Selecciona una familia.</p> : q.isPending ? <p role="status">Cargando especificaciones…</p> : q.isError ? <Button variant="outline" onClick={() => void q.refetch()}>Reintentar carga de especificaciones</Button> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{['Nombre', 'Unidad', 'Tipo', 'Obligatoria', 'Acciones'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{q.data?.filter(d => `${d.label} ${d.unit ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(d => <tr key={d.id} className="border-b border-border"><td className="p-3">{d.label}</td><td>{d.unit || '—'}</td><td>{types[d.valueType]}</td><td>{d.required ? 'Sí' : 'No'}</td><td className="space-x-2 py-2"><Button size="sm" variant="outline" onClick={() => setForm({ row: d })}>Editar</Button><Button size="sm" variant="outline" onClick={() => { setError(''); setDeleting(d) }}>Eliminar</Button></td></tr>)}</tbody></table></div>}
    {form && <FieldsDialog title={form.row ? 'Editar especificación' : 'Nueva especificación'} fields={fields} initial={form.row ? { label: form.row.label, unit: form.row.unit ?? '', valueType: form.row.valueType, required: form.row.required, sortOrder: String(form.row.sortOrder) } : { valueType: 'TEXT', sortOrder: '0' }} submitLabel="Guardar" onClose={() => setForm(null)} onSubmit={async v => {
      await api(`/catalog/specifications${form.row ? '/' + form.row.id : ''}`, { method: form.row ? 'PATCH' : 'POST', ...jsonBody({ ...(!form.row && { familyId }), label: String(v.label).trim(), unit: String(v.unit).trim() || null, valueType: v.valueType, required: !!v.required, sortOrder: Number(v.sortOrder) || 0 }) })
      void qc.invalidateQueries({ queryKey: ['catalog', 'specifications'] }); setForm(null)
    }} />}
    {deleting && <div role="alert" className="space-y-2 rounded-lg border border-border p-3"><p>¿Eliminar «{deleting.label}»? Solo es posible si no tiene valores registrados.</p>{error && <p className="text-red-600">{error}</p>}<div className="flex gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button><Button disabled={remove.isPending} onClick={() => remove.mutate(deleting.id, { onError: e => setError(e.message) })}>Confirmar eliminación</Button></div></div>}
  </section>
}
