import { ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, Circle, Clock3, GraduationCap, Layers3, LockKeyhole, Pencil, Play, SearchX } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CourseCover } from '@/components/course-cover'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { Progress } from '@/components/lms/course-bits'
import { LessonVideo } from '@/components/lms/lesson-video'
import { VerifiedBadge } from '@/components/organizations/org-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useCourse, useDrop, useEnroll, useLessonProgress, type CourseDetail } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { coursePriceText, formatDuration, levelLabel } from '@/lib/lms'

const errorText = (err: unknown) => err instanceof ApiError ? err.message : 'No se pudo completar la acción'
const languageLabel = (language?: string) => ({es:'Español',en:'Inglés',pt:'Portugués'}[language ?? 'es'] ?? language)

function Study({ course }: { course: CourseDetail }) {
  const progress = useLessonProgress(course.id)
  const enrolled = course.myEnrollment && course.myEnrollment.status !== 'DROPPED' ? course.myEnrollment : null
  const canRead = !!enrolled || course.canManage
  const firstPending = course.lessons.find(l => !l.completed) ?? course.lessons[0]
  const [selectedId, setSelectedId] = useState<string>()
  const lesson = course.lessons.find(l => l.id === selectedId) ?? firstPending
  const index = course.lessons.findIndex(l => l.id === lesson?.id)
  const completed = enrolled?.status === 'COMPLETED'
  const title = useRef<HTMLHeadingElement>(null)
  const sections = (course.sections ?? []).map(section => ({...section,lessons:course.lessons.filter(l => l.sectionId === section.id)})).filter(section => section.lessons.length)
  const remaining = course.lessons.filter(l => !sections.some(section => section.id === l.sectionId))
  const outline = [...sections, ...(remaining.length ? [{id:'unassigned',title:'Contenido del curso',lessons:remaining}] : [])]

  function select(id: string) {
    setSelectedId(id)
    requestAnimationFrame(() => title.current?.focus({preventScroll:true}))
  }
  async function toggle(done: boolean) {
    if (!lesson) return
    try {
      const result = await progress.mutateAsync({lessonId:lesson.id,done})
      if (done && result.status === 'COMPLETED') toast.success('Curso completado')
    } catch (err) { toast.error(errorText(err)) }
  }

  return <section className="course-study" id="course-study" aria-labelledby="study-heading">
    <div className="course-section-heading"><div><p className="course-eyebrow">Tu espacio de aprendizaje</p><h2 id="study-heading">Contenido del curso</h2></div><span>{course.lessons.length} {course.lessons.length === 1 ? 'lección' : 'lecciones'} · {formatDuration(course.durationMinutes)}</span></div>
    <div className="course-study-grid">
      <section className="course-lesson" aria-labelledby="lesson-title">
        {lesson ? <>
          <header className="course-lesson-heading"><div><p>Lección {index + 1} de {course.lessons.length}</p><h3 ref={title} tabIndex={-1} id="lesson-title">{lesson.title}</h3></div><span><Clock3 aria-hidden />{formatDuration(lesson.durationMinutes)}</span></header>
          {canRead ? <div className="course-lesson-body">
            <LessonVideo key={`${lesson.id}:${lesson.video?.id ?? lesson.videoUrl ?? ''}`} courseId={course.id} lesson={lesson} track={!!enrolled} />
            {lesson.content ? <div className="course-lesson-notes"><h4>En esta lección</h4><p>{lesson.content}</p></div> : !lesson.video && !lesson.videoUrl ? <p className="course-muted">Esta lección no tiene texto.</p> : null}
            {enrolled && <div className="course-completion-actions">{lesson.completed ? <Button size="sm" variant="secondary" disabled={progress.isPending || completed} onClick={() => void toggle(false)} title={completed ? 'El curso ya está completado' : undefined}>Deshacer</Button> : <Button size="sm" disabled={progress.isPending} onClick={() => void toggle(true)}><CheckCircle2 /> Marcar como completada</Button>}{lesson.completed && <Badge variant="outline">Completada</Badge>}</div>}
          </div> : <div className="course-locked"><span><LockKeyhole aria-hidden /></span><h4>Empieza tu aprendizaje</h4><p>El contenido de las lecciones está disponible al inscribirte en el curso.</p><a href="#course-enrollment">Ver inscripción <ArrowRight aria-hidden /></a></div>}
          {course.lessons.length > 1 && <footer className="course-lesson-pagination"><Button variant="ghost" size="sm" disabled={index <= 0} onClick={() => select(course.lessons[index - 1].id)}><ChevronLeft />Anterior</Button><span>{index + 1} / {course.lessons.length}</span><Button variant="ghost" size="sm" disabled={index >= course.lessons.length - 1} onClick={() => select(course.lessons[index + 1].id)}>Siguiente<ArrowRight /></Button></footer>}
        </> : <div className="course-locked"><BookOpen aria-hidden /><h3 id="lesson-title">El programa estará disponible pronto</h3><p>Este curso aún no tiene lecciones.</p></div>}
      </section>
      <nav aria-label="Temario" className="course-outline">
        <header><span className="course-outline-icon"><Layers3 aria-hidden /></span><div><h3>Temario</h3><p>{outline.length} {outline.length === 1 ? 'módulo' : 'módulos'} · {course.lessons.filter(l => l.completed).length} de {course.lessons.length} completadas</p></div></header>
        <div className="course-outline-scroll">{outline.map(section => <details key={section.id} open className="course-outline-module"><summary><span>{section.title}<small>{section.lessons.length} {section.lessons.length === 1 ? 'lección' : 'lecciones'}</small></span><ChevronDown aria-hidden /></summary><ol>{section.lessons.map(l => <li key={l.id}><button type="button" onClick={() => select(l.id)} aria-current={lesson?.id === l.id ? 'true' : undefined} className="course-outline-lesson">{l.completed ? <CheckCircle2 aria-label="Completada" /> : lesson?.id === l.id ? <Play aria-label="Pendiente" /> : <Circle aria-label="Pendiente" />}<span>{course.lessons.findIndex(item => item.id === l.id) + 1}. {l.title}<small>{formatDuration(l.durationMinutes)}</small></span>{!canRead && <LockKeyhole className="course-outline-lock" aria-hidden />}</button></li>)}</ol></details>)}{!outline.length && <p className="course-outline-empty">Aún no hay lecciones.</p>}</div>
        {course.canManage && !enrolled && <p className="course-preview-notice">Vista de gestión. La reproducción no modifica el avance de un alumno.</p>}
      </nav>
    </div>
  </section>
}

