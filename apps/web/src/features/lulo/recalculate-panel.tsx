import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { luloJsonBody as jsonBody, luloError } from './request-body'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { decimalText, type LuloDocument, type LuloResult, type Publication } from './types'

export function LuloRecalculatePanel({ doc, slug, publications, onSaved }: { doc: LuloDocument; slug: string; publications: Publication[]; onSaved: (doc: LuloDocument) => void }) {
  const [publicationId, setPublicationId] = useState(doc.input.publicationId ?? '')
  const [ids, setIds] = useState(doc.catalog.apus.map(a => a.id)); const [reason, setReason] = useState('')
  const [types, setTypes] = useState(['MATERIAL', 'EQUIPMENT', 'LABOR']), [structure, setStructure] = useState(false)
  const [preview, setPreview] = useState<{ previewHash: string; previousTotal: string; result: LuloResult; warnings: string[]; expiresAt: string; changes: { apuCode: string; code: string; previous: string | null; next: string }[] } | null>(null)
  const payload = { expectedRevision: doc.revision, publicationId, apuIds: ids, reason, resourceTypes: types, replaceStructure: structure }
  const mutation = useMutation({ mutationFn: (commit: boolean) => api(`/plants/${slug}/lulo/documents/${doc.id}/${commit ? 'recalculate' : 'recalculate-preview'}`, { method: 'POST', ...jsonBody({ ...payload, ...(commit ? { previewHash: preview!.previewHash } : {}) }) }), onSuccess: (data, commit) => { if (commit) onSaved(data as LuloDocument); else setPreview(data as NonNullable<typeof preview>) } })
  return <details className="lulo-panel lulo-recalculate"><summary>Actualizar precios desde una publicación</summary><div className="lulo-panel-body space-y-3"><p className="lulo-hint">El presupuesto conserva sus precios guardados. Selecciona los APU que deseas actualizar y revisa el resultado antes de confirmar. Los ajustes privados que hayas registrado se conservan.</p>
    <label className="lulo-label">Versión de origen<select aria-label="Publicación para recalcular" value={publicationId} onChange={e => { setPublicationId(e.target.value); setPreview(null) }}>{publications.filter(p => p.demo === doc.catalog.demo).map(p => <option key={p.id} value={p.id}>{p.label} · v{p.version}</option>)}</select></label>
    {doc.catalog.apus.map(a => <label key={a.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ids.includes(a.id)} onChange={() => { setIds(old => old.includes(a.id) ? old.filter(id => id !== a.id) : [...old, a.id]); setPreview(null) }} />{a.code} · {a.name}</label>)}
    <div className="lulo-work-line"><h3 className="mb-3 text-sm font-semibold">Clases de insumo que deseas actualizar</h3>{[['MATERIAL', 'Materiales'], ['EQUIPMENT', 'Equipos'], ['LABOR', 'Mano de obra']].map(([type, label]) => <label className="mb-2 flex items-center gap-2 text-sm" key={type}><input type="checkbox" checked={types.includes(type)} onChange={() => { setTypes(old => old.includes(type) ? old.filter(t => t !== type) : [...old, type]); setPreview(null) }} />{label}</label>)}<label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={structure} onChange={e => { setStructure(e.target.checked); setPreview(null) }} />Reemplazar también el rendimiento y la composición desde el maestro</label></div>
    <label className="lulo-label">Motivo del recálculo<Textarea aria-label="Motivo del recálculo" value={reason} onChange={e => { setReason(e.target.value); setPreview(null) }} /></label>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{luloError(mutation.error)}</p>}
    <Button variant="outline" disabled={!ids.length || !types.length || !publicationId || reason.trim().length < 8 || mutation.isPending} onClick={() => mutation.mutate(false)}>Ver impacto del recálculo</Button>
    {preview && <div className="rounded-xl bg-muted p-4"><p className="text-sm">Antes: <strong>{decimalText(preview.previousTotal)}</strong> · Después: <strong>{decimalText(preview.result.totals.total)} {doc.input.currency}</strong></p>{preview.changes?.map((c, i) => <p className="mt-2 text-xs" key={i}>{c.apuCode} · {c.code}: {c.previous ?? 'Nuevo'} → {c.next}</p>)}{preview.expiresAt && <p className="lulo-hint mt-3">Propuesta válida hasta {new Date(preview.expiresAt).toLocaleTimeString('es-VE')}.</p>}{preview.warnings.map(w => <p className="mt-2 text-xs text-destructive" key={w}>{w}</p>)}<Button className="mt-3" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>Confirmar actualización de precios</Button></div>}
  </div></details>
}
