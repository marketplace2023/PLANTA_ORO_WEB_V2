import { Briefcase, MapPin, Plus, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { PageHeader } from '@/components/layout/page-header'
import { Rating, StageTags, VerifiedBadge } from '@/components/organizations/org-bits'
import { ContractorSheet } from '@/components/organizations/org-sheets'
import { RegisterOrgDialog } from '@/components/organizations/register-org-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useMyContractors, useServices, useSpecialties } from '@/features/organizations/use-organizations'
import { CONTRACTOR_AVAILABILITY_LABELS, contractorAvailabilityLabel, countryName, specialtyLabel } from '@/lib/organizations'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { useUrlFilters } from '@/lib/use-url-filters'

const PAGE_SIZE = 12

/** Servicios Profesionales (design.md §35): servicios de contratistas, filtrables por etapa y especialidad. */
export function ProfessionalsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { params, filters, setParam } = useUrlFilters(['contractor'])
  const openId = params.get('contractor') ?? undefined
  const page = Math.max(1, Number(filters.page) || 1)
  const services = useServices(filters, PAGE_SIZE)
  const specialties = useSpecialties()
  const stages = useStageCatalog()
  const mine = useMyContractors(!!user)
  const [registering, setRegistering] = useState(false)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const chips: Chip[] = [
    filters.stage && { key: 'stage', label: 'Etapa', value: `${filters.stage} · ${stages.data?.find((s) => s.code === filters.stage)?.name ?? ''}`.trim() },
    filters.specialty && { key: 'specialty', label: 'Especialidad', value: specialtyLabel(filters.specialty) },
    filters.location && { key: 'location', label: 'Ubicación', value: filters.location },
    filters.availability && { key: 'availability', label: 'Disponibilidad', value: contractorAvailabilityLabel(filters.availability) },
    filters.certification && { key: 'certification', label: 'Certificación', value: filters.certification },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)
  const clearAll = () => {
    setSearchText('')
    setParam({ stage: undefined, specialty: undefined, location: undefined, availability: undefined, certification: undefined, search: undefined })
  }

  const data = services.data
  return (
    <>
      <PageHeader
        title="Servicios Profesionales"
        description="Contratistas y especialistas para mantenimiento, instrumentación y automatización, por etapa del proceso."
        actions={
          <div className="flex flex-wrap gap-2">
            {mine.data?.map((c) => (
              <Button key={c.id} asChild variant="secondary">
                <Link to={`/contractors/${c.id}/manage`}>
                  <Settings /> {c.organizationName}
                </Link>
              </Button>
            ))}
            {user ? (
              <Button onClick={() => setRegistering(true)}>
                <Plus /> Registrar mi empresa
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link to="/login">Inicia sesión para registrar tu empresa</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="sv-search" className="text-xs text-fur-gray-600">
              Buscar
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="sv-search" type="search" className="h-10 pl-9" placeholder="Servicio o contratista…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Etapa" value={filters.stage ?? ''} onChange={(v) => setParam({ stage: v || undefined })} options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} />
          <FilterSelect label="Especialidad" value={filters.specialty ?? ''} onChange={(v) => setParam({ specialty: v || undefined })} options={(specialties.data ?? []).map((s) => ({ value: s, label: specialtyLabel(s) }))} />
          <FilterSelect
            label="Disponibilidad"
            value={filters.availability ?? ''}
            onChange={(v) => setParam({ availability: v || undefined })}
            options={Object.entries(CONTRACTOR_AVAILABILITY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <div className="w-44 space-y-1">
            <Label htmlFor="sv-loc" className="text-xs text-fur-gray-600">
              Ubicación
            </Label>
            <Input id="sv-loc" className="h-10" placeholder="Ciudad…" value={filters.location ?? ''} onChange={(e) => setParam({ location: e.target.value || undefined })} />
          </div>
          <div className="w-44 space-y-1">
            <Label htmlFor="sv-cert" className="text-xs text-fur-gray-600">
              Certificación
            </Label>
            <Input id="sv-cert" className="h-10" placeholder="OSHA, ISO…" value={filters.certification ?? ''} onChange={(e) => setParam({ certification: e.target.value || undefined })} />
          </div>
        </div>
        <FilterChips
          chips={chips}
          onRemove={(key) => {
            if (key === 'search') setSearchText('')
            setParam({ [key]: undefined })
          }}
          onClear={clearAll}
        />
      </div>

      {services.isError ? (
        <ErrorState onRetry={() => void services.refetch()} />
      ) : services.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando servicios">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún servicio coincide con los filtros" action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={Briefcase} title="Aún no hay servicios publicados" description="Los contratistas aprobados por el administrador publicarán aquí sus servicios." />
        )
      ) : (
        data && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((s) => (
                <li key={s.id}>
                  {/* ServiceCard: contratista, especialidad, etapas, disponibilidad, rating y certificaciones */}
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-3">
                      <div className="space-y-1">
                        <Badge variant="secondary">{specialtyLabel(s.serviceType)}</Badge>
                        <h3 className="text-base leading-snug font-semibold text-fur-navy-900">{s.name}</h3>
                        <p className="text-sm text-fur-gray-600">
                          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setParam({ contractor: s.contractor.id }, true)}>
                            {s.contractor.name}
                          </button>
                        </p>
                        <p className="inline-flex items-center gap-1 text-sm text-fur-gray-600">
                          <MapPin className="size-4" aria-hidden /> {[s.contractor.city, countryName(s.contractor.countryCode)].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      {s.description && <p className="line-clamp-3 text-sm">{s.description}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <VerifiedBadge verified={s.contractor.verified} />
                        <Rating rating={s.contractor.rating} />
                        <Badge variant="outline">{contractorAvailabilityLabel(s.contractor.availability)}</Badge>
                      </div>
                      <StageTags stages={s.stages} />
                      {s.contractor.certifications.length > 0 && <p className="mt-auto text-xs text-fur-gray-600">{s.contractor.certifications.join(' · ')}</p>}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}

      {openId && <ContractorSheet id={openId} onClose={() => setParam({ contractor: undefined }, true)} />}
      {registering && <RegisterOrgDialog kind="contractor" onClose={() => setRegistering(false)} onDone={(id) => navigate(`/contractors/${id}/manage`)} />}
    </>
  )
}
