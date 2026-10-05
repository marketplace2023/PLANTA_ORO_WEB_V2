import { ShieldAlert } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { MembersTab } from '@/components/plant-admin/members-tab'
import { NetworksTab } from '@/components/plant-admin/networks-tab'
import { StagesTab } from '@/components/plant-admin/stages-tab'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlant } from '@/features/plant/plant-context'
import { usePlantOutlet } from './plant-route'

type TabKey = 'members' | 'stages' | 'networks'

/** Administración de la planta (onboarding, design.md §61): miembros, etapas y redes habilitadas. */
export function PlantAdminPage() {
  const plant = usePlantOutlet()
  const { permissions } = usePlant()
  const [params, setParams] = useSearchParams()

  // Cada pestaña existe solo para quien puede usarla; la lectura de miembros requiere user.read.
  const canConfigure = permissions.includes('plant.configure')
  const available: Array<[TabKey, string]> = [
    ...(permissions.includes('user.read') ? ([['members', 'Miembros']] as Array<[TabKey, string]>) : []),
    ...(canConfigure ? ([['stages', 'Etapas'], ['networks', 'Redes']] as Array<[TabKey, string]>) : []),
  ]

  if (available.length === 0) {
    return (
      <>
        <PageHeader title="Administrar planta" />
        <EmptyState icon={ShieldAlert} title="Sin acceso a la administración" description="Solo los administradores de la planta pueden gestionar miembros, etapas y redes." />
      </>
    )
  }

  const requested = params.get('tab') as TabKey | null
  const tab = available.find(([k]) => k === requested)?.[0] ?? available[0][0]

  return (
    <>
      <PageHeader title="Administrar planta" description="Quién trabaja en la planta y qué etapas y redes transversales utiliza." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            {available.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {tab === 'members' && <MembersTab slug={plant.slug} />}
      {tab === 'stages' && <StagesTab slug={plant.slug} />}
      {tab === 'networks' && <NetworksTab slug={plant.slug} />}
    </>
  )
}
