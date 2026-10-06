import { Award, Clock, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { VerifiedBadge } from '@/components/organizations/org-bits'
import { StageTags } from '@/components/organizations/org-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CourseCard as Course } from '@/features/lms/use-lms'
import { coursePriceText, formatDuration, levelLabel } from '@/lib/lms'

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

/** CourseCard (design.md §36): título, etapa, nivel, duración, instructor, certificado y progreso. */
export function CourseCard({ course }: { course: Course }) {
  const mine = course.myEnrollment && course.myEnrollment.status !== 'DROPPED' ? course.myEnrollment : null
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{levelLabel(course.level)}</Badge>
            {course.certificate && (
              <Badge variant="outline" className="gap-1">
                <Award aria-hidden /> Certificado
              </Badge>
            )}
          </div>
          <h3 className="text-base leading-snug font-semibold text-fur-navy-900">
            <Link to={`/courses/${course.id}`} className="underline-offset-2 hover:underline">
              {course.title}
            </Link>
          </h3>
          <p className="flex flex-wrap items-center gap-2 text-sm text-fur-gray-600">
            <GraduationCap className="size-4" aria-hidden /> {course.instructorName ?? 'Sin instructor indicado'}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-fur-gray-600">
            {course.owner.name} <VerifiedBadge verified={course.owner.type !== 'ECOSYSTEM' && course.owner.verified} />
          </p>
        </div>
        {course.description && <p className="line-clamp-3 text-sm">{course.description}</p>}
        <p className="flex items-center gap-1.5 text-sm text-fur-gray-600">
          <Clock className="size-4" aria-hidden /> {formatDuration(course.durationMinutes)} · {course.lessonCount} {course.lessonCount === 1 ? 'lección' : 'lecciones'}
        </p>
        <StageTags stages={course.stages} />
        <p className={course.price > 0 ? 'text-lg font-bold text-fur-navy-900' : 'text-lg font-bold text-fur-green-500'} aria-label={`Precio: ${coursePriceText(course.price, course.currency)}`}>
          {coursePriceText(course.price, course.currency)}
        </p>
        {mine ? (
          <div className="mt-auto">
            {mine.status === 'COMPLETED' ? <Badge>Completado</Badge> : <Progress percent={mine.progressPercent} label={`Progreso en ${course.title}`} />}
          </div>
        ) : (
          <Button asChild variant="secondary" className="mt-auto">
            <Link to={`/courses/${course.id}`} aria-label={`Ver curso ${course.title}`}>
              Ver curso
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
