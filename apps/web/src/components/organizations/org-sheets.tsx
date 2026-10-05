import { ExternalLink, Mail, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useContractor, useListings, useProvider } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { contractorAvailabilityLabel, countryName, ORG_STATUS_LABELS, priceText, specialtyLabel } from '@/lib/organizations'
import { OrgLogo, Rating, StageTags, VerifiedBadge } from './org-bits'
import { Certs, Location } from './provider-card'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Contact({ email, website }: { email: string | null; website: string | null }) {
  const { user } = useAuth()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {website && (
        <Button asChild variant="secondary" size="sm">
          <a href={website} target="_blank" rel="noopener noreferrer nofollow">
            <ExternalLink /> Sitio web
          </a>
        </Button>
      )}
      {user ? (
        email ? (
          <Button asChild variant="secondary" size="sm">
            <a href={`mailto:${email}`}>
              <Mail /> {email}
            </a>
          </Button>
        ) : (
          <span className="text-sm text-fur-gray-600">Sin correo de contacto publicado.</span>
        )
      ) : (
        <span className="text-sm text-fur-gray-600">
          <Link to="/login" className="underline underline-offset-2">
            Inicia sesión
          </Link>{' '}
          para ver el correo de contacto.
        </span>
      )}
    </div>
  )
}

function Frame({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

function Loading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-8" />
      <Skeleton className="h-32" />
    </div>
  )
}

const NotFound = ({ what }: { what: string }) => <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fur-gray-600">{what} no existe o no es visible para tu cuenta.</p>

/** Ficha pública de un proveedor, con sus productos publicados. */
export function ProviderSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: p, isLoading, isError, error, refetch } = useProvider(id)
  const products = useListings({ providerId: id }, 6)

  return (
    <Frame title={p?.organizationName ?? 'Proveedor'} description="Ficha del proveedor" onClose={onClose}>
      {isLoading ? (
        <Loading />
      ) : error instanceof ApiError && error.status === 404 ? (
        <NotFound what="El proveedor" />
      ) : isError || !p ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="flex items-start gap-3">
            <OrgLogo name={p.organizationName} logoUrl={p.logoUrl} />
            <div className="space-y-1">
              <Location city={p.city} countryCode={p.countryCode} />
              <div className="flex flex-wrap items-center gap-2">
                <VerifiedBadge verified={p.verified} />
                <Rating rating={p.rating} />
                {p.status !== 'ACTIVE' && <Badge variant="outline">{ORG_STATUS_LABELS[p.status]}</Badge>}
              </div>
            </div>
          </div>
          {p.description && <p className="text-sm whitespace-pre-wrap">{p.description}</p>}
          <Certs items={p.certifications} />
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Fact label="País">{countryName(p.countryCode)}</Fact>
            <Fact label="Familias">{p.families.length ? p.families.map((f) => f.name).join(', ') : '—'}</Fact>
          </dl>
          <section aria-labelledby="pstages">
            <h3 id="pstages" className="mb-2 text-sm font-semibold text-fur-navy-900">
              Etapas que atiende
            </h3>
            <StageTags stages={p.stages} max={20} />
          </section>
          <Contact email={p.contactEmail} website={p.website} />
          {p.canManage && (
            <Button asChild>
              <Link to={`/providers/${p.id}/manage`}>
                <Settings /> Gestionar mi organización
              </Link>
            </Button>
          )}

          <section aria-labelledby="pprods">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="pprods" className="text-sm font-semibold text-fur-navy-900">
                Productos publicados ({p.activeListings})
              </h3>
              {p.activeListings > 0 && (
                <Link to={`/marketplace?providerId=${p.id}`} className="text-sm underline-offset-2 hover:underline">
                  Ver en el marketplace
                </Link>
              )}
            </div>
            {products.data && products.data.items.length === 0 ? (
              <p className="text-sm text-fur-gray-600">Este proveedor aún no tiene productos publicados.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {products.data?.items.map((l) => (
                  <li key={l.id}>
                    <Link to={`/marketplace?listing=${l.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted">
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      <span className="text-sm font-medium">{priceText(l.price, l.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Frame>
  )
}

/** Ficha de un contratista con sus servicios. */
export function ContractorSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: c, isLoading, isError, error, refetch } = useContractor(id)

  return (
    <Frame title={c?.organizationName ?? 'Contratista'} description="Ficha del contratista" onClose={onClose}>
      {isLoading ? (
        <Loading />
      ) : error instanceof ApiError && error.status === 404 ? (
        <NotFound what="El contratista" />
      ) : isError || !c ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="flex items-start gap-3">
            <OrgLogo name={c.organizationName} logoUrl={c.logoUrl} />
            <div className="space-y-1">
              <Location city={c.city} countryCode={c.countryCode} />
              <div className="flex flex-wrap items-center gap-2">
                <VerifiedBadge verified={c.verified} />
                <Rating rating={c.rating} />
                <Badge variant="outline">{contractorAvailabilityLabel(c.availability)}</Badge>
                {c.status !== 'ACTIVE' && <Badge variant="outline">{ORG_STATUS_LABELS[c.status]}</Badge>}
              </div>
            </div>
          </div>
          {c.description && <p className="text-sm whitespace-pre-wrap">{c.description}</p>}
          <Certs items={c.certifications} />
          <section aria-labelledby="cstages">
            <h3 id="cstages" className="mb-2 text-sm font-semibold text-fur-navy-900">
              Etapas atendidas
            </h3>
            <StageTags stages={c.stages} max={20} />
          </section>
          <Contact email={c.contactEmail} website={c.website} />
          {c.canManage && (
            <Button asChild>
              <Link to={`/contractors/${c.id}/manage`}>
                <Settings /> Gestionar mi organización
              </Link>
            </Button>
          )}

          <section aria-labelledby="csvc">
            <h3 id="csvc" className="mb-2 text-sm font-semibold text-fur-navy-900">
              Servicios
            </h3>
            {c.services.length === 0 ? (
              <p className="text-sm text-fur-gray-600">Aún no hay servicios publicados.</p>
            ) : (
              <ul className="space-y-3">
                {c.services.map((s) => (
                  <li key={s.id} className="space-y-1.5 rounded-lg border border-border p-3">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {s.name} <Badge variant="secondary">{specialtyLabel(s.serviceType)}</Badge>
                      {s.status === 'INACTIVE' && <Badge variant="outline">Inactivo</Badge>}
                    </p>
                    {s.description && <p className="text-sm text-fur-gray-600">{s.description}</p>}
                    <StageTags stages={s.stages} max={6} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Frame>
  )
}
