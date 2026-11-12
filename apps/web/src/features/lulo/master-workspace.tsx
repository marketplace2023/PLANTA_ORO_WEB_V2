import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PlantSummary } from '@/features/plant/plant-context'
import { LuloMasterLibrary, inputFromMaster } from './master-library'
import { LuloEditor } from './lulo-editor'
import type { LuloInput } from './types'
import { LuloPriceBooks } from './master-tools'
import { LuloReferenceMasters } from './reference-masters'

export function LuloMasterWorkspace({ plant, canEdit = false }: { plant?: PlantSummary; canEdit?: boolean }) {
  const [mode, setMode] = useState<'masters' | 'estimate' | 'prices' | 'references'>('masters')
  const [initial, setInitial] = useState<LuloInput | undefined>()
  const [opened, setOpened] = useState(false); const [revision, setRevision] = useState(0)
  return <div className="space-y-5"><div className="flex flex-wrap items-center gap-2"><Button variant={mode === 'masters' ? 'default' : 'outline'} onClick={() => setMode('masters')}>Consultar maestros LULO</Button><Button variant={mode === 'estimate' ? 'default' : 'outline'} onClick={() => { setOpened(true); setMode('estimate') }}>{plant ? 'Preparar presupuesto' : 'Preparar estimación'}</Button>{plant && <><Button variant={mode === 'prices' ? 'default' : 'outline'} onClick={() => setMode('prices')}>Listas y precios vigentes</Button><Button variant={mode === 'references' ? 'default' : 'outline'} onClick={() => setMode('references')}>Unidades y proveedores</Button></>}</div><div hidden={mode !== 'masters'}><LuloMasterLibrary plantSlug={plant?.slug} canEdit={canEdit} onUse={!plant || canEdit ? (item, calculated) => { setInitial(inputFromMaster(item, calculated)); setRevision(r => r + 1); setOpened(true); setMode('estimate') } : undefined} /></div>{opened && <div hidden={mode !== 'estimate'}><LuloEditor key={revision} initialInput={initial} plant={plant} canEdit={!plant || canEdit} /></div>}{mode === 'prices' && plant && <LuloPriceBooks slug={plant.slug} canEdit={canEdit} />}{mode === 'references' && plant && <LuloReferenceMasters slug={plant.slug} canEdit={canEdit} />}</div>
}
