import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, Calculator, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/base/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlant } from '@/features/plant/plant-context'
import { LuloEditor } from '@/features/lulo/lulo-editor'
import { LuloMasterWorkspace } from '@/features/lulo/master-workspace'
import { LuloContractWorkspace } from '@/features/lulo/contract-workspace'
import { decimalText, stateLabels, type LuloDocument } from '@/features/lulo/types'
import { api } from '@/lib/api'
import { usePlantOutlet } from './plant-route'
import '@/styles/lulo-workspace.css'

export function LuloPublicPage() { return <LuloMasterWorkspace /> }
export function LuloPlantContractPage() {
  const plant = usePlantOutlet(); const { permissions } = usePlant(); const { contractId } = useParams()
  return permissions.includes('budget.read') && contractId ? <LuloContractWorkspace slug={plant.slug} contractId={contractId} canEdit={permissions.includes('budget.edit')} canApprove={permissions.includes('budget.approve')} canUpload={permissions.includes('document.upload')} /> : <p role="alert">No tienes acceso a los contratos de esta planta.</p>
}

export function LuloPlantNewPage() {
  const plant = usePlantOutlet(); const { permissions } = usePlant()
  return permissions.includes('budget.edit') ? <LuloEditor plant={plant} /> : <p role="alert">Necesitas permiso para crear presupuestos en esta planta.</p>
}

export function LuloPlantDocumentPage() {
  const plant = usePlantOutlet(); const { permissions } = usePlant(); const { luloId } = useParams()
  const doc = useQuery({ queryKey: ['lulo', 'document', plant.slug, luloId], queryFn: () => api<LuloDocument>(`/plants/${plant.slug}/lulo/documents/${luloId}`), enabled: permissions.includes('budget.read') && !!luloId })
  if (!permissions.includes('budget.read')) return <p role="alert">No tienes acceso a los presupuestos de esta planta.</p>
  if (doc.isLoading) return <Skeleton className="h-96" />
  if (doc.isError) return <ErrorState onRetry={() => void doc.refetch()} />
  return doc.data && <LuloEditor key={`${doc.data.id}:${doc.data.revision}`} doc={doc.data} plant={plant} canEdit={permissions.includes('budget.edit')} canApprove={permissions.includes('budget.approve')} />
}

export function LuloPlantOverview() {
  const plant = usePlantOutlet(); const { permissions } = usePlant()
  const [term, setTerm] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1)
  const list = useQuery({ queryKey: ['lulo', 'documents', plant.slug, page, search], queryFn: () => api<{ items: { id: string; code: string; title: string; status: keyof typeof stateLabels; version: number; total: string; currency: string; demo: boolean; createdAt: string }[]; total: number }>(`/plants/${plant.slug}/lulo/documents?${new URLSearchParams({ page: String(page), search })}`) })
  return <div className="lulo-workspace space-y-5"><section className="lulo-hero"><div><p className="lulo-eyebrow">BIBLIOTECA COMÚN · PRESUPUESTOS DE {plant.name}</p><h2 className="text-3xl font-semibold">Del alcance al presupuesto emitido.</h2><p>Precios guardados por versión, ajustes propios de planta y un expediente que conserva cada emisión.</p></div><div className="lulo-hero-actions">{permissions.includes('budget.edit') && <Button asChild><Link to={`/plants/${plant.slug}/budgets/new`}><Plus /> Nuevo presupuesto LULO</Link></Button>}<Button asChild variant="outline"><Link to="/budgets">Traer una estimación pública <ArrowUpRight /></Link></Button></div></section>
    <section className="lulo-panel"><header><h2>Presupuestos LULO</h2><form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(term); setPage(1) }}><Input aria-label="Buscar presupuestos LULO" placeholder="Nombre del presupuesto" value={term} onChange={e => setTerm(e.target.value)} /><Button size="icon" variant="outline" aria-label="Buscar presupuestos"><Search /></Button></form></header><div className="lulo-panel-body">
      {list.isLoading ? <Skeleton className="h-64" /> : list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : !list.data?.items.length ? <div className="lulo-empty"><Calculator /><h3>El próximo presupuesto empieza aquí.</h3><p>Crea uno con capítulos y APU, o adopta una estimación que hayas preparado desde el home.</p>{permissions.includes('budget.edit') && <Button asChild><Link to={`/plants/${plant.slug}/budgets/new`}>Crear mi primer presupuesto</Link></Button>}</div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Presupuesto</th><th className="p-3">Versión</th><th className="p-3">Estado</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{list.data.items.map(d => <tr key={d.id} className="border-b border-border"><td className="p-3"><Link className="font-semibold underline underline-offset-4" to={`/plants/${plant.slug}/budgets/lulo/${d.id}`}>{d.title}</Link><small className="mt-1 block text-muted-foreground">{d.code}{d.demo ? ' · DEMOSTRACIÓN' : ''}</small></td><td className="p-3">v{d.version}</td><td className="p-3">{stateLabels[d.status]}</td><td className="p-3 text-right font-semibold tabular-nums">{d.currency} {decimalText(d.total)}</td></tr>)}</tbody></table></div>}
      <nav aria-label="Páginas de presupuestos" className="mt-4 flex items-center justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-xs text-muted-foreground">Página {page}</span><Button variant="outline" disabled={page * 20 >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Siguiente</Button></nav>
    </div></section>
  </div>
}
