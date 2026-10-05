import { Building2, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Listing } from '@/features/organizations/use-organizations'
import { availabilityLabel, priceText } from '@/lib/organizations'
import { Rating, StageTags, VerifiedBadge } from './org-bits'

const AVAILABILITY_TONE: Record<string, string> = {
  IN_STOCK: 'border-fur-green-500 text-fur-green-500',
  ON_REQUEST: 'border-fur-orange-500 text-fur-orange-500',
  OUT_OF_STOCK: 'border-fur-red-500 text-fur-red-500',
}

export function AvailabilityBadge({ availability, stockText }: { availability: string; stockText?: string | null }) {
  return (
    <Badge variant="outline" className={AVAILABILITY_TONE[availability]}>
      {availabilityLabel(availability)}
      {stockText && availability === 'IN_STOCK' ? ` · ${stockText}` : ''}
    </Badge>
  )
}

/** ProductCard (design.md §33): imagen, nombre, familia, proveedor, precio, disponibilidad, etapas y rating. */
export function ListingCard({ listing, onOpen }: { listing: Listing; onOpen: (id: string) => void }) {
  return (
    <Card className="flex h-full flex-col">
      <div className="grid h-36 place-items-center overflow-hidden rounded-t-xl bg-muted">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
        ) : (
          <Package className="size-10 text-fur-gray-500" aria-hidden />
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{listing.family.name}</span>
            {listing.isFeatured && <Badge>Destacado</Badge>}
          </div>
          <h3 className="text-base leading-snug font-semibold text-fur-navy-900">{listing.title}</h3>
          <p className="flex flex-wrap items-center gap-2 text-sm text-fur-gray-600">
            <Building2 className="size-4" aria-hidden /> {listing.provider.name} <VerifiedBadge verified={listing.provider.verified} />
          </p>
        </div>

        <p className="text-xl font-bold text-fur-navy-900">{priceText(listing.price, listing.currency)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <AvailabilityBadge availability={listing.availability} stockText={listing.stockText} />
          <Rating rating={listing.provider.rating} />
        </div>
        <StageTags stages={listing.stages} />

        <Button className="mt-auto" variant="secondary" onClick={() => onOpen(listing.id)} aria-label={`Ver producto ${listing.title}`}>
          Ver producto
        </Button>
      </CardContent>
    </Card>
  )
}

