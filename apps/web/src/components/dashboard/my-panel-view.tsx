import { BookOpen, Briefcase, Building2, Factory, GraduationCap, Package, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PlantCard } from '@/components/industrial/plant-card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { usePlant } from '@/features/plant/plant-context'
import { ROLE_LABELS } from '@/lib/roles'

const SHORTCUTS = [
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/providers', label: 'Proveedores', icon: Building2 },
  { to: '/professionals', label: 'Servicios Profesionales', icon: Briefcase },
  { to: '/courses', label: 'Cursos (LMS)', icon: BookOpen },
  { to: '/catalog', label: 'Catálogo', icon: Package },
] as const

/** Dashboard del usuario común (arquitectura §35.8): solo lectura, plantas visibles y accesos públicos. */
export function MyPanelView() {
  const { availablePlants, isLoadingPlants, plantsError, reloadPlants } = usePlant()
  const { user, access } = useAuth()
  const rolesIn = (plantId: string) => access.find((a) => a.plantId === plantId)?.roles ?? []

  return (
    <div className="space-y-8">
      <section aria-labelledby="my-plants">
        <h2 id="my-plants" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
          <Factory className="size-5" /> Plantas visibles
        </h2>
        {isLoadingPlants ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : plantsError ? (
          <ErrorState onRetry={() => reloadPlants?.()} />
        ) : availablePlants.length === 0 ? (
          <EmptyState icon={Factory} title="No hay plantas visibles" description={user ? 'Un administrador puede asignarte a una planta.' : 'Inicia sesión para ver más plantas.'} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {availablePlants.map((p) => (
              <div key={p.id} className="space-y-2">
                <PlantCard plant={p} />
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-fur-gray-600">
                  Tu rol:
                  {rolesIn(p.id).length === 0 ? <span>solo lectura</span> : rolesIn(p.id).map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r] ?? r}</Badge>)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="my-links">
        <h2 id="my-links" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
          <GraduationCap className="size-5" /> Explorar el ecosistema
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SHORTCUTS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex h-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                <Icon className="size-5 shrink-0 text-fur-navy-800" aria-hidden /> {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
