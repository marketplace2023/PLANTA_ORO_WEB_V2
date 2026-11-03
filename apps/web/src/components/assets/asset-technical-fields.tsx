import { Layers3, ListChecks, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AssetTechnicalDraft } from '@/lib/asset-technical'

const displayValue = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value) ?? ''

export function AssetTechnicalFields({ value, onChange }: { value: AssetTechnicalDraft; onChange: (value: AssetTechnicalDraft) => void }) {
  return (
    <section className="min-w-0 space-y-6 border-t border-border pt-6" aria-label="Ficha técnica propia">
      <div className="space-y-1.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="size-4 text-fur-navy-900" aria-hidden /> Ficha técnica propia</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">Ajusta los datos del equipo instalado. Los cambios se guardan solo en este activo.</p>
      </div>
      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4 text-muted-foreground" aria-hidden /><span>Especificaciones del activo</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{value.specifications.length}</span>
        </legend>
        {value.specifications.length === 0 && <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">Sin especificaciones registradas.</p>}
        {value.specifications.map((row, index) => (
          <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-2 sm:gap-3">
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <label className="min-w-0 space-y-2">
                <span className="text-xs text-muted-foreground">Parámetro y unidad</span>
                <Input aria-label={`Especificación ${index + 1}`} title={row.key} className="h-11 min-w-0 rounded-lg bg-background" placeholder="Ej. Potencia (kW)" maxLength={200} value={row.key} onChange={event => onChange({ ...value, specifications: value.specifications.map((item, i) => i === index ? { ...item, key: event.target.value } : item) })} />
              </label>
              <label className="min-w-0 space-y-2">
                <span className="text-xs text-muted-foreground">Valor del equipo</span>
                <Textarea aria-label={`Valor de especificación ${index + 1}`} className="field-sizing-fixed h-11 min-h-11 min-w-0 resize-y rounded-lg bg-background leading-relaxed [overflow-wrap:anywhere]" placeholder="Valor real del equipo" rows={1} value={displayValue(row.value)} onChange={event => onChange({ ...value, specifications: value.specifications.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} />
              </label>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="mt-6 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Eliminar especificación ${index + 1}`} onClick={() => onChange({ ...value, specifications: value.specifications.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="rounded-lg bg-background" disabled={value.specifications.length >= 500} onClick={() => onChange({ ...value, specifications: [...value.specifications, { key: '', value: '' }] })}><Plus className="size-4" /> Agregar especificación</Button>
      </fieldset>
      <fieldset className="min-w-0 space-y-3 border-t border-border pt-5">
        <legend className="mb-3 flex items-center gap-2 pr-3 text-sm font-medium">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden /><span>Componentes del activo</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{value.components.length}</span>
        </legend>
        {value.components.length === 0 && <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">Sin componentes registrados.</p>}
        {value.components.map((component, index) => (
          <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-2 sm:gap-3">
            <label className="min-w-0 space-y-2">
              <span className="text-xs text-muted-foreground">Componente {index + 1}</span>
              <Textarea aria-label={`Componente ${index + 1}`} className="min-h-16 min-w-0 resize-y rounded-lg bg-background leading-relaxed [overflow-wrap:anywhere]" placeholder="Componente instalado" maxLength={2000} rows={2} value={component} onChange={event => onChange({ ...value, components: value.components.map((item, i) => i === index ? event.target.value : item) })} />
            </label>
            <Button type="button" variant="ghost" size="icon-sm" className="mt-6 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Eliminar componente ${index + 1}`} onClick={() => onChange({ ...value, components: value.components.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="rounded-lg bg-background" disabled={value.components.length >= 500} onClick={() => onChange({ ...value, components: [...value.components, ''] })}><Plus className="size-4" /> Agregar componente</Button>
      </fieldset>
    </section>
  )
}
