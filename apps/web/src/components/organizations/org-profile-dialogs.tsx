import { toast } from 'sonner'
import { FieldsDialog, type Field, type FieldValues } from '@/components/base/fields-dialog'
import {
  useUpdateContractor,
  useUpdateProvider,
  type ContractorAvailability,
  type ContractorDetail,
  type OrgStatus,
  type ProviderDetail,
} from '@/features/organizations/use-organizations'
import { externalUrlOnly } from '@/lib/media'
import { CONTRACTOR_AVAILABILITY_LABELS, ORG_STATUS_LABELS, parseList } from '@/lib/organizations'

type Org = ProviderDetail | ContractorDetail

const nullable = (v: string | boolean | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Perfil editable por los miembros: ubicación, descripción, contacto y certificaciones (+ disponibilidad si es contratista). */
export function EditProfileDialog({ kind, org, onClose }: { kind: 'provider' | 'contractor'; org: Org; onClose: () => void }) {
  const updateProvider = useUpdateProvider(org.id)
  const updateContractor = useUpdateContractor(org.id)

  const fields: Field[] = [
    { name: 'city', label: 'Ciudad' },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'website', label: 'Sitio web', placeholder: 'https://…' },
    { name: 'contactEmail', label: 'Correo de contacto', help: 'Solo lo ven usuarios con sesión iniciada.' },
    { name: 'logoUrl', label: 'Logo (URL)', placeholder: 'https://…' },
    { name: 'certifications', label: 'Certificaciones', help: 'Separadas por comas.' },
    ...(kind === 'contractor'
      ? ([
          {
            name: 'availability',
            label: 'Disponibilidad',
            type: 'select',
            required: true,
            options: Object.entries(CONTRACTOR_AVAILABILITY_LABELS).map(([value, label]) => ({ value, label })),
          },
        ] satisfies Field[])
      : []),
  ]

  async function submit(v: FieldValues) {
    const common = {
      city: nullable(v.city),
      description: nullable(v.description),
      website: nullable(v.website),
      contactEmail: nullable(v.contactEmail),
      // Un logo subido no se toca desde aquí: solo se envía la URL si el usuario la cambió.
      ...(String(v.logoUrl ?? '').trim() !== externalUrlOnly(org.logoUrl) && { logoUrl: nullable(v.logoUrl) }),
      certifications: parseList(String(v.certifications ?? '')),
    }
    if (kind === 'provider') await updateProvider.mutateAsync(common)
    else await updateContractor.mutateAsync({ ...common, availability: v.availability as ContractorAvailability })
    toast.success('Perfil actualizado')
  }

  return (
    <FieldsDialog
      title="Editar perfil"
      fields={fields}
      initial={{
        city: org.city ?? '',
        description: org.description ?? '',
        website: org.website ?? '',
        contactEmail: org.contactEmail ?? '',
        logoUrl: externalUrlOnly(org.logoUrl),
        certifications: org.certifications.join(', '),
        ...('availability' in org ? { availability: org.availability } : {}),
      }}
      submitLabel="Guardar cambios"
      onClose={onClose}
      onSubmit={submit}
    />
  )
}

/** Solo administrador del ecosistema: aprobar, suspender, verificar y calificar. */
export function AdminControlsDialog({ kind, org, onClose }: { kind: 'provider' | 'contractor'; org: Org; onClose: () => void }) {
  const updateProvider = useUpdateProvider(org.id)
  const updateContractor = useUpdateContractor(org.id)

  async function submit(v: FieldValues) {
    const input = {
      status: v.status as OrgStatus,
      verified: v.verified === true,
      rating: typeof v.rating === 'string' && v.rating.trim() !== '' ? Number(v.rating) : null,
    }
    if (kind === 'provider') await updateProvider.mutateAsync(input)
    else await updateContractor.mutateAsync(input)
    toast.success('Organización actualizada')
  }

  return (
    <FieldsDialog
      title={`Administrar ${org.organizationName}`}
      description="Estos campos de confianza solo los cambia el administrador del ecosistema."
      fields={[
        { name: 'status', label: 'Estado', type: 'select', required: true, options: Object.entries(ORG_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
        { name: 'verified', label: 'Organización verificada', type: 'checkbox' },
        { name: 'rating', label: 'Rating (0 a 5)', type: 'number', min: 0, step: 0.1, help: 'Déjalo vacío si aún no tiene calificaciones.' },
      ]}
      initial={{ status: org.status, verified: org.verified, rating: org.rating === null ? '' : String(org.rating) }}
      submitLabel="Guardar"
      onClose={onClose}
      onSubmit={submit}
    />
  )
}
