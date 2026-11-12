import { Activity, ArrowUpRight, BookOpen, Building2, FileText, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAssetFur, type AssetItem } from '@/features/assets/use-assets'
import { GeoPanel } from './geo-panel'

/** Contexto real del activo; la API todavía no suministra series de sensores. */
export function AssetContext({ slug, asset }: { slug: string; asset: AssetItem | undefined }) {
  const { data, isLoading, isError, refetch } = useAssetFur(slug, asset?.id)
  if (!asset) return null
  const base = `/plants/${slug}`
  const readings = Object.entries(data?.telemetry ?? {}).filter((entry): entry is [string, string | number] =>
    typeof entry[1] === 'string' || (typeof entry[1] === 'number' && Number.isFinite(entry[1])))

  return <div className="asset-context">
    <GeoPanel title="Sensores del activo" icon={Activity}>
      {isLoading ? <p>Cargando información del activo…</p> : isError ? <button type="button" onClick={() => void refetch()}>No se pudo cargar. Reintentar</button> : readings.length ?
        <dl className="asset-context-readings">{readings.map(([name, value]) => <div key={name}><dt>{name.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl> :
        <p>Sin lecturas de sensores disponibles para este activo.</p>}
    </GeoPanel>
    <div className="asset-context-columns">
      <GeoPanel title="Documentos relacionados" icon={FileText}>
        {isLoading ? <p>Cargando documentos…</p> : isError ? <p>No se pudieron cargar los documentos.</p> : data?.documents.length ?
          <ul>{data.documents.slice(0, 4).map((document) => <li key={document.id}><FileText aria-hidden /><span><strong><Link to={`${base}/documents?doc=${encodeURIComponent(document.id)}&assetId=${encodeURIComponent(asset.id)}`}>{document.title}</Link></strong><small>{document.documentType} · v{document.currentVersion}</small></span></li>)}</ul> :
          <p>Sin documentos vinculados.</p>}
        <Link to={`${base}/documents?assetId=${encodeURIComponent(asset.id)}`}>Ver documentos <ArrowUpRight aria-hidden /></Link>
      </GeoPanel>
      <GeoPanel title="Mantenimiento" icon={Wrench}>
        {isLoading ? <p>Cargando mantenimiento…</p> : isError ? <p>No se pudo cargar el mantenimiento.</p> : data?.maintenance.openWorkOrders === undefined ? <p>Información no disponible para tu perfil.</p> :
          <dl className="asset-context-readings"><div><dt>Órdenes abiertas</dt><dd>{data.maintenance.openWorkOrders}</dd></div><div><dt>Vencidas</dt><dd>{data.maintenance.overdueWorkOrders ?? '—'}</dd></div></dl>}
        <Link to={`${base}/maintenance?tab=orders&assetId=${encodeURIComponent(asset.id)}`}>Ver mantenimiento <ArrowUpRight aria-hidden /></Link>
      </GeoPanel>
    </div>
    <div className="asset-context-links">
      <Link to={`/marketplace?view=sellers&family=${encodeURIComponent(asset.family.code)}`}><Building2 aria-hidden /><span>Explorar vendedores<small>Familia: {asset.family.name}</small></span><ArrowUpRight aria-hidden /></Link>
      <Link to="/courses"><BookOpen aria-hidden /><span>Explorar cursos<small>Catálogo de formación</small></span><ArrowUpRight aria-hidden /></Link>
    </div>
  </div>
}
