import { Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useListing, useProvider } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { LISTING_STATUS_LABELS, priceText } from '@/lib/organizations'
import { AvailabilityBadge } from './listing-card'
import { Rating, StageTags, VerifiedBadge } from './org-bits'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** Ficha de un producto del marketplace. El contacto del proveedor solo se muestra con sesión iniciada. */
export function ListingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: listing, isLoading, isError, error, refetch } = useListing(id)
  const { user } = useAuth()
  const provider = useProvider(listing?.provider.id)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{listing?.title ?? 'Producto'}</SheetTitle>
          <SheetDescription>{listing ? `${listing.family.name}${listing.type ? ` · ${listing.type.name}` : ''}` : 'Detalle del producto'}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-8" />
              <Skeleton className="h-32" />
            </div>
          ) : error instanceof ApiError && error.status === 404 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fur-gray-600">El producto no existe o ya no está publicado.</p>
          ) : isError || !listing ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <AvailabilityBadge availability={listing.availability} stockText={listing.stockText} />
                {listing.isFeatured && <Badge>Destacado</Badge>}
                {listing.status !== 'ACTIVE' && <Badge variant="outline">{LISTING_STATUS_LABELS[listing.status]} (no visible al público)</Badge>}
              </div>

              <p className="text-3xl font-bold text-fur-navy-900">{priceText(listing.price, listing.currency)}</p>
              {listing.description && <p className="text-sm whitespace-pre-wrap">{listing.description}</p>}

              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Fact label="Familia">{listing.family.name}</Fact>
                <Fact label="Tipo">{listing.type?.name ?? '—'}</Fact>
                <Fact label="Modelo del catálogo">{listing.model?.name ?? '—'}</Fact>
                <Fact label="Fabricante">{listing.model?.manufacturer?.name ?? '—'}</Fact>
              </dl>

              <section aria-labelledby="stages-title">
                <h3 id="stages-title" className="mb-2 text-sm font-semibold text-fur-navy-900">
                  Etapas relacionadas
                </h3>
                <StageTags stages={listing.stages} max={20} />
              </section>

              <section aria-labelledby="prov-title" className="space-y-2 rounded-lg border border-border p-4">
                <h3 id="prov-title" className="text-sm font-semibold text-fur-navy-900">
                  Proveedor
                </h3>
                <p className="flex flex-wrap items-center gap-2">
                  <Link to={`/providers?provider=${listing.provider.id}`} className="font-medium underline-offset-2 hover:underline">
                    {listing.provider.name}
                  </Link>
                  <VerifiedBadge verified={listing.provider.verified} />
                  <Rating rating={listing.provider.rating} />
                </p>
                {user ? (
                  provider.data?.contactEmail ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={`mailto:${provider.data.contactEmail}?subject=${encodeURIComponent(`Consulta: ${listing.title}`)}`}>
                        <Mail /> Contactar al proveedor
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-fur-gray-600">El proveedor no publicó un correo de contacto.</p>
                  )
                ) : (
                  <p className="text-sm text-fur-gray-600">
                    <Link to="/login" className="underline underline-offset-2">
                      Inicia sesión
                    </Link>{' '}
                    para ver los datos de contacto y solicitar una cotización.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
