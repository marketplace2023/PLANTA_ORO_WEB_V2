import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export type FamilySpecification = {
  id: string; familyId: string; label: string; unit: string | null; key: string
  valueType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'LIST' | 'RANGE'; required: boolean; sortOrder: number
}
const numeric = (s: string) => s.trim() === '' ? null : Number.isFinite(Number(s.replace(',', '.'))) ? Number(s.replace(',', '.')) : s
const display = (v: unknown) => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Campos del maestro. La familia determina los nombres; el usuario solo introduce valores. */
export function FamilySpecificationFields({ familyId, value, onChange }: {
  familyId: string; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void
}) {
  const q = useQuery({ queryKey: ['catalog', 'specifications', familyId], enabled: !!familyId,
    queryFn: () => api<FamilySpecification[]>(`/catalog/specifications?familyId=${encodeURIComponent(familyId)}`) })
  const set = (key: string, next: unknown) => {
    const updated = { ...value }
    if (next === null || next === '') delete updated[key]
    else updated[key] = next
    onChange(updated)
  }
  if (!familyId) return <p className="text-sm text-muted-foreground">Selecciona una familia para cargar sus especificaciones.</p>
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">Cargando especificaciones de la familia…</p>
  if (q.isError) return <div role="alert" className="space-y-2 text-sm"><p>No se pudieron cargar las especificaciones.</p><Button type="button" variant="outline" onClick={() => void q.refetch()}>Reintentar</Button></div>
  const definitions = q.data ?? []
  const legacy = Object.entries(value).filter(([key]) => !definitions.some(d => d.key === key))
  return <div className="min-w-0 space-y-4" aria-label="Especificaciones de la familia">
    <p className="text-xs text-muted-foreground">Los parámetros se definen en administración para esta familia. Completa los valores del equipo. * Obligatorio.</p>
    {!definitions.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Esta familia aún no tiene especificaciones definidas.</p>}
    {definitions.map(d => {
      const v = value[d.key], id = `spec-${d.id}`
      const cls = 'h-11 min-w-0 w-full rounded-lg border border-border bg-background px-3 text-sm'
      return <div key={d.id} className="grid min-w-0 gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center sm:gap-4">
        <label htmlFor={id} className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{d.label}{d.unit && <span className="ml-1 font-normal text-muted-foreground">({d.unit})</span>}{d.required && <span className="ml-1 text-red-600">*</span>}</label>
        {d.valueType === 'BOOLEAN' ? <select id={id} className={cls} aria-required={d.required} value={v === true ? 'true' : v === false ? 'false' : ''} onChange={e => set(d.key, e.target.value === '' ? null : e.target.value === 'true')}><option value="">Sin dato</option><option value="true">Sí</option><option value="false">No</option></select>
          : d.valueType === 'RANGE' ? <div className="flex min-w-0 gap-2">{(['min','max'] as const).map(bound => {
            const range = typeof v === 'object' && v !== null ? v as Record<string, unknown> : {}
            return <Input key={bound} id={bound === 'min' ? id : `${id}-max`} className="h-11 min-w-0" inputMode="decimal" aria-label={`${d.label}, ${bound === 'min' ? 'mínimo' : 'máximo'}`} placeholder={bound === 'min' ? 'Mínimo' : 'Máximo'} defaultValue={display(range[bound])} onChange={e => { const next = { ...range }; const parsed = numeric(e.target.value); if (parsed === null) delete next[bound]; else next[bound] = parsed; set(d.key, Object.keys(next).length ? next : null) }} />
          })}</div>
          : d.valueType === 'LIST' ? <Textarea id={id} className="field-sizing-fixed h-11 min-h-11 resize-y" aria-required={d.required} onBlur={e => set(d.key, e.target.value.trim() ? e.target.value.split('\n').map(s => s.trim()).filter(Boolean) : null)} placeholder="Un elemento por línea" value={Array.isArray(v) ? v.join('\n') : display(v)} onChange={e => set(d.key, e.target.value.trim() ? e.target.value.split('\n') : null)} />
          : <Input id={id} className="h-11 min-w-0" aria-required={d.required} inputMode={d.valueType === 'NUMBER' ? 'decimal' : 'text'} defaultValue={display(v)} onChange={e => set(d.key, d.valueType === 'NUMBER' ? numeric(e.target.value) : e.target.value)} />}
      </div>
    })}
    {!!legacy.length && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Datos anteriores fuera del maestro ({legacy.length})</summary><p className="my-2 text-xs text-muted-foreground">Se conservan para consulta. Para registrar nuevos valores, utiliza los parámetros definidos arriba.</p><dl className="space-y-2 text-sm">{legacy.map(([key, v]) => <div key={key} className="grid gap-1 sm:grid-cols-2"><dt className="font-medium [overflow-wrap:anywhere]">{key}</dt><dd className="[overflow-wrap:anywhere]">{display(v)}</dd></div>)}</dl></details>}
  </div>
}
