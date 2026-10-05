import { EcosystemView } from '@/components/dashboard/ecosystem-view'
import { MyPanelView } from '@/components/dashboard/my-panel-view'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'

/**
 * Dashboards del contexto "Ecosistema global" (sin planta elegida). El administrador del ecosistema ve la gestión
 * global (arquitectura §35.1); cualquier otra persona, su panel de solo lectura (§35.8). El tablero de una planta
 * vive en /plants/:slug/dashboard.
 */
export function DashboardsPage() {
  const { user, status } = useAuth()
  if (status === 'loading') return <Skeleton className="h-64" aria-busy="true" />

  const admin = !!user?.isGlobalAdmin
  return (
    <>
      <PageHeader
        title={admin ? 'Dashboard del ecosistema' : 'Mi panel'}
        description={admin ? 'Plantas, usuarios, accesos, catálogos, organizaciones, auditoría y salud del sistema.' : 'Tus plantas y accesos al resto del ecosistema (solo lectura).'}
      />
      {admin ? <EcosystemView /> : <MyPanelView />}
    </>
  )
}
