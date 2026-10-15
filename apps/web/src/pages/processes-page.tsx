import { Spline } from 'lucide-react'
import { useState } from 'react'
import { PermissionGate } from '@/components/base/permission-gate'
import { AssetsGeoportal } from '@/components/geoportal/assets-geoportal'
import { ConnectionsDialog } from '@/components/process/connections-dialog'
import { Button } from '@/components/ui/button'
import { usePlantProcess } from '@/features/process/use-process'
import { usePlantOutlet } from './plant-route'

/**
 * Procesos (design.md §30): la misma vista del geoportal de Activos Físicos, pero solo con la red de Procesos y sus
 * etapas; las demás redes transversales se muestran bloqueadas. Las conexiones del flujo se editan desde aquí.
 */
export function ProcessesPage() {
  const plant = usePlantOutlet()
  const overview = usePlantProcess(plant.slug)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <AssetsGeoportal
        mode="process"
        plant={plant}
        actions={
          <PermissionGate permission="plant.configure">
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={!overview.data || overview.data.stages.length < 2}>
              <Spline /> Editar conexiones
            </Button>
          </PermissionGate>
        }
      />
      {editing && overview.data && <ConnectionsDialog slug={plant.slug} overview={overview.data} onClose={() => setEditing(false)} />}
    </>
  )
}
