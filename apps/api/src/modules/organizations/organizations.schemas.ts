import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { AVAILABILITIES, AVAILABILITY_STATES, LISTING_STATUSES, MEMBER_ROLES, ORG_STATUSES } from '../../database/schema'

const csv = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string().min(1).max(60)).min(1).max(20))

const text = (max: number) => z.string().trim().min(1).max(max)
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_]{1,60}$/, 'Código inválido')
const country = z.string().trim().length(2, 'Código de país de 2 letras').transform((c) => c.toUpperCase())
/** Solo http(s): un enlace `javascript:` publicado en un perfil sería XSS contra quien lo abra. */
const url = z.url({ protocol: /^https?$/ })
const email = z.email().max(255)
const certifications = z.array(z.string().trim().min(1).max(80)).max(20)
/** Hasta 2 decimales: la columna es numeric(…,2). */
const decimal2 = z.number().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Máximo 2 decimales')
const stringBool = z.enum(['0', '1'])
const nonEmpty = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial().refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

// ----- Organizaciones (proveedores y contratistas comparten el perfil) -----
const profile = {
  countryCode: country,
  city: text(120),
  description: z.string().trim().max(4000),
  website: url,
  contactEmail: email,
  logoUrl: url,
  certifications,
}

export const createProviderSchema = z.object({
  organizationName: text(200),
  taxId: text(40).optional(),
  countryCode: profile.countryCode,
  city: profile.city.optional(),
  description: profile.description.optional(),
  website: profile.website.optional(),
  contactEmail: profile.contactEmail.optional(),
  logoUrl: profile.logoUrl.optional(),
  certifications: profile.certifications.default([]),
  stageCodes: z.array(code).max(20).default([]),
  familyCodes: z.array(code).max(30).default([]),
  /** Solo el administrador: asigna a esta persona como responsable (OWNER) de la organización. */
  ownerEmail: email.optional(),
})

export const updateProviderSchema = nonEmpty({
  // Los campos de identidad y confianza solo los cambia el administrador del ecosistema (se valida en el servicio).
  organizationName: text(200),
  taxId: text(40).nullable(),
  status: z.enum(ORG_STATUSES),
  verified: z.boolean(),
  rating: decimal2.pipe(z.number().min(0).max(5)).nullable(),
  countryCode: profile.countryCode,
  city: profile.city.nullable(),
  description: profile.description.nullable(),
  website: profile.website.nullable(),
  contactEmail: profile.contactEmail.nullable(),
  logoUrl: profile.logoUrl.nullable(),
  certifications: profile.certifications,
  stageCodes: z.array(code).max(20),
  familyCodes: z.array(code).max(30),
})

export const createContractorSchema = z.object({
  organizationName: text(200),
  taxId: text(40).optional(),
  countryCode: profile.countryCode,
  city: profile.city.optional(),
  description: profile.description.optional(),
  website: profile.website.optional(),
  contactEmail: profile.contactEmail.optional(),
  logoUrl: profile.logoUrl.optional(),
  certifications: profile.certifications.default([]),
  availability: z.enum(AVAILABILITY_STATES).default('AVAILABLE'),
  ownerEmail: email.optional(),
})

export const updateContractorSchema = nonEmpty({
  organizationName: text(200),
  taxId: text(40).nullable(),
  status: z.enum(ORG_STATUSES),
  verified: z.boolean(),
  rating: decimal2.pipe(z.number().min(0).max(5)).nullable(),
  countryCode: profile.countryCode,
  city: profile.city.nullable(),
  description: profile.description.nullable(),
  website: profile.website.nullable(),
  contactEmail: profile.contactEmail.nullable(),
  logoUrl: profile.logoUrl.nullable(),
  certifications: profile.certifications,
  availability: z.enum(AVAILABILITY_STATES),
})

export const addMemberSchema = z.object({ email, role: z.enum(MEMBER_ROLES).default('MEMBER') })

// ----- Listados públicos de organizaciones -----
export const listProvidersQuerySchema = z.object({
  ...paginationShape,
  stage: code.optional(),
  family: code.optional(),
  country: country.optional(),
  certification: z.string().trim().min(1).max(80).optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  verified: stringBool.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** Solo el administrador ve organizaciones que no están activas. */
  status: z.enum([...ORG_STATUSES, 'ALL']).default('ACTIVE'),
  sort: z.enum(['name', 'rating']).default('name'),
})

