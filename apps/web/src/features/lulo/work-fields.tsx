import type { ReactNode } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, apiBlob, formBody } from '@/lib/api'
import type { WorkRecordInput } from './work-types'

export function WorkField({ label, value, onChange, type = 'text', required = true, children }: { label: string; value?: string; onChange?: (v: string) => void; type?: string; required?: boolean; children?: ReactNode }) {
  return <label className="lulo-label">{label}{children ?? <Input type={type} required={required} value={value ?? ''} onChange={e => onChange?.(e.target.value)} />}</label>
}
export function WorkSelect({ label, value, options, onChange, empty = 'Selecciona…' }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; empty?: string }) { return <WorkField label={label}><select required value={value} onChange={e => onChange(e.target.value)}><option value="">{empty}</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></WorkField> }
type Evidence = WorkRecordInput['evidence']
export function WorkEvidence({ value, onChange, slug, canUpload }: { value: Evidence; onChange: (v: Evidence) => void; slug: string; canUpload: boolean }) {
  const [name, setName] = useState(''), [url, setUrl] = useState('')
  const upload = useMutation({ mutationFn: (file: File) => api<{ id: string; title: string }>(`/plants/${slug}/documents`, { method: 'POST', ...formBody({ title: file.name, documentType: 'OTRO', visibility: 'INTERNAL' }, file) }), onSuccess: doc => onChange([...value, { name: doc.title, url: '', documentId: doc.id }]) })
  const download = useMutation({ mutationFn: async (entry: Evidence[number]) => { const blob = await apiBlob(`/plants/${slug}/documents/${entry.documentId}/download${entry.documentVersion ? `?version=${entry.documentVersion}` : ''}`); const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = entry.name; a.click(); window.setTimeout(() => URL.revokeObjectURL(u), 1000) } })
  return <fieldset className="lulo-work-evidence"><legend className="font-semibold">Evidencias y anexos</legend><p className="lulo-hint">Vincula un documento o adjunta el respaldo de campo. Los archivos cargados son internos de la planta.</p><ul className="space-y-2">{value.map((e, i) => <li key={i} className="flex items-center justify-between gap-2 text-sm">{e.documentId ? <button type="button" className="underline" onClick={() => download.mutate(e)}>{e.name}</button> : <a href={e.url} target="_blank" rel="noreferrer" className="underline">{e.name}</a>}<Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((_, n) => n !== i))}>Quitar</Button></li>)}</ul><div className="grid gap-3 sm:grid-cols-2"><WorkField label="Nombre de la evidencia" value={name} onChange={setName} required={false} /><WorkField label="Enlace HTTPS" type="url" value={url} onChange={setUrl} required={false} /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!name.trim() || !url.startsWith('https://')} onClick={() => { onChange([...value, { name, url }]); setName(''); setUrl('') }}>Agregar enlace de evidencia</Button>{canUpload && <label className="lulo-work-upload">{upload.isPending ? 'Subiendo…' : 'Adjuntar archivo'}<input type="file" disabled={upload.isPending} onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = '' }} /></label>}</div>{upload.isError && <p role="alert" className="text-sm text-destructive">{upload.error.message}</p>}</fieldset>
}
