import { formatMoney } from './format'

export const AVAILABILITY_LABELS = { IN_STOCK: 'En stock', ON_REQUEST: 'Bajo pedido', OUT_OF_STOCK: 'Agotado' } as const
export const CONTRACTOR_AVAILABILITY_LABELS = { AVAILABLE: 'Disponible', LIMITED: 'Disponibilidad limitada', UNAVAILABLE: 'No disponible' } as const
export const ORG_STATUS_LABELS = { PENDING: 'Pendiente de aprobación', ACTIVE: 'Activa', SUSPENDED: 'Suspendida' } as const
export const LISTING_STATUS_LABELS = { DRAFT: 'Borrador', ACTIVE: 'Publicado', ARCHIVED: 'Archivado' } as const

export const availabilityLabel = (a: string) => AVAILABILITY_LABELS[a as keyof typeof AVAILABILITY_LABELS] ?? a
export const contractorAvailabilityLabel = (a: string) => CONTRACTOR_AVAILABILITY_LABELS[a as keyof typeof CONTRACTOR_AVAILABILITY_LABELS] ?? a

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['es'], { type: 'region' }) : null

/** "PE" → "Perú". Si el navegador no conoce el código, se muestra tal cual. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  try {
    return regionNames?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** "4.7" o "Sin calificaciones": nunca se inventa un rating. */
export const ratingText = (rating: number | null) => (rating === null ? 'Sin calificaciones' : `${rating.toFixed(1)} / 5`)

/** Las etiquetas de especialidad llegan normalizadas (MECANICA): se muestran en formato legible. */
export function specialtyLabel(type: string): string {
  const lower = type.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Dinero con código delante ("USD 1,720.50") o "A cotizar" cuando no hay precio publicado. */
export const priceText = (price: number | null, currency: string) => (price === null ? 'A cotizar' : formatMoney(price, currency))

/** Países frecuentes del sector minero; el servidor acepta cualquier código ISO de 2 letras. */
export const COUNTRY_CODES = ['PE', 'CL', 'AR', 'BO', 'BR', 'CO', 'EC', 'MX', 'PA', 'US', 'CA', 'AU', 'ZA', 'DE', 'ES', 'FI', 'DK', 'CH', 'GB', 'FR'] as const
export const countryOptions = () => COUNTRY_CODES.map((c) => ({ value: c, label: `${countryName(c)} (${c})` }))

export const RATING_MIN_OPTIONS = [
  { value: '3', label: '3.0 o más' },
  { value: '4', label: '4.0 o más' },
  { value: '4.5', label: '4.5 o más' },
]

/** "ISO 9001, OSHA" → ["ISO 9001", "OSHA"] (sin vacíos ni repetidos). */
export const parseList = (text: string) => [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))]