export const listContractorsQuerySchema = z.object({
  ...paginationShape,
  stage: code.optional(),
  specialty: z.string().trim().min(1).max(80).optional(),
  country: country.optional(),
  location: z.string().trim().min(1).max(120).optional(),
  certification: z.string().trim().min(1).max(80).optional(),
  availability: z.enum(AVAILABILITY_STATES).optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  verified: stringBool.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum([...ORG_STATUSES, 'ALL']).default('ACTIVE'),
  sort: z.enum(['name', 'rating']).default('name'),
})

// ----- Marketplace -----
export const listListingsQuerySchema = z.object({
  ...paginationShape,
  stage: code.optional(),
  family: code.optional(),
  /** Código del tipo de activo del modelo vinculado. */
  type: code.optional(),
  manufacturerId: z.uuid().optional(),
  providerId: z.uuid().optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).transform((c) => c.toUpperCase()).optional(),
  availability: z.enum(AVAILABILITIES).optional(),
  featured: stringBool.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'title']).default('newest'),
})

export const listProviderListingsQuerySchema = z.object({
  ...paginationShape,
  status: z.enum([...LISTING_STATUSES, 'ALL']).default('ALL'),
  search: z.string().trim().min(1).max(100).optional(),
})

const listingFields = {
  title: text(200),
  description: z.string().trim().max(4000),
  /** null = "a cotizar". */
  price: decimal2.pipe(z.number().min(0).max(1e12)),
  currency: z.string().trim().length(3).transform((c) => c.toUpperCase()),
  availability: z.enum(AVAILABILITIES),
  stockText: text(120),
  imageUrl: url,
  stageCodes: z.array(code).max(20),
  assetModelId: z.uuid(),
  assetFamilyCode: code,
}

export const createListingSchema = z.object({
  title: listingFields.title,
  description: listingFields.description.optional(),
  price: listingFields.price.optional(),
  currency: listingFields.currency.default('USD'),
  availability: listingFields.availability.default('ON_REQUEST'),
  stockText: listingFields.stockText.optional(),
  imageUrl: listingFields.imageUrl.optional(),
  stageCodes: listingFields.stageCodes.default([]),
  /** Si se indica el modelo, la familia se deduce de él; si se indican ambos deben coincidir. */
  assetModelId: listingFields.assetModelId.optional(),
  assetFamilyCode: listingFields.assetFamilyCode.optional(),
})

export const updateListingSchema = nonEmpty({
  title: listingFields.title,
  description: listingFields.description.nullable(),
  price: listingFields.price.nullable(),
  currency: listingFields.currency,
  availability: listingFields.availability,
  stockText: listingFields.stockText.nullable(),
  imageUrl: listingFields.imageUrl.nullable(),
  stageCodes: listingFields.stageCodes,
  assetModelId: listingFields.assetModelId.nullable(),
  assetFamilyCode: listingFields.assetFamilyCode,
  status: z.enum(LISTING_STATUSES),
  /** Solo el administrador del ecosistema. */
  isFeatured: z.boolean(),
})

// ----- Servicios profesionales -----
const serviceType = z.string().trim().min(2).max(80)

export const createServiceSchema = z.object({
  name: text(200),
  description: z.string().trim().max(4000).optional(),
  serviceType,
  stageCodes: z.array(code).max(20).default([]),
})

export const updateServiceSchema = nonEmpty({
  name: text(200),
  description: z.string().trim().max(4000).nullable(),
  serviceType,
  stageCodes: z.array(code).max(20),
  status: z.enum(['ACTIVE', 'INACTIVE']),
})

export const listServicesQuerySchema = z.object({
  ...paginationShape,
  stage: code.optional(),
  specialty: z.string().trim().min(1).max(80).optional(),
  country: country.optional(),
  location: z.string().trim().min(1).max(120).optional(),
  certification: z.string().trim().min(1).max(80).optional(),
  availability: z.enum(AVAILABILITY_STATES).optional(),
  contractorId: z.uuid().optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['name', 'rating']).default('name'),
})

export const csvStages = csv

export type CreateProviderDto = z.infer<typeof createProviderSchema>
export type UpdateProviderDto = z.infer<typeof updateProviderSchema>
export type CreateContractorDto = z.infer<typeof createContractorSchema>
export type UpdateContractorDto = z.infer<typeof updateContractorSchema>
export type AddMemberDto = z.infer<typeof addMemberSchema>
export type ListProvidersQuery = z.infer<typeof listProvidersQuerySchema>
export type ListContractorsQuery = z.infer<typeof listContractorsQuerySchema>
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>
export type ListProviderListingsQuery = z.infer<typeof listProviderListingsQuerySchema>
export type CreateListingDto = z.infer<typeof createListingSchema>
export type UpdateListingDto = z.infer<typeof updateListingSchema>
export type CreateServiceDto = z.infer<typeof createServiceSchema>
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>
