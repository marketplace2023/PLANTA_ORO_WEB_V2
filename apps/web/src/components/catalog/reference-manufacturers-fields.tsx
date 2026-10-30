import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ReferenceManufacturer = { nombre: string; alcance: string | null; sitioWeb: string | null }

export function ReferenceManufacturersFields({ value, onChange }: { value: ReferenceManufacturer[]; onChange: (next: ReferenceManufacturer[]) => void }) {
  const update = (index: number, field: keyof ReferenceManufacturer, text: string) =>
    onChange(value.map((ref, i) => i === index ? { ...ref, [field]: text } : ref))
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-medium">Fabricantes de referencia</legend>
      <p className="text-xs text-muted-foreground">Puedes asociar varios fabricantes. Sus nombres se mostrarán en la ficha y en los filtros del catálogo.</p>
      {value.map((ref, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-end gap-2">
            <label className="flex-1 space-y-1 text-xs">Fabricante {index + 1}
              <Input value={ref.nombre} onChange={e => update(index, 'nombre', e.target.value)} maxLength={160} required placeholder="Ej. Siemens" />
            </label>
            <Button type="button" variant="outline" size="icon" aria-label={`Quitar fabricante ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 /></Button>
          </div>
          <label className="block space-y-1 text-xs">Descripción {index + 1}
            <Input value={ref.alcance ?? ''} onChange={e => update(index, 'alcance', e.target.value)} maxLength={2000} />
          </label>
          <label className="block space-y-1 text-xs">Sitio web {index + 1}
            <Input type="url" value={ref.sitioWeb ?? ''} onChange={e => update(index, 'sitioWeb', e.target.value)} maxLength={2048} placeholder="https://…" />
          </label>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { nombre: '', alcance: null, sitioWeb: null }])}><Plus /> Añadir fabricante de referencia</Button>
    </fieldset>
  )
}
