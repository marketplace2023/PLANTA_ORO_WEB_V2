import { ImageIcon, Pencil, Plus, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog, type Field, type FieldValues } from '@/components/base/fields-dialog'
import { ModelImagePicker, type ImageChange } from '@/components/catalog/model-image-picker'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCatalogFamilies, useCatalogManufacturers, useCatalogModels, type CatalogFamily, type CatalogManufacturer, type CatalogModel } from '@/features/assets/use-assets'
import {
  useCatalogTypes,
  useCreateFamily,
  useCreateManufacturer,
  useCreateModel,
  useCreateType,
  useRemoveModelImage,
  useUpdateFamily,
  useUpdateManufacturer,
  useUpdateModel,
  useUpdateType,
  useUploadModelImage,
  type CatalogType,
} from '@/features/catalog/use-catalog-admin'
import { useAuth } from '@/features/auth/auth-context'
import { apiUrl } from '@/lib/api'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const TABS = [
  ['families', 'Familias'],
  ['types', 'Tipos'],
  ['manufacturers', 'Fabricantes'],
  ['models', 'Modelos'],
] as const
type TabKey = (typeof TABS)[number][0]

const orNull = (v: string | boolean | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const orUndef = (v: string | boolean | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

function Loading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  )
}

function Section({ title, onCreate, children }: { title: string; onCreate: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={onCreate}>
          <Plus /> {title}
        </Button>
      </div>
      {children}
    </>
  )
}

// ---------- Familias ----------
function Families() {
  const families = useCatalogFamilies()
  const create = useCreateFamily()
  const update = useUpdateFamily()
  const [dialog, setDialog] = useState<{ item?: CatalogFamily } | null>(null)
  const fields = (editing: boolean): Field[] => [
    ...(editing ? [] : [{ name: 'code', label: 'Código', required: true, help: 'Mayúsculas, números y guion bajo. No se puede cambiar después.' }]),
    { name: 'name', label: 'Nombre', required: true },
    { name: 'icon', label: 'Ícono (Lucide)', placeholder: 'cog' },
    { name: 'description', label: 'Descripción', type: 'textarea' },
  ]
  return (
    <Section title="Nueva familia" onCreate={() => setDialog({})}>
      {families.isError ? <ErrorState onRetry={() => void families.refetch()} /> : families.isLoading ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Ícono</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {families.data!.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="fur-code">{f.code}</TableCell>
                  <TableCell>{f.name}</TableCell>
                  <TableCell className="text-fur-gray-600">{f.icon ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${f.name}`} onClick={() => setDialog({ item: f })}><Pencil /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dialog && (
        <FieldsDialog
          title={dialog.item ? `Editar ${dialog.item.name}` : 'Nueva familia'}
          fields={fields(!!dialog.item)}
          initial={dialog.item ? { name: dialog.item.name, icon: dialog.item.icon ?? '' } : {}}
          submitLabel={dialog.item ? 'Guardar cambios' : 'Crear familia'}
          onClose={() => setDialog(null)}
          onSubmit={(v: FieldValues) =>
            dialog.item
              ? update.mutateAsync({ id: dialog.item.id, name: String(v.name), icon: orNull(v.icon) })
              : create.mutateAsync({ code: String(v.code), name: String(v.name), icon: orUndef(v.icon), description: orUndef(v.description) })
          }
        />
      )}
    </Section>
  )
}

// ---------- Tipos ----------
function Types() {
  const types = useCatalogTypes()
  const families = useCatalogFamilies()
  const create = useCreateType()
  const update = useUpdateType()
  const [dialog, setDialog] = useState<{ item?: CatalogType } | null>(null)
  const familyOptions = (families.data ?? []).map((f) => ({ value: f.code, label: f.name }))
  return (
    <Section title="Nuevo tipo" onCreate={() => setDialog({})}>
      {types.isError ? <ErrorState onRetry={() => void types.refetch()} /> : types.isLoading ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Tipo</TableHead><TableHead>Familia</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {types.data!.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="fur-code">{t.code}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.familyName}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${t.name}`} onClick={() => setDialog({ item: t })}><Pencil /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dialog && (
        <FieldsDialog
          title={dialog.item ? `Editar ${dialog.item.name}` : 'Nuevo tipo'}
          fields={[
            ...(dialog.item ? [] : [{ name: 'code', label: 'Código', required: true } as Field]),
            { name: 'name', label: 'Nombre', required: true },
            { name: 'familyCode', label: 'Familia', type: 'select', required: true, options: familyOptions },
          ]}
          initial={dialog.item ? { name: dialog.item.name, familyCode: dialog.item.familyCode } : {}}
          submitLabel={dialog.item ? 'Guardar cambios' : 'Crear tipo'}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            dialog.item
              ? update.mutateAsync({ id: dialog.item.id, name: String(v.name), familyCode: String(v.familyCode) })
              : create.mutateAsync({ code: String(v.code), name: String(v.name), familyCode: String(v.familyCode) })
          }
        />
      )}
    </Section>
  )
}

