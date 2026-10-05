import { AlertTriangle, ArrowDown, ArrowUp, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAddChapter, useAddItem, useApus, useDeleteChapter, useDeleteItem, useUpdateChapter, useUpdateItem, type BudgetDetail, type BudgetItem } from '@/features/budget/use-budget'
import { ApiError } from '@/lib/api'
import { formatMoney, formatQuantity, formatUnitPrice } from '@/lib/format'

const errorText = (err: unknown) => (err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo completar la acción')

/** Estructura del presupuesto: capítulos a la izquierda, partidas del capítulo elegido al centro. Solo editable en borrador. */
export function StructureView({ slug, budget, chapterId, onChapter }: { slug: string; budget: BudgetDetail; chapterId: string | undefined; onChapter: (id: string | undefined) => void }) {
  const draft = budget.status === 'DRAFT'
  const addChapter = useAddChapter(slug, budget.id)
  const updateChapter = useUpdateChapter(slug, budget.id)
  const deleteChapter = useDeleteChapter(slug, budget.id)
  const addItem = useAddItem(slug, budget.id)
  const updateItem = useUpdateItem(slug, budget.id)
  const deleteItem = useDeleteItem(slug, budget.id)
  const apus = useApus(slug, {}, 100, draft)
  const [dialog, setDialog] = useState<'chapter' | 'item' | null>(null)
  const [editing, setEditing] = useState<BudgetItem | null>(null)
  const c = budget.baseCurrency

  const selected = budget.chapters.find((ch) => ch.id === chapterId) ?? budget.chapters[0]
  const run = (action: () => Promise<unknown>, ok: string) => action().then(() => toast.success(ok), (e) => toast.error(errorText(e)))
  const apuOptions = (apus.data?.items ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name} (${a.unit}${a.unitPrice === null ? '' : `, ${formatUnitPrice(a.unitPrice, c)}`})` }))

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Capítulos" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-fur-navy-900">Capítulos</h3>
          {draft && (
            <PermissionGate permission="budget.edit">
              <Button size="sm" variant="secondary" onClick={() => setDialog('chapter')}>
                <FolderPlus /> Nuevo
              </Button>
            </PermissionGate>
          )}
        </div>
        {budget.chapters.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fur-gray-600">Aún no hay capítulos.</p>
        ) : (
          <ol className="divide-y divide-border rounded-lg border border-border bg-card">
            {budget.chapters.map((ch, i) => (
              <li key={ch.id} className={`flex items-start gap-1 p-2 ${selected?.id === ch.id ? 'bg-muted' : ''}`}>
                <button type="button" aria-current={selected?.id === ch.id ? 'true' : undefined} onClick={() => onChapter(ch.id)} className="min-w-0 flex-1 text-left text-sm">
                  <span className="fur-code mr-1.5">{ch.code}</span>
                  <span className={selected?.id === ch.id ? 'font-medium' : ''}>{ch.name}</span>
                  <span className="block text-xs text-fur-gray-600">{formatMoney(ch.subtotal, c)}</span>
                </button>
                {draft && (
                  <PermissionGate permission="budget.edit">
                    <Button size="icon" variant="ghost" aria-label={`Subir capítulo ${ch.code}`} disabled={i === 0} onClick={() => void run(() => updateChapter.mutateAsync({ chapterId: ch.id, position: i - 1 }), 'Capítulo movido')}>
                      <ArrowUp />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Bajar capítulo ${ch.code}`} disabled={i === budget.chapters.length - 1} onClick={() => void run(() => updateChapter.mutateAsync({ chapterId: ch.id, position: i + 1 }), 'Capítulo movido')}>
                      <ArrowDown />
                    </Button>
                  </PermissionGate>
                )}
              </li>
            ))}
          </ol>
        )}
      </nav>

      <section aria-labelledby="items-title" className="space-y-3">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="items-title" className="text-base font-semibold text-fur-navy-900">
                <span className="fur-code mr-1.5">{selected.code}</span> {selected.name}
              </h3>
              {draft && (
                <PermissionGate permission="budget.edit">
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setDialog('item')}>
                      <Plus /> Agregar partida
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Eliminar capítulo ${selected.code}`} onClick={() => void run(() => deleteChapter.mutateAsync(selected.id), 'Capítulo eliminado')}>
                      <Trash2 /> Eliminar capítulo
                    </Button>
                  </div>
                </PermissionGate>
              )}
            </div>
            {selected.items.length === 0 ? (
              <EmptyState icon={Plus} title="Este capítulo no tiene partidas" description="Agrega partidas eligiendo el APU que define su precio unitario." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partida</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Precio unitario</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      {draft && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="fur-code">{i.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{i.description}</div>
                          <Link to={`/plants/${slug}/budgets/apus/${i.apu.id}`} className="fur-code text-xs text-fur-gray-600 underline-offset-2 hover:underline">
                            {i.apu.code}
                          </Link>
                        </TableCell>
                        <TableCell>{i.unit}</TableCell>
                        <TableCell className="text-right">{formatQuantity(i.quantity)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {i.unitPrice === null ? (
                            <span className="inline-flex items-center gap-1 text-fur-red-500">
                              <AlertTriangle className="size-4" aria-hidden /> Sin precio ({i.missingRates.join(', ')})
                            </span>
                          ) : (
                            formatUnitPrice(i.unitPrice, c)
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatMoney(i.amount, c)}</TableCell>
                        {draft && (
                          <TableCell className="text-right whitespace-nowrap">
                            <PermissionGate permission="budget.edit">
                              <Button size="sm" variant="ghost" aria-label={`Editar partida ${i.code}`} onClick={() => setEditing(i)}>
                                <Pencil /> Editar
                              </Button>
                              <Button size="sm" variant="ghost" aria-label={`Eliminar partida ${i.code}`} disabled={deleteItem.isPending} onClick={() => void run(() => deleteItem.mutateAsync(i.id), 'Partida eliminada')}>
                                <Trash2 /> Eliminar
                              </Button>
                            </PermissionGate>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={FolderPlus} title="Empieza por un capítulo" description="Los capítulos agrupan las partidas (por ejemplo: Obras civiles, Montaje mecánico)." />
        )}
      </section>

      {dialog === 'chapter' && (
        <FieldsDialog
          title="Nuevo capítulo"
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: '01' },
            { name: 'name', label: 'Nombre', required: true },
          ]}
          submitLabel="Crear capítulo"
          onClose={() => setDialog(null)}
          onSubmit={(v) => addChapter.mutateAsync({ code: String(v.code).trim(), name: String(v.name).trim() })}
        />
      )}
      {dialog === 'item' && selected && (
        <FieldsDialog
          title={`Nueva partida en ${selected.code}`}
          description="El precio unitario sale del APU elegido; se congela al aprobar el presupuesto."
          fields={[
            { name: 'code', label: 'Código de la partida', required: true, placeholder: `${selected.code}.01` },
            { name: 'apuId', label: 'APU', type: 'select', required: true, options: apuOptions },
            { name: 'description', label: 'Descripción', help: 'Opcional: por defecto, el nombre del APU.' },
            { name: 'quantity', label: 'Cantidad', type: 'number', required: true, min: 0, step: 0.0001 },
          ]}
          submitLabel="Agregar partida"
          onClose={() => setDialog(null)}
          onSubmit={(v) => addItem.mutateAsync({ chapterId: selected.id, apuId: String(v.apuId), code: String(v.code).trim(), description: String(v.description ?? '').trim() || undefined, quantity: Number(v.quantity) })}
        />
      )}
      {editing && (
        <FieldsDialog
          title={`Editar partida ${editing.code}`}
          fields={[
            { name: 'description', label: 'Descripción', required: true },
            { name: 'quantity', label: 'Cantidad', type: 'number', required: true, min: 0, step: 0.0001 },
            { name: 'apuId', label: 'APU', type: 'select', required: true, options: apuOptions },
            { name: 'chapterId', label: 'Capítulo', type: 'select', required: true, options: budget.chapters.map((ch) => ({ value: ch.id, label: `${ch.code} — ${ch.name}` })) },
          ]}
          initial={{ description: editing.description, quantity: String(editing.quantity), apuId: editing.apu.id, chapterId: selected?.id ?? '' }}
          submitLabel="Guardar"
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateItem.mutateAsync({ itemId: editing.id, description: String(v.description).trim(), quantity: Number(v.quantity), apuId: String(v.apuId), chapterId: String(v.chapterId) })}
        />
      )}
    </div>
  )
}
