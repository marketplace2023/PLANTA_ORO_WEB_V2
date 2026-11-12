import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Calculator, CheckCheck, Download, FileCheck2, FolderPlus, History, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { usePlant, type PlantSummary } from '@/features/plant/plant-context'
import { api, apiBlob, ApiError } from '@/lib/api'
import { luloJsonBody as jsonBody } from './request-body'
import { LuloCatalogPanel } from './catalog-panel'
import { LuloRecalculatePanel } from './recalculate-panel'
import { BudgetContext, BudgetAsset } from './budget-context'
import { readLuloDraft, writeLuloDraft } from './local-draft'
import { decimalText, newLuloInput, rateLabels, reportKinds, stateLabels, type ApuChoice, type Calculation, type LuloDocument, type LuloInput, type Publication } from './types'

const keyOf = (input: LuloInput) => JSON.stringify(input)
const errorMessage = (e: Error) => e instanceof ApiError && e.fieldErrors.length ? e.fieldErrors.slice(0, 6).map(f => `${f.path}: ${f.message}`).join(' · ') : e.message
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }

export function LuloEditor({ doc, plant, initialInput, canEdit = true, canApprove = false }: { doc?: LuloDocument; plant?: PlantSummary; initialInput?: LuloInput; canEdit?: boolean; canApprove?: boolean }) {
  const navigate = useNavigate(); const client = useQueryClient(); const auth = useAuth(); const plants = usePlant()
  const [routeParams] = useSearchParams()
  const [input, setInput] = useState<LuloInput>(() => { const candidate = doc?.input ?? initialInput ?? (!plant ? readLuloDraft() : null) ?? newLuloInput(); return plant && !doc && routeParams.get('workId') ? { ...candidate, workId: routeParams.get('workId') } : candidate })
  const [calculated, setCalculated] = useState<(Calculation & { inputKey: string }) | null>(() => doc ? { result: doc.result, catalog: doc.catalog, warnings: doc.warnings, hash: doc.contentHash, inputKey: keyOf(doc.input) } : null)
  const [storageError, setStorageError] = useState(''); const [error, setError] = useState(''); const [reason, setReason] = useState('')
  const [chapterName, setChapterName] = useState(''); const [parentChapter, setParentChapter] = useState(''); const [targetChapter, setTargetChapter] = useState(input.chapters[0].id)
  const [inspected, setInspected] = useState(''); const [destination, setDestination] = useState(plant?.slug ?? plants.currentPlant?.slug ?? '')
  const [reportKind, setReportKind] = useState<keyof typeof reportKinds>('budget')
  const request = useRef({ key: '', id: crypto.randomUUID() })
  const readonly = !canEdit || !!doc && doc.status !== 'DRAFT'
  const publicMode = !plant && !doc
  const inputKey = keyOf(input)
  const current = calculated?.inputKey === inputKey
  const dirty = !!doc && inputKey !== keyOf(doc.input)
  const publications = useQuery({ queryKey: ['lulo', 'publications'], queryFn: () => api<Publication[]>('/budget-estimates/publications') })
  const destinations = plants.availablePlants.filter(p => auth.user?.isGlobalAdmin || auth.access.some(a => a.plantId === p.id && a.permissions.includes('budget.edit')))

  useEffect(() => {
    if (!publicMode) return
    const save = () => { try { writeLuloDraft(input); setStorageError('') } catch { setStorageError('El navegador no permite guardar el borrador. Mantén esta página abierta y descarga tu estimación antes de salir.') } }
    const timer = window.setTimeout(save, 200)
    window.addEventListener('pagehide', save)
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', save); save() }
  }, [input, publicMode])

  const update = <K extends keyof LuloInput>(field: K, value: LuloInput[K]) => { setInput(old => ({ ...old, [field]: value })); setError('') }
  const line = (id: string, patch: Partial<LuloInput['lines'][number]>) => update('lines', input.lines.map(l => l.id === id ? { ...l, ...patch } : l))
  const calculate = useMutation({ mutationFn: (candidate: LuloInput) => doc && plant
    ? api<Calculation>(`/plants/${plant.slug}/lulo/documents/${doc.id}/preview`, { method: 'POST', ...jsonBody({ expectedRevision: doc.revision, reason: 'Vista previa de edición del presupuesto', input: candidate }) })
    : api<Calculation>(plant ? `/plants/${plant.slug}/lulo/calculate` : '/budget-estimates/calculate', { method: 'POST', ...jsonBody(candidate) }), onSuccess: (result, candidate) => { setCalculated({ ...result, inputKey: keyOf(candidate) }); setError('') } })
  const example = useMutation({ mutationFn: () => api<{ available: boolean; input: LuloInput | null }>('/budget-estimates/example'), onSuccess: async data => {
    if (!data.input) { setError('El ejemplo todavía no está disponible. Puedes iniciar con una partida manual.'); return }
    setInput(data.input); setTargetChapter(data.input.chapters[0].id)
    try { const result = await api<Calculation>('/budget-estimates/calculate', { method: 'POST', ...jsonBody(data.input) }); setCalculated({ ...result, inputKey: keyOf(data.input) }) } catch (e) { setError((e as Error).message) }
  } })
  async function choosePublication(id: string) {
    if (!id) { update('publicationId', null); return }
    try {
      const meta = await api<{ currency: string | null }>(`/budget-estimates/publications/${id}/apus?page=1`)
      if (!meta.currency) { update('publicationId', id); return }
      if (input.lines.length && meta.currency !== input.currency) { setError('Este catálogo usa otra moneda. Inicia una estimación nueva para usarlo; los importes no se convierten automáticamente.'); return }
      setInput(old => ({ ...old, publicationId: id, currency: meta.currency ?? old.currency }))
    } catch (e) { setError((e as Error).message) }
  }
  function addApu(a: ApuChoice) {
    update('lines', [...input.lines, { id: crypto.randomUUID(), chapterId: targetChapter, mode: 'CALCULATED', apuId: a.id, code: a.code, description: a.name, unit: a.unit, quantity: '1', manualPrice: null, reason: '', taxable: true }])
  }
  function addManual() {
    update('lines', [...input.lines, { id: crypto.randomUUID(), chapterId: targetChapter, mode: 'MANUAL', apuId: null, code: `MAN-${String(input.lines.length + 1).padStart(3, '0')}`, description: 'Nueva partida manual', unit: 'UND', quantity: '1', manualPrice: '0', reason: '', taxable: true }])
  }
  function saved(value: LuloDocument) {
    const slug = plant?.slug ?? destination
    client.setQueryData(['lulo', 'document', slug, value.id], value)
    void client.invalidateQueries({ queryKey: ['lulo', 'documents', slug] })
    navigate(`/plants/${slug}/budgets/lulo/${value.id}`)
    toast.success('Presupuesto guardado en la planta')
  }
  const save = useMutation({ mutationFn: async () => {
    if (doc && plant) return api<LuloDocument>(`/plants/${plant.slug}/lulo/documents/${doc.id}`, { method: 'PATCH', ...jsonBody({ expectedRevision: doc.revision, reason, input }) })
    const slug = plant?.slug ?? destination
    if (!slug) throw new Error('Selecciona una planta de destino')
    if (request.current.key !== inputKey) request.current = { key: inputKey, id: crypto.randomUUID() }
    return api<LuloDocument>(`/plants/${slug}/lulo/documents`, { method: 'POST', ...jsonBody({ requestId: request.current.id, input }) })
  }, onSuccess: value => {
    if (plant) saved(value)
    else { toast.success('Estimación adoptada en la planta'); navigate(`/plants/${destination}/budgets/lulo/${value.id}`) }
  } })
  const workflow = useMutation({ mutationFn: (action: 'submit' | 'return' | 'issue' | 'revisions') => api<LuloDocument>(`/plants/${plant!.slug}/lulo/documents/${doc!.id}/${action}`, { method: 'POST', ...jsonBody({ expectedRevision: doc!.revision, reason, requestId: request.current.id }) }), onSuccess: value => saved(value) })
  const report = useMutation({ mutationFn: (format: 'pdf' | 'xlsx') => doc && plant
    ? apiBlob(`/plants/${plant.slug}/lulo/documents/${doc.id}/report?kind=${reportKind}&format=${format}`)
    : apiBlob(`${plant ? `/plants/${plant.slug}/lulo/report` : '/budget-estimates/report'}?kind=${reportKind}&format=${format}`, { method: 'POST', ...jsonBody(input) }), onSuccess: (blob, format) => download(blob, `${doc?.code ?? 'FUR-estimacion'}-${reportKind}.${format}`) })
  const anyError = error || [calculate.error, example.error, save.error, workflow.error, report.error].filter(Boolean).map(e => errorMessage(e!)).join(' · ')
  const pending = calculate.isPending || save.isPending || workflow.isPending || example.isPending
  const selectedLine = calculated?.result.lines.find(l => l.id === inspected)
  const selectedCatalogApu = calculated?.catalog.apus.find(a => a.id === selectedLine?.apuId)
  const demo = calculated?.catalog.demo || publications.data?.find(p => p.id === input.publicationId)?.demo
  const historical = publications.data?.find(p => p.id === input.publicationId)?.historical
  function reset() { const empty = newLuloInput(); setInput(empty); setCalculated(null); setTargetChapter(empty.chapters[0].id); setError(''); request.current = { key: '', id: crypto.randomUUID() } }

  return <div className="lulo-workspace">
    <section className="lulo-hero"><div><p className="lulo-eyebrow">PRESUPUESTOS LULO · ECOSISTEMA FUR</p><h1>{doc ? `${doc.code} · ${input.title}` : plant ? 'Un presupuesto para tu planta.' : 'Dale forma a tu próximo proyecto.'}</h1><p>{doc ? `Versión ${doc.version} · ${stateLabels[doc.status]} · ${plant?.name}` : 'Partidas, recursos y precios conectados. Construye tu estimación y lleva el mismo trabajo al presupuesto de tu planta.'}</p>
      <div className="lulo-hero-tags"><span><CheckCheck /> Cálculo por APU</span><span><FolderPlus /> Capítulos y subcapítulos</span><span><Download /> PDF y Excel</span></div></div>
      <div className="lulo-hero-actions">{plant && <Button asChild variant="outline"><Link to={`/plants/${plant.slug}/budgets`}><ArrowLeft /> Presupuestos de planta</Link></Button>}{!doc && <>{publications.data?.some(p => p.demo) && <Button variant="outline" disabled={pending} onClick={() => example.mutate()}><Sparkles /> Cargar ejemplo completo</Button>}<Button variant="ghost" disabled={pending} onClick={reset}>Empezar en blanco</Button></>}</div>
    </section>
    {demo && <div role="status" className="lulo-demo-banner"><strong>Demostración con datos ficticios.</strong> Las tarifas y el impuesto del ejemplo permiten comprobar el flujo; no representan precios comerciales.</div>}
    {historical && <div className="lulo-reference-note"><strong>Maestros originales con valores históricos.</strong> La moneda que elijas identifica este documento; no convierte ni actualiza los importes del MDB. Confirma precios propios para emitir el presupuesto.<label className="mt-3 flex items-center gap-2"><input type="checkbox" disabled={readonly} checked={!!input.referenceMode} onChange={e => update('referenceMode', e.target.checked)} /> Usar estos valores únicamente como referencia histórica preliminar</label></div>}
    {storageError && <p role="alert" className="lulo-alert">{storageError}</p>}{anyError && <div role="alert" className="lulo-alert">{anyError}</div>}
    <div className="lulo-metadata lulo-panel"><label className="lulo-label">Nombre del presupuesto<Input aria-label="Nombre del presupuesto" disabled={readonly} value={input.title} maxLength={200} onChange={e => update('title', e.target.value)} /></label><label className="lulo-label">Obra o proyecto<Input aria-label="Obra o proyecto" disabled={readonly} value={input.project} maxLength={200} placeholder="Ej.: Mantenimiento de molienda" onChange={e => update('project', e.target.value)} /></label><label className="lulo-label">Cliente o responsable<Input aria-label="Cliente o responsable" disabled={readonly} value={input.client} maxLength={200} placeholder="Nombre de referencia" onChange={e => update('client', e.target.value)} /></label></div>
    {plant && <BudgetContext slug={plant.slug} input={input} disabled={readonly} onChange={patch => setInput(old => ({ ...old, ...patch }))} />}
    {doc?.status === 'ISSUED' && plant && canApprove && <Button asChild><Link to={`/plants/${plant.slug}/budgets?tab=contracts&documentId=${doc.id}`}>Continuar con el contrato de esta obra <ArrowUpRight /></Link></Button>}
    <div className="lulo-grid">
      <LuloCatalogPanel input={input} plantSlug={plant?.slug} publications={publications.data ?? []} disabled={readonly} publicationLocked={!!doc} onSelect={id => void choosePublication(id)} onAdd={addApu} onManual={addManual} />
      <div className="lulo-main-column space-y-5">
        <section className="lulo-panel"><header><div><h2>Tu presupuesto</h2><p className="lulo-hint">{input.lines.length} partidas · {input.chapters.length} capítulos{publicMode ? ' · Guardado automático en este navegador' : ' · Precios conservados por versión'}</p></div><span className="lulo-currency">{input.currency}</span></header><div className="lulo-panel-body">
          <div className="lulo-chapter-tools"><label className="lulo-label">Agregar partidas a<select aria-label="Capítulo de destino" disabled={readonly} value={targetChapter} onChange={e => setTargetChapter(e.target.value)}>{input.chapters.map(c => <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>)}</select></label><label className="lulo-label">Nuevo capítulo<Input aria-label="Nombre del nuevo capítulo" disabled={readonly} placeholder="Nombre del capítulo" value={chapterName} onChange={e => setChapterName(e.target.value)} /></label><label className="lulo-label">Depende de<select aria-label="Capítulo padre" disabled={readonly} value={parentChapter} onChange={e => setParentChapter(e.target.value)}><option value="">Capítulo principal</option>{input.chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Button variant="outline" disabled={readonly || !chapterName.trim() || input.chapters.length >= 100} onClick={() => { const id = crypto.randomUUID(); update('chapters', [...input.chapters, { id, name: chapterName.trim(), parentId: parentChapter || null }]); setTargetChapter(id); setChapterName('') }} aria-label="Agregar capítulo"><FolderPlus /></Button></div>
          <div className="lulo-chapters-summary">{input.chapters.map(c => <span key={c.id}>{c.parentId ? '↳ ' : ''}{c.name}{!readonly && input.chapters.length > 1 && !input.lines.some(l => l.chapterId === c.id) && !input.chapters.some(n => n.parentId === c.id) && <button aria-label={`Eliminar capítulo ${c.name}`} onClick={() => { update('chapters', input.chapters.filter(n => n.id !== c.id)); if (targetChapter === c.id) setTargetChapter(input.chapters.find(n => n.id !== c.id)!.id) }}>×</button>}</span>)}</div>
          {!input.lines.length ? <div className="lulo-empty"><Calculator /><h3>Empieza con una partida.</h3><p>Busca un APU de tus maestros en la biblioteca o agrega una partida con tus propios precios.</p><Button variant="outline" disabled={readonly} onClick={addManual}><Plus /> Agregar partida manual</Button></div> : <div className="lulo-lines">{input.lines.map((l, i) => {
            const priced = calculated?.result.lines.find(p => p.id === l.id)
            return <article className="lulo-estimate-line" key={l.id}><div className="lulo-line-heading"><span className="lulo-line-index">{String(i + 1).padStart(2, '0')}</span><Input aria-label={`Código de partida ${i + 1}`} value={l.code} disabled={readonly} onChange={e => line(l.id, { code: e.target.value })} /><select aria-label={`Modo de precio ${i + 1}`} value={l.mode} disabled={readonly} onChange={e => { const mode = e.target.value as typeof l.mode; line(l.id, { mode, ...(mode === 'MANUAL' ? { apuId: null } : {}), manualPrice: mode === 'CALCULATED' ? null : priced?.price ?? '0' }) }}><option value="CALCULATED" disabled={!l.apuId}>Calculado por APU</option><option value="ASSUMED" disabled={!l.apuId}>Precio asumido</option><option value="MANUAL">Precio manual</option></select><Button variant="ghost" size="icon-sm" disabled={readonly} aria-label={`Eliminar partida ${i + 1}`} onClick={() => { const remaining = input.lines.filter(n => n.id !== l.id); const keptIds = new Set(calculated?.catalog.apus.filter(a => remaining.some(n => n.apuId === a.id)).flatMap(a => a.components.map(c => c.resource.id)) ?? []); setInput(old => ({ ...old, lines: remaining, overrides: old.overrides.filter(o => keptIds.has(o.resourceId)) })) }}><Trash2 /></Button></div>
              <Textarea aria-label={`Descripción de partida ${i + 1}`} disabled={readonly} value={l.description} maxLength={2000} onChange={e => line(l.id, { description: e.target.value })} />
              <div className="lulo-line-fields"><label className="lulo-label">Capítulo<select aria-label={`Capítulo de partida ${i + 1}`} disabled={readonly} value={l.chapterId} onChange={e => line(l.id, { chapterId: e.target.value })}>{input.chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="lulo-label">Unidad<Input aria-label={`Unidad de partida ${i + 1}`} disabled={readonly || l.mode !== 'MANUAL'} value={l.unit} onChange={e => line(l.id, { unit: e.target.value })} /></label><label className="lulo-label">Cantidad<Input aria-label={`Cantidad de partida ${i + 1}`} inputMode="decimal" disabled={readonly} value={l.quantity} onChange={e => line(l.id, { quantity: e.target.value })} /></label><label className="lulo-label">Precio unitario{l.mode === 'CALCULATED' ? <strong className={!current ? 'text-muted-foreground' : ''}>{priced ? decimalText(priced.price) : 'Por calcular'}</strong> : <Input aria-label={`Precio de partida ${i + 1}`} inputMode="decimal" disabled={readonly} value={l.manualPrice ?? ''} onChange={e => line(l.id, { manualPrice: e.target.value })} />}</label><div className="lulo-line-amount"><span>Importe</span><strong>{priced ? decimalText(priced.amount) : '—'}</strong></div></div>
              <div className="lulo-line-footer"><label><input type="checkbox" disabled={readonly} checked={l.taxable} onChange={e => line(l.id, { taxable: e.target.checked })} /> Gravado</label>{l.apuId && priced?.apu && <button onClick={() => setInspected(inspected === l.id ? '' : l.id)}>Ver APU y mis precios <ArrowUpRight /></button>}</div>
              {l.mode !== 'CALCULATED' && <label className="lulo-label">Fuente o motivo del precio<Input aria-label={`Motivo del precio ${i + 1}`} disabled={readonly} value={l.reason} onChange={e => line(l.id, { reason: e.target.value })} placeholder="Indica la cotización o el criterio utilizado" /></label>}
              {!readonly && <label className="lulo-label mt-3">Pendiente por resolver (opcional)<Input aria-label={`Pendiente de partida ${i + 1}`} value={l.pendingReason ?? ''} onChange={e => line(l.id, { pendingReason: e.target.value })} placeholder="Ej.: falta cotización de un insumo" /></label>}
              {l.pendingReason && <p className="lulo-reference-note">Partida pendiente: se excluye de los importes provisionales hasta resolverla.</p>}
              {plant && <BudgetAsset slug={plant.slug} assetId={l.assetId} snapshot={l.assetSnapshot} disabled={readonly} onSelect={assetId => line(l.id, { assetId })} />}
            </article>
          })}</div>}
          <label className="lulo-label mt-5">Notas y alcance<Textarea aria-label="Notas del presupuesto" disabled={readonly} value={input.notes} maxLength={2000} onChange={e => update('notes', e.target.value)} /></label>
        </div></section>
        {selectedLine?.apu && <section className="lulo-panel"><header><h2>APU · {selectedLine.apu.code}</h2><Button variant="ghost" size="sm" onClick={() => setInspected('')}>Cerrar APU</Button></header><div className="lulo-panel-body space-y-4"><p className="lulo-hint">Rendimiento: {selectedLine.apu.yieldValue} · Base: {selectedLine.apu.yieldBasis} · {selectedLine.apu.methodNote}</p>{!current && <p className="lulo-hint">Este es el último desglose calculado. Actualiza el cálculo para reflejar los cambios.</p>}
          {selectedLine.apu.components.map((c, i) => { const r = selectedCatalogApu?.components[i].resource; const o = input.overrides.find(o => o.resourceId === c.resourceId); return <article key={`${c.resourceId}-${i}`} className="lulo-resource"><div><strong>{c.code} · {c.name}</strong><p>{decimalText(c.consumption)} {c.unit} × {decimalText(c.price)} = <strong>{decimalText(c.cost)}</strong>{c.privatePrice ? ' · Mi precio' : ''}</p></div>
            {!readonly && <Button variant="outline" size="sm" onClick={() => update('overrides', o ? input.overrides.filter(n => n.resourceId !== c.resourceId) : [...input.overrides, { resourceId: c.resourceId, amount: c.price, baseDate: new Date().toISOString().slice(0, 10), validUntil: new Date().toISOString().slice(0, 10), reason: '' }])}>{o ? 'Restaurar precio del catálogo' : 'Usar mi precio'}</Button>}
            {o && <div className="grid gap-3 sm:grid-cols-2">{[['amount', 'Mi precio'], ['baseDate', 'Fecha base'], ['validUntil', 'Vigente hasta'], ['reason', 'Motivo del ajuste']].map(([field, label]) => <label className="lulo-label" key={field}>{label}<Input aria-label={`${label} ${c.code}`} type={field === 'baseDate' || field === 'validUntil' ? 'date' : 'text'} disabled={readonly} value={o[field as keyof typeof o]} onChange={e => update('overrides', input.overrides.map(n => n.resourceId === c.resourceId ? { ...n, [field]: e.target.value } : n))} /></label>)}</div>}
            {r && <p className="lulo-hint">Precio del catálogo: {decimalText(r.amount)} {r.currency} / {r.unit} · Base {r.baseDate} · Vigente hasta {r.validUntil}</p>}
          </article> })}<div className="lulo-apu-breakdown">{Object.entries(selectedLine.apu.breakdown).map(([name, value]) => <span key={name}>{({ material: 'Materiales', equipment: 'Equipos', labor: 'Mano de obra', direct: 'Directo', overhead: 'Administración', utility: 'Utilidad', finance: 'Financiamiento' } as Record<string, string>)[name]}<strong>{decimalText(value)}</strong></span>)}</div>
        </div></section>}
        {doc && plant && doc.status === 'DRAFT' && canEdit && !dirty && doc.catalog.apus.length > 0 && <LuloRecalculatePanel doc={doc} slug={plant.slug} publications={publications.data ?? []} onSaved={saved} />}
        {doc && <details className="lulo-panel"><summary><History className="mr-2 inline size-4" />Historial y trazabilidad</summary><div className="lulo-panel-body space-y-3"><p className="lulo-hint break-all">Huella: {doc.contentHash}</p>{doc.predecessorId && <Link className="text-sm underline" to={`/plants/${plant!.slug}/budgets/lulo/${doc.predecessorId}`}>Ver versión de origen</Link>}{doc.history.map(h => <article key={h.id}><strong className="text-xs">{h.action} · {h.data.actorName} · {new Date(h.occurredAt).toLocaleString('es-VE')}</strong><p className="lulo-hint">{h.data.reason}</p></article>)}</div></details>}
      </div>
      <aside className="lulo-totals-column"><section className="lulo-panel lulo-totals"><header><Calculator className="size-4" /><h2>Resumen</h2></header><div className="lulo-panel-body space-y-4">
        <div className="lulo-rate-grid">{Object.entries(rateLabels).map(([field, label]) => <label className="lulo-label" key={field}>{label} (%)<Input aria-label={`${label} (%)`} inputMode="decimal" disabled={readonly} value={input.rates[field as keyof typeof input.rates]} onChange={e => update('rates', { ...input.rates, [field]: e.target.value })} /></label>)}</div>
        <details className="lulo-hint"><summary>Criterio de cálculo</summary><p className="mt-2">Administración sobre directo; utilidad sobre directo + administración; financiamiento sobre directo + administración + utilidad. FCAS afecta mano de obra. El impuesto grava las partidas seleccionadas.</p></details>
        <div className="grid grid-cols-2 gap-3"><label className="lulo-label">Moneda<Input aria-label="Moneda del presupuesto" disabled={readonly || !!input.publicationId && !historical || !!doc} value={input.currency} maxLength={3} onChange={e => update('currency', e.target.value.toUpperCase())} /></label><label className="lulo-label">Decimales<select aria-label="Decimales de moneda" disabled={readonly} value={input.precision} onChange={e => update('precision', Number(e.target.value))}>{[0, 1, 2, 3, 4].map(v => <option key={v} value={v}>{v}</option>)}</select></label></div>
        <dl className="lulo-total-values"><div><dt>Subtotal</dt><dd>{calculated ? decimalText(calculated.result.totals.subtotal) : '—'}</dd></div><div><dt>Base imponible</dt><dd>{calculated ? decimalText(calculated.result.totals.taxable) : '—'}</dd></div><div><dt>Impuesto</dt><dd>{calculated ? decimalText(calculated.result.totals.tax) : '—'}</dd></div><div className="lulo-grand-total"><dt>Total {input.currency}</dt><dd data-testid="lulo-total">{calculated ? decimalText(calculated.result.totals.total) : 'Por calcular'}</dd></div></dl>
        {!current && calculated && <p role="status" className="lulo-hint">Hay cambios por calcular. Los importes mostrados corresponden al último cálculo.</p>}
        {(doc?.warnings ?? calculated?.warnings ?? []).map(w => <p className="text-xs text-destructive" key={w}>{w}</p>)}
        {!readonly && <Button className="w-full" disabled={!input.lines.length || pending} onClick={() => calculate.mutate(input)}><Calculator /> {calculate.isPending ? 'Calculando…' : 'Calcular presupuesto'}</Button>}
        {doc && <label className="lulo-label">Motivo de la operación<Textarea aria-label="Motivo de operación" value={reason} onChange={e => setReason(e.target.value)} placeholder="Qué verificaste o modificaste" /></label>}
        {doc ? <div className="space-y-2">{doc.status === 'DRAFT' && canEdit && <><Button className="w-full" variant="outline" disabled={!dirty || pending || reason.trim().length < 8} onClick={() => save.mutate()}><Save /> Guardar cambios</Button><Button className="w-full" disabled={dirty || pending || reason.trim().length < 8} onClick={() => workflow.mutate('submit')}>Enviar a revisión</Button></>}{doc.status === 'IN_REVIEW' && canApprove && <><Button className="w-full" disabled={pending || reason.trim().length < 8} onClick={() => workflow.mutate('issue')}><FileCheck2 /> Emitir presupuesto</Button><Button className="w-full" variant="outline" disabled={pending || reason.trim().length < 8} onClick={() => workflow.mutate('return')}>Devolver para corrección</Button></>}{doc.status === 'ISSUED' && canEdit && <Button className="w-full" variant="outline" disabled={pending || reason.trim().length < 8} onClick={() => workflow.mutate('revisions')}>Crear nueva versión</Button>}</div>
          : plant ? <Button className="w-full" disabled={!input.lines.length || pending || !canEdit} onClick={() => save.mutate()}><Save /> Guardar presupuesto</Button> : auth.status !== 'authenticated' ? <Button asChild className="w-full" variant="outline"><Link to="/login" state={{ from: '/budgets' }} onClick={() => { try { writeLuloDraft(input) } catch { /* visible storage warning already shown */ } }}><Save /> Iniciar sesión para llevarlo a planta</Link></Button> : <div className="space-y-2"><label className="lulo-label">Guardar en planta<select aria-label="Planta de destino" value={destination} onChange={e => setDestination(e.target.value)}><option value="">Selecciona una planta</option>{destinations.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}</select></label><Button className="w-full" disabled={!destination || !input.lines.length || pending} onClick={() => save.mutate()}><Save /> Guardar en planta</Button>{!destinations.length && <p className="lulo-hint">Necesitas permiso de edición de presupuestos en una planta para guardar allí.</p>}</div>}
        <div className="lulo-export"><label className="lulo-label">Reporte<select aria-label="Tipo de reporte LULO" value={reportKind} onChange={e => setReportKind(e.target.value as typeof reportKind)}>{Object.entries(reportKinds).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={!current || dirty || report.isPending} onClick={() => report.mutate('pdf')}><Download /> PDF</Button><Button variant="outline" className="flex-1" disabled={!current || dirty || report.isPending} onClick={() => report.mutate('xlsx')}><Download /> Excel</Button></div></div>
        <p className="lulo-hint">{doc?.status === 'ISSUED' ? `Emitido ${doc.issuedAt ? new Date(doc.issuedAt).toLocaleDateString('es-VE') : ''}. Los cambios se realizan en una nueva versión.` : 'El documento es preliminar hasta su revisión y emisión en una planta.'}</p>
      </div></section></aside>
    </div>
  </div>
}
