import { toast } from 'sonner'
import { FieldsDialog, type Field, type FieldValues } from '@/components/base/fields-dialog'
import { useCreateContractor, useCreateProvider } from '@/features/organizations/use-organizations'
import { countryOptions, parseList } from '@/lib/organizations'

const opt = (v: string | boolean | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Solicitud de registro de una empresa (proveedor o contratista): queda pendiente hasta que el administrador la apruebe. */
export function RegisterOrgDialog({ kind, onClose, onDone }: { kind: 'provider' | 'contractor'; onClose: () => void; onDone?: (id: string) => void }) {
  const createProvider = useCreateProvider()
  const createContractor = useCreateContractor()
  const label = kind === 'provider' ? 'proveedor' : 'contratista'

  const fields: Field[] = [
    { name: 'organizationName', label: 'Razón social', required: true },
    { name: 'taxId', label: 'Identificación tributaria', help: 'RUC / NIT / CUIT. Evita registros duplicados.' },
    { name: 'countryCode', label: 'País', type: 'select', required: true, options: countryOptions() },
    { name: 'city', label: 'Ciudad' },
    { name: 'description', label: 'Descripción', type: 'textarea', placeholder: kind === 'provider' ? 'Qué productos ofreces' : 'Qué servicios prestas' },
    { name: 'website', label: 'Sitio web', placeholder: 'https://…' },
    { name: 'contactEmail', label: 'Correo de contacto', help: 'Solo lo ven usuarios con sesión iniciada.' },
    { name: 'certifications', label: 'Certificaciones', placeholder: 'ISO 9001, OSHA 30', help: 'Separadas por comas.' },
  ]

  async function submit(v: FieldValues) {
    const input = {
      organizationName: String(v.organizationName).trim(),
      taxId: opt(v.taxId),
      countryCode: String(v.countryCode),
      city: opt(v.city),
      description: opt(v.description),
      website: opt(v.website),
      contactEmail: opt(v.contactEmail),
      certifications: parseList(String(v.certifications ?? '')),
    }
    const created = kind === 'provider' ? await createProvider.mutateAsync(input) : await createContractor.mutateAsync(input)
    toast.success(created.status === 'ACTIVE' ? `${label} creado` : `Solicitud enviada: el administrador revisará tu ${label}.`)
    onDone?.(created.id)
  }

  return (
    <FieldsDialog
      title={kind === 'provider' ? 'Registrar mi empresa como proveedor' : 'Registrar mi empresa como contratista'}
      description="Tu solicitud queda pendiente hasta que el administrador del ecosistema la apruebe y verifique."
      fields={fields}
      initial={{ countryCode: 'PE' }}
      submitLabel="Enviar solicitud"
      onClose={onClose}
      onSubmit={submit}
    />
  )
}
