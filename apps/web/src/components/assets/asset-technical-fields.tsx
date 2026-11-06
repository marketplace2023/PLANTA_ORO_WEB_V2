import { FamilySpecificationFields } from './family-specification-fields'
import { Layers3, ListChecks, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AssetTechnicalDraft } from '@/lib/asset-technical'


export function AssetTechnicalFields({ value, onChange, familyId }: { familyId: string; value: AssetTechnicalDraft; onChange: (value: AssetTechnicalDraft) => void }) {
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
        <FamilySpecificationFields key={familyId} familyId={familyId} showLegacy={false} value={Object.fromEntries(value.specifications.map(row => [row.key, row.value]))}
          onChange={specifications => onChange({ ...value, specifications: Object.entries(specifications).map(([key, rowValue]) => ({ key, value: rowValue })) })} />
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