/** Course presentation and learning workspace share the original enrollment and progress flows. */
export function CoursePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const {data:course,isLoading,isError,error,refetch} = useCourse(id)
  const enroll = useEnroll(id ?? '')
  const drop = useDrop(id ?? '')

  if (error instanceof ApiError && error.status === 404) return <EmptyState icon={SearchX} title="Curso no disponible" description="El curso no existe, no está publicado o no es visible para tu cuenta." action={<Button asChild variant="secondary"><Link to="/courses">Ver cursos</Link></Button>} />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !course) return <div className="course-detail course-loading" aria-busy="true" aria-label="Cargando curso"><Skeleton className="h-8 w-48" /><div><Skeleton className="h-80" /><Skeleton className="h-80" /></div><Skeleton className="h-64" /></div>

  const mine = course.myEnrollment && course.myEnrollment.status !== 'DROPPED' ? course.myEnrollment : null
  const takeable = course.status === 'PUBLISHED' && course.lessons.length > 0
  const objectives = course.learningObjectives ?? []
  const longDescription = (course.description?.length ?? 0) > 240
  const summary = longDescription ? `${course.description!.slice(0,237)}…` : course.description
  const instructorInitials = (course.instructorName ?? '').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('')
  const modules = (course.sections ?? []).filter(section=>course.lessons.some(l=>l.sectionId===section.id)).length

  async function run(action: () => Promise<unknown>, ok: string) {
    try { await action(); toast.success(ok) } catch (err) { toast.error(errorText(err)) }
  }

  return <article className="course-detail">
    <div className="course-topline"><nav aria-label="Ruta del curso"><Link to="/courses"><ArrowLeft aria-hidden />Todos los cursos</Link><span aria-hidden>/</span><span>{course.category ?? 'Formación'}</span></nav>{course.canManage && <Button asChild variant="outline" size="sm"><Link to={`/courses/${course.id}/edit?editor=1`}><Pencil />Editar curso</Link></Button>}</div>
    <div className="course-overview">
      <header className="course-intro">
        <div className="course-eyebrow"><GraduationCap aria-hidden />Formación FUR<span aria-hidden>·</span>{course.category ?? 'General'}</div>
        <h1>{course.title}</h1>
        {course.subtitle && <p className="course-subtitle">{course.subtitle}</p>}
        <div className="course-meta"><span><BookOpen aria-hidden />{levelLabel(course.level)}</span><span><Clock3 aria-hidden />{formatDuration(course.durationMinutes)}</span><span><Layers3 aria-hidden />{course.lessons.length} {course.lessons.length === 1 ? 'lección' : 'lecciones'}</span><span>{languageLabel(course.language)}</span></div>
        <a className="course-instructor-link" href="#course-instructor"><span className="course-instructor-avatar" aria-hidden>{course.instructor?.avatarUrl ? <CourseCover src={course.instructor.avatarUrl} alt={`Foto de ${course.instructorName}`} className="size-full rounded-[inherit]" /> : instructorInitials || <GraduationCap />}</span><span><small>Aprende con</small><strong>{course.instructorName ?? 'Instructor por confirmar'}</strong></span></a>
        {summary && <p className="course-summary">{summary}{longDescription && <> <a href="#course-about">Leer descripción completa</a></>}</p>}
        {!!objectives.length && <section className="course-objectives" aria-labelledby="objectives-heading"><h2 id="objectives-heading">Qué aprenderás</h2><ul>{objectives.slice(0,4).map((value,i)=><li key={i}><Check aria-hidden /><span>{value}</span></li>)}</ul>{objectives.length > 4 && <details><summary>Ver los {objectives.length} objetivos</summary><ul>{objectives.slice(4).map((value,i)=><li key={i}><Check aria-hidden /><span>{value}</span></li>)}</ul></details>}</section>}
      </header>
      <aside className="course-enrollment" id="course-enrollment" aria-label="Inscripción al curso">
        {course.coverUrl ? <CourseCover src={course.coverUrl} alt={`Portada de ${course.title}`} className="course-enrollment-cover" /> : <div className="course-enrollment-placeholder"><GraduationCap aria-hidden /><span>Formación FUR</span></div>}
        <div className="course-enrollment-body">
          <p className="course-price-caption">{mine ? 'Tu formación' : 'Precio del curso'}</p><p className="course-price" aria-label={`Precio: ${coursePriceText(course.price,course.currency)}`}>{coursePriceText(course.price,course.currency)}</p>
          {course.status !== 'PUBLISHED' && <Badge variant="outline">{course.status === 'DRAFT' ? 'Borrador (no visible al público)' : 'Archivado'}</Badge>}
          {mine ? <div className="course-enrolled-state">{mine.status === 'COMPLETED' ? <p className="course-completed"><CheckCircle2 />Completaste este curso el {formatDateTime(mine.completedAt)}.</p> : <Progress percent={mine.progressPercent} label="Tu progreso en el curso" />}<Button asChild className="w-full"><a href="#course-study"><Play />{mine.status === 'COMPLETED' ? 'Repasar curso' : 'Continuar aprendiendo'}</a></Button>{mine.certificateCode && <Button asChild variant="outline" className="w-full"><Link to={`/certificates/${mine.certificateCode}`}><Award />Ver mi certificado</Link></Button>}{mine.status === 'ENROLLED' && <Button size="sm" variant="ghost" className="w-full" disabled={drop.isPending} onClick={()=>void run(()=>drop.mutateAsync(),'Abandonaste el curso; tu avance se conserva')}>Abandonar curso</Button>}</div> : takeable ? user ? <Button className="course-enroll-button" disabled={enroll.isPending} onClick={()=>void run(()=>enroll.mutateAsync(),'Te inscribiste en el curso')}>{enroll.isPending ? 'Inscribiendo…' : course.myEnrollment?.status === 'DROPPED' ? 'Retomar curso' : 'Inscribirme'}<ArrowRight /></Button> : <p className="course-sign-in"><Link to="/login">Inicia sesión</Link> para inscribirte y ver el contenido de las lecciones.</p> : <p className="course-muted">Las inscripciones estarán disponibles cuando se publique el curso con su contenido.</p>}
          <ul className="course-includes"><li><BookOpen aria-hidden />{course.lessons.length} {course.lessons.length === 1 ? 'lección' : 'lecciones'}{modules > 0 && ` en ${modules} ${modules === 1 ? 'módulo' : 'módulos'}`}</li><li><Clock3 aria-hidden />{formatDuration(course.durationMinutes)} de contenido</li>{course.certificate && <li><Award aria-hidden />Emite certificado</li>}</ul>
          <p className="course-offered-by">Ofrece <strong>{course.owner.name}</strong><VerifiedBadge verified={course.owner.type !== 'ECOSYSTEM' && course.owner.verified} /></p>
        </div>
      </aside>
    </div>
    <Study key={course.id} course={course} />
    <div className="course-information">
      <section id="course-about" className="course-about" aria-labelledby="about-heading"><p className="course-eyebrow">Antes de comenzar</p><h2 id="about-heading">Sobre este curso</h2>{longDescription && <p className="course-full-description">{course.description}</p>}<div className="course-audience-grid"><div><h3>Dirigido a</h3>{course.targetAudience?.length ? <ul>{course.targetAudience.map((value,i)=><li key={i}>{value}</li>)}</ul> : <p>Consulta con el instructor si este curso se ajusta a tu perfil.</p>}</div><div><h3>Requisitos</h3>{course.requirements?.length ? <ul>{course.requirements.map((value,i)=><li key={i}>{value}</li>)}</ul> : <p>No se han indicado requisitos previos.</p>}</div></div>{course.promoVideoUrl && !mine && <details className="course-promo"><summary><Play aria-hidden />Ver presentación del curso<ChevronDown aria-hidden /></summary><LessonVideo courseId={course.id} lesson={{id:'promo',title:'Presentación del curso',position:0,durationMinutes:0,content:null,videoUrl:course.promoVideoUrl,completed:false}} /></details>}</section>
      <section id="course-instructor" className="course-instructor-card" aria-labelledby="instructor-heading"><p className="course-eyebrow">Quién te acompaña</p><h2 id="instructor-heading">Sobre el instructor</h2><div><span className="course-instructor-avatar" aria-hidden>{course.instructor?.avatarUrl ? <CourseCover src={course.instructor.avatarUrl} alt={`Foto de ${course.instructorName}`} className="size-full rounded-[inherit]" /> : instructorInitials || <GraduationCap />}</span><strong>{course.instructorName ?? 'Instructor por confirmar'}</strong></div>{course.instructor?.headline && <p className="course-instructor-headline">{course.instructor.headline}</p>}{course.instructorBio && <p>{course.instructorBio}</p>}</section>
    </div>
  </article>
}
