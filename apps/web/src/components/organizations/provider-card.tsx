import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Contractor, Provider } from '@/features/organizations/use-organizations'
import { contractorAvailabilityLabel, countryName } from '@/lib/organizations'
import { OrgLogo, Rating, StageTags, VerifiedBadge } from './org-bits'

function Location({ city, countryCode }: { city: string | null; countryCode: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-fur-gray-600">
      <MapPin className="size-4" aria-hidden /> {[city, countryName(countryCode)].filter(Boolean).join(', ')}
    </span>
  )
}

function Certs({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Certificaciones">
      {items.map((c) => (
        <li key={c}>
          <Badge variant="outline">{c}</Badge>
        </li>
      ))}
    </ul>
  )
}

/** ProviderCard (design.md §34): logo, nombre, familias, etapas, rating, certificaciones y ubicación. */
export function ProviderCard({ provider, onOpen }: { provider: Provider; onOpen: (id: string) => void }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <OrgLogo name={provider.organizationName} logoUrl={provider.logoUrl} />
          <div className="min-w-0 space-y-1">
            <h3 className="text-base leading-snug font-semibold text-fur-navy-900">
              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onOpen(provider.id)}>
                {provider.organizationName}
              </button>
            </h3>
            <Location city={provider.city} countryCode={provider.countryCode} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerifiedBadge verified={provider.verified} />
          <Rating rating={provider.rating} />
        </div>
        {provider.families.length > 0 && <p className="text-sm text-fur-gray-600">{provider.families.map((f) => f.name).join(' · ')}</p>}
        <StageTags stages={provider.stages} />
        <Certs items={provider.certifications} />
        <p className="mt-auto text-xs text-fur-gray-600">{provider.activeListings} {provider.activeListings === 1 ? 'producto publicado' : 'productos publicados'}</p>
      </CardContent>
    </Card>
  )
}

/** Tarjeta de contratista (design.md §35): especialidades, etapas atendidas, disponibilidad, rating y certificaciones. */
export function ContractorCard({ contractor, onOpen }: { contractor: Contractor; onOpen: (id: string) => void }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <OrgLogo name={contractor.organizationName} logoUrl={contractor.logoUrl} />
          <div className="min-w-0 space-y-1">
            <h3 className="text-base leading-snug font-semibold text-fur-navy-900">
              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onOpen(contractor.id)}>
                {contractor.organizationName}
              </button>
            </h3>
            <Location city={contractor.city} countryCode={contractor.countryCode} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerifiedBadge verified={contractor.verified} />
          <Rating rating={contractor.rating} />
          <Badge variant="outline">{contractorAvailabilityLabel(contractor.availability)}</Badge>
        </div>
        {contractor.specialties.length > 0 && <p className="text-sm text-fur-gray-600">{contractor.specialties.join(' · ')}</p>}
        <StageTags stages={contractor.stages} />
        <Certs items={contractor.certifications} />
      </CardContent>
    </Card>
  )
}

export { Certs, Location }
