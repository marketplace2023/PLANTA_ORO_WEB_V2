import { Hammer } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { PageHeader } from '@/components/layout/page-header'

type Props = { title: string }

/** Marcador de módulos aún no implementados (fases 1-4 del plan). */
export function ModulePlaceholder({ title }: Props) {
  const { plantSlug } = useParams()
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Hammer}
        title="Módulo en construcción"
        description={
          plantSlug
            ? `Este módulo estará disponible próximamente para la planta «${plantSlug}».`
            : 'Este módulo estará disponible próximamente.'
        }
      />
    </>
  )
}