// ---------- Fabricantes ----------
function Manufacturers() {
  const makers = useCatalogManufacturers()
  const create = useCreateManufacturer()
  const update = useUpdateManufacturer()
  const [dialog, setDialog] = useState<{ item?: CatalogManufacturer } | null>(null)
  const fields: Field[] = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'countryCode', label: 'País (código ISO de 2 letras)', placeholder: 'PE' },
    { name: 'website', label: 'Sitio web', placeholder: 'https://…' },
  ]
  return (
    <Section title="Nuevo fabricante" onCreate={() => setDialog({})}>
      {makers.isError ? <ErrorState onRetry={() => void makers.refetch()} /> : makers.isLoading ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Fabricante</TableHead><TableHead>País</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {makers.data!.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>{m.countryCode ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${m.name}`} onClick={() => setDialog({ item: m })}><Pencil /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dialog && (
        <FieldsDialog
          title={dialog.item ? `Editar ${dialog.item.name}` : 'Nuevo fabricante'}
          fields={fields}
          initial={dialog.item ? { name: dialog.item.name, countryCode: dialog.item.countryCode ?? '', website: '' } : {}}
          submitLabel={dialog.item ? 'Guardar cambios' : 'Crear fabricante'}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            dialog.item
              ? update.mutateAsync({ id: dialog.item.id, name: String(v.name), countryCode: orNull(v.countryCode), ...(orNull(v.website) !== null && { website: orNull(v.website) }) })
              : create.mutateAsync({ name: String(v.name), countryCode: orUndef(v.countryCode), website: orUndef(v.website) })
          }
        />
      )}
    </Section>
  )
}

// ---------- Modelos ----------
function Models() {
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 300)
  const models = useCatalogModels({ search: q || undefined, status: 'ALL' }, 50)
  const types = useCatalogTypes()
  const makers = useCatalogManufacturers()
  const create = useCreateModel()
  const update = useUpdateModel()
  const uploadImage = useUploadModelImage()
  const removeImage = useRemoveModelImage()
  const [image, setImage] = useState<ImageChange>({ file: null, remove: false })
  const [dialog, setDialog] = useState<{ item?: CatalogModel } | null>(null)
  const openDialog = (item?: CatalogModel) => { setImage({ file: null, remove: false }); setDialog({ item }) }
  const makerOptions = (makers.data ?? []).map((m) => ({ value: m.id, label: m.name }))

  return (
    <Section title="Nuevo modelo" onCreate={() => openDialog()}>
      <div className="mb-4 max-w-sm">
        <label htmlFor="model-search" className="text-xs text-fur-gray-600">Buscar</label>
        <Input id="model-search" type="search" className="h-10" placeholder="Modelo, tipo o fabricante…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {models.isError ? <ErrorState onRetry={() => void models.refetch()} /> : models.isLoading ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Foto</TableHead><TableHead>Modelo</TableHead><TableHead>Tipo</TableHead><TableHead>Fabricante</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {models.data!.items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className="grid size-12 place-items-center overflow-hidden rounded-md border border-border bg-white">
                      {m.imageUrl ? <img src={apiUrl(m.imageUrl)} alt={`Foto de ${m.modelName}`} loading="lazy" className="size-full object-contain" /> : <ImageIcon className="size-5 text-fur-gray-500" aria-label="Sin foto" />}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{m.modelName}</TableCell>
                  <TableCell>{m.type.name}</TableCell>
                  <TableCell>{m.manufacturer?.name ?? 'Genérico'}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-card font-medium text-foreground">{m.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${m.modelName}`} onClick={() => openDialog(m)}><Pencil /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {models.data!.total > models.data!.items.length && <p className="p-3 text-xs text-fur-gray-600">Mostrando {models.data!.items.length} de {models.data!.total}. Usa la búsqueda para acotar.</p>}
        </div>
      )}
      {dialog && (
        <FieldsDialog
          title={dialog.item ? `Editar ${dialog.item.modelName}` : 'Nuevo modelo'}
          description={dialog.item ? 'Desactivar un modelo lo oculta del catálogo sin afectar a los activos que ya lo usan.' : undefined}
          fields={[
            ...(dialog.item ? [] : [{ name: 'typeCode', label: 'Tipo', type: 'select', required: true, options: (types.data ?? []).map((t) => ({ value: t.code, label: `${t.familyName} · ${t.name}` })) } as Field]),
            { name: 'modelName', label: 'Modelo', required: true },
            { name: 'manufacturerId', label: 'Fabricante', type: 'select', options: makerOptions, emptyLabel: 'Sin fabricante (genérico)' },
            { name: 'specifications', label: 'Especificaciones (JSON)', type: 'json', help: 'Ej.: {"powerKw": 500, "poles": 6}' },
            ...(dialog.item ? [{ name: 'status', label: 'Estado', type: 'select', options: [{ value: 'ACTIVE', label: 'Activo' }, { value: 'INACTIVE', label: 'Inactivo' }] } as Field] : []),
          ]}
          initial={dialog.item ? { modelName: dialog.item.modelName, manufacturerId: dialog.item.manufacturer?.id ?? '', specifications: JSON.stringify(dialog.item.specifications, null, 2), status: dialog.item.status } : {}}
          submitLabel={dialog.item ? 'Guardar cambios' : 'Crear modelo'}
          onClose={() => setDialog(null)}
          extra={<ModelImagePicker currentUrl={dialog.item?.imageUrl ?? null} value={image} onChange={setImage} />}
          onSubmit={async (v) => {
            const specifications = JSON.parse(String(v.specifications || '{}'))
            const saved = dialog.item
              ? await update.mutateAsync({ id: dialog.item.id, modelName: String(v.modelName), manufacturerId: orNull(v.manufacturerId), specifications, status: v.status as 'ACTIVE' | 'INACTIVE' })
              : await create.mutateAsync({ typeCode: String(v.typeCode), modelName: String(v.modelName), manufacturerId: orUndef(v.manufacturerId), specifications })
            const id = dialog.item?.id ?? (saved as { id: string }).id
            // El modelo ya quedó guardado: si falla la foto se avisa, pero no se vuelve a pedir todo el formulario.
            try {
              if (image.file) await uploadImage.mutateAsync({ id, file: image.file })
              else if (image.remove) await removeImage.mutateAsync(id)
            } catch (err) {
              toast.error(`Modelo guardado, pero la foto no se pudo subir: ${err instanceof Error ? err.message : 'error desconocido'}`)
            }
          }}
        />
      )}
    </Section>
  )
}

/** Administración del catálogo maestro global. Solo el administrador del ecosistema. */
export function AdminCatalogPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'families') as TabKey

  if (!user?.isGlobalAdmin) {
    return (
      <>
        <PageHeader title="Administrar catálogo" />
        <EmptyState icon={ShieldAlert} title="Solo para administradores del ecosistema" description="El catálogo maestro es global; solo el administrador del ecosistema puede modificarlo." />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Administrar catálogo" description="Familias, tipos, fabricantes y modelos que usan todas las plantas." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {tab === 'families' && <Families />}
      {tab === 'types' && <Types />}
      {tab === 'manufacturers' && <Manufacturers />}
      {tab === 'models' && <Models />}
    </>
  )
}
