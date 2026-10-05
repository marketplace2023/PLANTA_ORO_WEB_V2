import { Activity, BookOpen, Building2, Cable, Cog, Factory, Package, Plug, ScrollText, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState } from '@/components/base/error-state'
import { AlertList } from '@/components/dashboard/alert-list'
import { KpiCard } from '@/components/industrial/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useEcosystemDashboard, type EcosystemDashboard } from '@/features/dashboard/use-dashboard'
import { ecosystemAlerts } from '@/lib/alerts'
import { formatDateTime } from '@/lib/format'
import { VISIBILITY_LABELS } from '@/lib/roles'

const STATUS_LABELS: Record<string, string> = { ACTIVE: 'activas', INACTIVE: 'inactivas', ARCHIVED: 'archivadas' }

function Content({ d }: { d: EcosystemDashboard }) {
  const visibility = (Object.keys(VISIBILITY_LABELS) as Array<keyof typeof VISIBILITY_LABELS>).map((k) => `${d.plants.byVisibility[k] ?? 0} ${VISIBILITY_LABELS[k].toLowerCase()}`).join(' · ')
  const plantStatus = Object.entries(d.plants.byStatus).map(([k, n]) => `${n} ${STATUS_LABELS[k] ?? k.toLowerCase()}`).join(' · ')
  const dbDown = d.health.database === 'down'

  return (
    <div className="space-y-8">
      <section aria-labelledby="eco-alerts">
        <h2 id="eco-alerts" className="mb-3 text-xl text-fur-navy-900">
          Alertas
        </h2>
        <AlertList alerts={ecosystemAlerts(d)} />
      </section>

      <section aria-labelledby="eco-kpis">
        <h2 id="eco-kpis" className="mb-3 text-xl text-fur-navy-900">
          Ecosistema
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Link to="/plants" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <KpiCard title="Plantas" value={d.plants.total} icon={Factory} hint={`${plantStatus} — ${visibility}`} />
          </Link>
          <KpiCard title="Usuarios" value={d.users.total} icon={Users} hint={`${d.users.activeLast30Days} con sesión en 30 días · ${d.users.globalAdmins} administradores del ecosistema`} />
          <KpiCard title="Roles y permisos" value={d.access.roles} icon={ShieldCheck} hint={`${d.access.permissions} permisos · ${d.access.assignments} asignaciones a plantas`} />
          <Link to="/catalog" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <KpiCard title="Catálogo de activos (modelos)" value={d.catalog.models} icon={Package} hint={`${d.catalog.families} familias · ${d.catalog.types} tipos · ${d.catalog.manufacturers} fabricantes`} />
          </Link>
          <KpiCard title="Etapas maestras" value={d.masters.stages} icon={Cog} />
          <KpiCard title="Redes maestras" value={d.masters.networks} icon={Cable} />
          <Link to="/providers" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <KpiCard
              title="Proveedores"
              value={d.organizations.providers.total}
              icon={Building2}
              tone={d.organizations.providers.pending > 0 ? 'warning' : 'default'}
              hint={`${d.organizations.providers.pending} pendientes de aprobación`}
            />
          </Link>
          <Link to="/professionals" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <KpiCard
              title="Contratistas"
              value={d.organizations.contractors.total}
              icon={Building2}
              tone={d.organizations.contractors.pending > 0 ? 'warning' : 'default'}
              hint={`${d.organizations.contractors.pending} pendientes de aprobación`}
            />
          </Link>
          <Link to="/courses" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <KpiCard title="Cursos publicados" value={d.courses.published} icon={BookOpen} />
          </Link>
          <KpiCard title="Auditoría (24 h)" value={d.audit.last24Hours} icon={ScrollText} hint={`${d.audit.last7Days} en 7 días`} />
          <KpiCard
            title="Salud del sistema"
            value={dbDown ? 'Base de datos caída' : 'Operativo'}
            icon={Activity}
            tone={dbDown ? 'danger' : 'default'}
            hint={dbDown ? 'La base de datos no responde' : `Base de datos: ${d.health.latencyMs} ms`}
          />
          <KpiCard title="Integraciones" value={d.integrations} icon={Plug} hint="Aún no hay integraciones externas" />
        </div>
      </section>

      <section aria-labelledby="eco-audit">
        <h2 id="eco-audit" className="mb-3 text-xl text-fur-navy-900">
          Actividad reciente (7 días)
        </h2>
        {d.audit.recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-fur-gray-600">No hay actividad registrada en los últimos 7 días.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.audit.recent.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(e.occurredAt)}</TableCell>
                    <TableCell>{e.actor ?? 'Sistema / anónimo'}</TableCell>
                    <TableCell className="fur-code">{e.module}</TableCell>
                    <TableCell>{e.entityType}</TableCell>
                    <TableCell className="fur-code">{e.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

/** Dashboard del Administrador del Ecosistema (arquitectura §35.1). */
export function EcosystemView() {
  const { data, isLoading, isError, refetch } = useEcosystemDashboard(true)
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cargando indicadores">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }
  return <Content d={data} />
}
