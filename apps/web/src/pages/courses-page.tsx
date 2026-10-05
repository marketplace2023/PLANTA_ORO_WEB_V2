import { GraduationCap, Plus, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { PageHeader } from '@/components/layout/page-header'
import { CourseCard } from '@/components/lms/course-bits'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useCourses } from '@/features/lms/use-lms'
import { useMyContractors, useMyProviders } from '@/features/organizations/use-organizations'
import { LEVEL_LABELS, LEVELS, levelLabel, OWNER_LABELS } from '@/lib/lms'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { useUrlFilters } from '@/lib/use-url-filters'

const PAGE_SIZE = 12
const SORTS = [
  { value: 'title', label: 'Título (A-Z)' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'duration', label: 'Menor duración' },
]
const DURATIONS = [
  { value: '60', label: 'Hasta 1 h' },
  { value: '180', label: 'Hasta 3 h' },
  { value: '480', label: 'Hasta 8 h' },
]

/** Cursos (LMS, design.md §36): formación por etapa del proceso, del ecosistema, proveedores y contratistas. */
export function CoursesPage() {
  const { user } = useAuth()
  const { filters, setParam } = useUrlFilters()
  const page = Math.max(1, Number(filters.page) || 1)
  const courses = useCourses(filters, PAGE_SIZE)
  const stages = useStageCatalog()
  const myProviders = useMyProviders(!!user)
  const myContractors = useMyContractors(!!user)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const chips: Chip[] = [
    filters.stage && { key: 'stage', label: 'Etapa', value: `${filters.stage} · ${stages.data?.find((s) => s.code === filters.stage)?.name ?? ''}`.trim() },
    filters.level && { key: 'level', label: 'Nivel', value: levelLabel(filters.level) },
    filters.ownerType && { key: 'ownerType', label: 'Ofrece', value: OWNER_LABELS[filters.ownerType] ?? filters.ownerType },
    filters.maxMinutes && { key: 'maxMinutes', label: 'Duración', value: DURATIONS.find((d) => d.value === filters.maxMinutes)?.label ?? `${filters.maxMinutes} min` },
    filters.certificate === '1' && { key: 'certificate', label: 'Certificación', value: 'Con certificado' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)
  const clearAll = () => {
    setSearchText('')
    setParam({ stage: undefined, level: undefined, ownerType: undefined, maxMinutes: undefined, certificate: undefined, search: undefined })
  }

  const data = courses.data
  return (
    <>
      <PageHeader
        title="Cursos (LMS)"
        description="Formación para el personal de planta, organizada por etapa del proceso."
        actions={
          <div className="flex flex-wrap gap-2">
            {user && (
              <Button asChild variant="secondary">
                <Link to="/courses/mine">
                  <GraduationCap /> Mi aprendizaje
                </Link>
              </Button>
            )}
            {user?.isGlobalAdmin && (
              <Button asChild variant="secondary">
                <Link to="/courses/manage?owner=ecosystem">
                  <Settings /> Cursos del ecosistema
                </Link>
              </Button>
            )}
            {myProviders.data?.map((p) => (
              <Button key={p.id} asChild variant="secondary">
                <Link to={`/courses/manage?owner=provider:${p.id}`}>
                  <Plus /> Cursos de {p.organizationName}
                </Link>
              </Button>
            ))}
            {myContractors.data?.map((c) => (
              <Button key={c.id} asChild variant="secondary">
                <Link to={`/courses/manage?owner=contractor:${c.id}`}>
                  <Plus /> Cursos de {c.organizationName}
                </Link>
              </Button>
            ))}
          </div>
        }
      />

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="cr-search" className="text-xs text-fur-gray-600">
              Buscar
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="cr-search" type="search" className="h-10 pl-9" placeholder="Título, descripción o instructor…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Etapa" value={filters.stage ?? ''} onChange={(v) => setParam({ stage: v || undefined })} options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} />
          <FilterSelect label="Nivel" value={filters.level ?? ''} onChange={(v) => setParam({ level: v || undefined })} options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))} />
          <FilterSelect label="Ofrece" value={filters.ownerType ?? ''} onChange={(v) => setParam({ ownerType: v || undefined })} options={Object.entries(OWNER_LABELS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Duración" value={filters.maxMinutes ?? ''} onChange={(v) => setParam({ maxMinutes: v || undefined })} options={DURATIONS} />
          <FilterSelect label="Ordenar" value={filters.sort ?? ''} allLabel={SORTS[0].label} onChange={(v) => setParam({ sort: v || undefined })} options={SORTS.slice(1)} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.certificate === '1'} onCheckedChange={(on) => setParam({ certificate: on ? '1' : undefined })} />
            Con certificado
          </label>
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

      {courses.isError ? (
        <ErrorState onRetry={() => void courses.refetch()} />
      ) : courses.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando cursos">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún curso coincide con los filtros" action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={GraduationCap} title="Aún no hay cursos publicados" description="Los cursos del ecosistema, proveedores y contratistas aparecerán aquí." />
        )
      ) : (
        data && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((c) => (
                <li key={c.id}>
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}
    </>
  )
}
