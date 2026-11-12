import { CourseCover } from '@/components/course-cover'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import type { CourseCard as Course } from '@/features/lms/use-lms'
import { coursePriceText } from '@/lib/lms'

/** Barra de progreso accesible (rol progressbar + texto, no solo color). */
export function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <div className="h-full rounded-full bg-fur-green-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-fur-gray-600">{Math.round(percent)} % completado</p>
    </div>
  )
}

/** Compact discovery card; the complete presentation lives on the course page. */
export function CourseCard({ course }: { course: Course }) {
  const mine = course.myEnrollment && course.myEnrollment.status !== 'DROPPED' ? course.myEnrollment : null
  return <Card className="course-catalog-card">
    <Link to={`/courses/${course.id}`} className="course-catalog-link" aria-labelledby={`course-title-${course.id}`}>
      <CourseCover src={course.coverUrl} alt={`Portada de ${course.title}`} className="course-catalog-cover" />
      <div className="course-catalog-copy">
        <h3 id={`course-title-${course.id}`}>{course.title}</h3>
        <p className="course-catalog-instructor">{course.instructorName ?? course.owner.name}</p>
        <p className="course-catalog-price" aria-label={`Precio: ${coursePriceText(course.price, course.currency)}`}>{coursePriceText(course.price, course.currency)}</p>
        {mine && <span className="course-catalog-enrolled" role={mine.status === 'COMPLETED' ? undefined : 'progressbar'} aria-label={`Progreso en ${course.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mine.progressPercent)}>{mine.status === 'COMPLETED' ? 'Completado' : `${Math.round(mine.progressPercent)} % completado`}</span>}
      </div>
    </Link>
  </Card>
}
