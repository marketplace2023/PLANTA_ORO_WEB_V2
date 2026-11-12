import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, BookOpen, Check, CheckCircle2, Circle, Eye, ImagePlus, Layers3, Loader2, Pencil, Plus, Save, Send, Settings2, Target, Trash2, Users, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLinkInstructorProfile, useCourseSections, useCreateCourse, useDeleteLesson, useUpdateCourse, useUpdateLesson, useUploadCourseCover, type CourseDetail, type CourseInput, type CourseSection, type Lesson, type OwnerType } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { LessonFormDialog } from './lesson-form-dialog'
import { LessonVideo } from './lesson-video'
import { VideoPreviewDialog } from './video-preview-dialog'
import { CourseCover } from '@/components/course-cover'

const STEPS = [
  { id: 'presentation', title: 'Presentación', detail: 'La ficha de tu curso', icon: BookOpen },
  { id: 'audience', title: 'Aprendizaje', detail: 'Objetivos y participantes', icon: Target },
  { id: 'curriculum', title: 'Programa', detail: 'Módulos, lecciones y videos', icon: Layers3 },
  { id: 'instructor', title: 'Instructor', detail: 'Quién comparte la experiencia', icon: Users },
  { id: 'pricing', title: 'Precio y certificado', detail: 'Condiciones del curso', icon: Wallet },
  { id: 'review', title: 'Revisión y publicación', detail: 'Comprueba antes de publicar', icon: Send },
] as const
type Step = typeof STEPS[number]['id']
type Draft = ReturnType<typeof draftFor>
const CATEGORIES = ['General', 'Operaciones', 'Mantenimiento', 'Seguridad y ambiente', 'Gestión', 'Tecnología', 'Desarrollo profesional']
const errorText = (error: unknown) => error instanceof ApiError ? error.fieldErrors.map(e => e.message).join(' · ') || error.message : error instanceof Error ? error.message : 'No se pudo guardar el cambio'
const tidy = (values: string[]) => values.map(v => v.trim()).filter(Boolean)
function draftFor(c?: CourseDetail) {
  return { title: c?.title ?? '', subtitle: c?.subtitle ?? '', description: c?.description ?? '', category: c?.category ?? 'General', language: c?.language ?? 'es', level: c?.level ?? 'BASIC',
    coverUrl: c?.coverSource === 'upload' ? '' : c?.coverUrl ?? '', promoVideoUrl: c?.promoVideoUrl ?? '', instructorName: c?.instructorName ?? '', instructorBio: c?.instructorBio ?? '',
    learningObjectives: c?.learningObjectives?.length ? c.learningObjectives : [''], requirements: c?.requirements?.length ? c.requirements : [''], targetAudience: c?.targetAudience?.length ? c.targetAudience : [''],
    price: String(c?.price ?? 0), currency: c?.currency ?? 'USD', certificate: c?.certificate ?? true }
}
function Field({ label, id, children, hint }: { label: string; id: string; children: ReactNode; hint?: string }) {
  return <div className="course-field"><Label htmlFor={id}>{label}</Label>{children}{hint && <p>{hint}</p>}</div>
}
function StringList({ title, hint, values, onChange }: { title: string; hint: string; values: string[]; onChange: (values: string[]) => void }) {
  return <fieldset className="course-string-list"><legend>{title}</legend><p>{hint}</p>
    {values.map((value, i) => <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><Input aria-label={`${title} ${i + 1}`} value={value} maxLength={400} onChange={e => onChange(values.map((v, n) => n === i ? e.target.value : v))} /><Button type="button" variant="ghost" size="icon" aria-label={`Eliminar ${title.toLowerCase()} ${i + 1}`} onClick={() => onChange(values.length > 1 ? values.filter((_, n) => n !== i) : [''])}><Trash2 /></Button></div>)}
    <Button type="button" variant="outline" size="sm" disabled={values.length >= 30} onClick={() => onChange([...values, ''])}><Plus /> Agregar otro</Button>
  </fieldset>
}

/** Saved authoring workspace, shared by the instructor portal and ecosystem web. */
export function CourseAuthoring({ course: loadedCourse, owner, ownerName, onCreated, onClose, initialStep, onStepChange }: { course?: CourseDetail; owner?: { ownerType: OwnerType; ownerId?: string }; ownerName?: string; onCreated?: (id: string, step: string) => void; onClose: () => void; initialStep?: string; onStepChange?: (step: string) => void }) {
  const [createdCourse, setCreatedCourse] = useState<CourseDetail | null>(null)
  const course = loadedCourse ?? createdCourse ?? undefined
  const create = useCreateCourse()
  const update = useUpdateCourse(course?.id ?? '')
  const uploadCover = useUploadCourseCover()
  const linkInstructor = useLinkInstructorProfile(course?.id ?? '')
  const [draft, setDraft] = useState(() => draftFor(course))
  const [coverMode, setCoverMode] = useState<'upload' | 'url' | 'none'>(course?.coverSource === 'upload' ? 'upload' : course?.coverUrl ? 'url' : 'upload')
  const [savedCoverMode, setSavedCoverMode] = useState(coverMode)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [savedCover, setSavedCover] = useState<string | null>(null)
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const dirty = JSON.stringify(draft) !== baseline || !!coverFile || coverMode !== savedCoverMode
  const [step, setStep] = useState<Step>(STEPS.some(s => s.id === initialStep) ? initialStep as Step : 'presentation')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState(false)
  const index = STEPS.findIndex(s => s.id === step)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(d => ({ ...d, [key]: value })); setSaved(false) }
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])
  const coverDisplayUrl = coverMode === 'none' ? null : coverMode === 'url' ? draft.coverUrl : coverPreview ?? savedCover ?? (course?.coverSource === 'upload' ? course.coverUrl : null)
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  async function save(next?: Step) {
    setError('')
    if (coverMode === 'upload' && !coverFile && savedCoverMode === 'url') { setError('Selecciona una imagen de portada para sustituir el enlace actual.'); setStep('presentation'); return false }
    if (!draft.title.trim()) { setError('Escribe un título para guardar el borrador.'); setStep('presentation'); return false }
    const price = Number(draft.price)
    if (!Number.isFinite(price) || price < 0 || price > 1e9 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) { setError('Indica un precio entre 0 y 1.000.000.000 con hasta dos decimales.'); setStep('pricing'); return false }
    for (const value of [coverMode === 'url' ? draft.coverUrl : '', draft.promoVideoUrl]) if (value.trim()) {
      try { if (!['https:', 'http:'].includes(new URL(value).protocol)) throw new Error() } catch { setError('La portada y el video de presentación deben usar enlaces http o https válidos.'); setStep('presentation'); return false }
    }
    setBusy(true)
    try {
      const input = { ...draft, title: draft.title.trim(), subtitle: draft.subtitle.trim() || null, description: draft.description.trim(), instructorName: draft.instructorName.trim(),
        instructorBio: draft.instructorBio.trim() || null, coverUrl: coverMode === 'upload' ? undefined : coverMode === 'none' ? null : draft.coverUrl.trim() || null, promoVideoUrl: draft.promoVideoUrl.trim() || null, price,
        learningObjectives: tidy(draft.learningObjectives), requirements: tidy(draft.requirements), targetAudience: tidy(draft.targetAudience) }
      let result: CourseDetail
      if (course) result = await update.mutateAsync({ ...input, instructorName: input.instructorName || null })
      else {
        if (!owner) throw new Error('Selecciona quién ofrece este curso')
        result = await create.mutateAsync({ ...input, ...owner, instructorName: input.instructorName || undefined } as CourseInput)
        setCreatedCourse(result)
      }
      if (coverMode === 'upload' && coverFile) {
        result = await uploadCover.mutateAsync({id:result.id,file:coverFile})
        setSavedCover(result.coverUrl ?? null)
        setCoverFile(null)
        setCoverPreview(null)
      }
      if (coverMode !== 'upload') { setSavedCover(null); setCoverFile(null); setCoverPreview(null) }
      if (!loadedCourse) { setCreatedCourse(result); onCreated?.(result.id, next ?? step) }
      setBaseline(JSON.stringify(draft))
      setSavedCoverMode(coverMode)
      setSaved(true)
      if (next) { setStep(next); if (course) onStepChange?.(next) }
      return true
    } catch (e) { setError(errorText(e)); return false }
    finally { setBusy(false) }
  }
  async function choose(next: Step) {
    if (busy) return
    if (dirty || !course) await save(next)
    else { setStep(next); onStepChange?.(next) }
  }
  async function publish() {
    if (!course || !(await save())) return
    setBusy(true)
    try { await update.mutateAsync({ status: 'PUBLISHED' }); toast.success('Curso publicado en el catálogo') }
    catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const publication = course?.publication
  const completedChecks = publication?.checks.filter(c => c.complete).length ?? 0
  const totalChecks = publication?.checks.length ?? 8
  const previewCourse = { ...course, ...draft, coverUrl:coverDisplayUrl, title: draft.title || 'Tu próximo curso', price: Number(draft.price) || 0, owner: course?.owner ?? { name: ownerName ?? 'Tu organización' }, learningObjectives: tidy(draft.learningObjectives), requirements: tidy(draft.requirements), targetAudience: tidy(draft.targetAudience) }

  return <div className="course-authoring">
    <header className="course-authoring-header">
      <div><Button variant="ghost" size="sm" onClick={async () => { if (!dirty || await save()) onClose() }} disabled={busy}><ArrowLeft /> Volver a cursos</Button><p>{course?.owner.name ?? ownerName} <span>/ Estudio de cursos</span></p><h1>{course ? course.title : 'Diseña tu próximo curso'}</h1></div>
      <div className="course-authoring-actions"><span className="course-save-state" role="status">{busy ? 'Guardando…' : saved ? 'Cambios guardados' : dirty ? 'Cambios sin guardar' : course ? 'Curso guardado' : 'Nuevo borrador'}{course?.status === 'PUBLISHED' ? ' · Publicado' : ''}</span><Button variant="outline" onClick={() => setPreview(true)}><Eye /> Vista previa</Button><Button disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="animate-spin" /> : <Save />} {course?.status === 'PUBLISHED' ? 'Guardar cambios' : 'Guardar borrador'}</Button></div>
    </header>
    <div className="course-authoring-layout">
      <aside className="course-authoring-nav"><p>CONSTRUYE TU CURSO</p><nav aria-label="Pasos de creación del curso">{STEPS.map((s, i) => <button type="button" key={s.id} aria-current={step === s.id ? 'step' : undefined} onClick={() => void choose(s.id)} disabled={busy}><span>{step === s.id ? <s.icon /> : String(i + 1).padStart(2, '0')}</span><span><strong>{s.title}</strong><small>{s.detail}</small></span></button>)}</nav>
        <div className="course-readiness"><span>{completedChecks}/{totalChecks} comprobaciones</span><div role="progressbar" aria-label="Preparación para publicar" aria-valuemin={0} aria-valuemax={totalChecks} aria-valuenow={completedChecks}><i style={{ width: `${completedChecks / totalChecks * 100}%` }} /></div><p>Guarda cada sección. Puedes continuar otro día con tu borrador.</p></div>
      </aside>
      <main className="course-authoring-main">
        <div className="course-editor-heading"><span>PASO {String(index + 1).padStart(2, '0')} / 06</span><h2>{STEPS[index].title}</h2><p>{step === 'presentation' ? 'Ayuda a las personas a entender qué ofrece tu curso antes de inscribirse.' : STEPS[index].detail}</p></div>
        {error && <p className="course-authoring-error" role="alert">{error}</p>}
        <fieldset className="course-editor-fields" disabled={busy}>
          {step === 'presentation' && <>
            <Field id="course-title" label="Título del curso" hint="Un nombre concreto que explique el tema y el resultado."><Input id="course-title" value={draft.title} maxLength={200} placeholder="Ej. Operación y mantenimiento de bombas centrífugas" onChange={e => set('title', e.target.value)} /></Field>
            <Field id="course-subtitle" label="Subtítulo"><Input id="course-subtitle" value={draft.subtitle} maxLength={240} placeholder="Qué aprenderá y cómo lo aplicará el participante" onChange={e => set('subtitle', e.target.value)} /></Field>
            <div className="course-field-grid"><Field id="course-category" label="Categoría"><select id="course-category" value={draft.category} onChange={e => set('category', e.target.value)}>{[...new Set([...CATEGORIES, draft.category])].map(c => <option key={c}>{c}</option>)}</select></Field><Field id="course-language" label="Idioma"><select id="course-language" value={draft.language} onChange={e => set('language', e.target.value)}><option value="es">Español</option><option value="en">Inglés</option><option value="pt">Portugués</option></select></Field></div>
            <Field id="course-description" label="Descripción del curso" hint={`${draft.description.trim().length}/4000 caracteres. Mínimo 80 para publicar.`}><Textarea id="course-description" rows={6} value={draft.description} maxLength={4000} placeholder="Explica el contenido, las actividades y su aplicación en el trabajo." onChange={e => set('description', e.target.value)} /></Field>
            <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 text-sm font-semibold">Portada del curso</legend><div className="flex flex-wrap gap-4 text-sm">{([['upload','Subir imagen'],['url','Usar enlace'],['none','Sin portada']] as const).map(([mode,label]) => <label key={mode} className="flex items-center gap-2"><input type="radio" name="cover-mode" checked={coverMode===mode} onChange={() => {setCoverMode(mode);setSaved(false)}} />{label}</label>)}</div>
              {coverMode === 'upload' && <Field id="course-cover-file" label="Imagen de portada" hint="JPG, PNG o WebP, máximo 5 MB. Se guardará al guardar el curso."><Input id="course-cover-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={e => { const file=e.target.files?.[0] ?? null; if(file && file.size>5*1024*1024){setError('La portada admite imágenes de hasta 5 MB.');return} setCoverFile(file);setCoverPreview(file?URL.createObjectURL(file):null);setSaved(false) }} /></Field>}
              {coverMode === 'url' && <Field id="course-cover" label="Portada (URL de imagen)" hint="Debe ser un enlace directo y público a la imagen. Las páginas de descarga pueden bloquear su visualización."><Input id="course-cover" type="url" value={draft.coverUrl} placeholder="https://…/portada.jpg" onChange={e => set('coverUrl', e.target.value)} /></Field>}
              {coverDisplayUrl && <CourseCover src={coverDisplayUrl} alt="Vista previa de la portada" className="aspect-video w-full rounded-xl" showError />}
            </fieldset>
            <Field id="course-promo" label="Video de presentación (opcional)" hint="Un enlace público de YouTube, Vimeo o un video directo para presentar el curso."><Input id="course-promo" type="url" value={draft.promoVideoUrl} placeholder="https://…" onChange={e => set('promoVideoUrl', e.target.value)} /></Field>
          </>}
          {step === 'audience' && <>
            <StringList title="Qué aprenderán" hint="Describe resultados observables: qué podrán hacer al completar el curso." values={draft.learningObjectives} onChange={v => set('learningObjectives', v)} />
            <StringList title="A quién está dirigido" hint="Indica los perfiles o funciones que aprovecharán esta formación." values={draft.targetAudience} onChange={v => set('targetAudience', v)} />
            <StringList title="Requisitos previos" hint="Conocimientos, herramientas o experiencia necesaria. Puedes dejarlo vacío si no hay requisitos." values={draft.requirements} onChange={v => set('requirements', v)} />
          </>}
          {step === 'curriculum' && (course ? <Curriculum course={course} /> : <div className="course-empty"><Layers3 /><h3>Primero guarda tu borrador</h3><p>Después podrás crear módulos, añadir lecciones y subir sus videos.</p><Button onClick={() => void save('curriculum')}>Guardar y preparar el programa</Button></div>)}
          {step === 'instructor' && <>
            <div className="rounded-xl border border-border bg-muted p-4 space-y-3"><p className="text-sm">{course?.instructorProfileId ? 'Este curso utiliza un perfil de instructor. Su nombre, foto y biograf?a se actualizan desde el portal de Cursos.' : 'Gestiona tu nombre, foto y biograf?a en Mi perfil de instructor del portal de Cursos. Despu?s puedes vincular ese perfil aqu?.'}</p>{course ? <Button type="button" variant="outline" disabled={linkInstructor.isPending || busy} onClick={async () => {if (!(await save())) return; try {const result = await linkInstructor.mutateAsync(!!course.instructorProfileId);setDraft(d => ({...d,instructorName:result.instructorName ?? '',instructorBio:result.instructorBio ?? ''}));toast.success(result.instructorProfileId ? 'Perfil vinculado al curso' : 'Perfil desvinculado')} catch(e) {setError(errorText(e))}}}>{course.instructorProfileId ? 'Desvincular perfil' : 'Vincular mi perfil'}</Button> : <p className="text-xs">Guarda el borrador para vincular tu perfil.</p>}</div>

            <Field id="course-instructor" label="Nombre del instructor"><Input id="course-instructor" disabled={!!course?.instructorProfileId} value={draft.instructorName} maxLength={160} placeholder="Nombre de quien dicta el curso" onChange={e => set('instructorName', e.target.value)} /></Field>
            <Field id="course-bio" label="Experiencia y presentación"><Textarea id="course-bio" disabled={!!course?.instructorProfileId} rows={6} value={draft.instructorBio} maxLength={4000} placeholder="Cuenta su experiencia en el tema y su enfoque al enseñar." onChange={e => set('instructorBio', e.target.value)} /></Field>
            <Field id="course-level" label="Nivel de experiencia del participante"><select id="course-level" value={draft.level} onChange={e => set('level', e.target.value as Draft['level'])}><option value="BASIC">Básico</option><option value="INTERMEDIATE">Intermedio</option><option value="ADVANCED">Avanzado</option></select></Field>
          </>}
          {step === 'pricing' && <>
            <div className="course-field-grid"><Field id="course-price" label="Precio del curso" hint="0 = gratis. Hasta dos decimales."><Input id="course-price" type="number" min={0} step="0.01" value={draft.price} onChange={e => set('price', e.target.value)} /></Field><Field id="course-currency" label="Moneda"><select id="course-currency" value={draft.currency} onChange={e => set('currency', e.target.value)}>{[...new Set(['USD', 'VES', 'PEN', 'CLP', 'ARS', 'EUR', draft.currency])].map(c => <option key={c}>{c}</option>)}</select></Field></div>
            <label className="course-certificate"><Award /><span><strong>Certificado verificable</strong><small>Se emite cuando el alumno completa todas las lecciones.</small></span><input type="checkbox" checked={draft.certificate} onChange={e => set('certificate', e.target.checked)} /></label>
            <p className="course-price-note">El precio se muestra en el catálogo. La inscripción sigue siendo inmediata: el ecosistema todavía no procesa pagos.</p>
          </>}
          {step === 'review' && <>
            <CoursePreview course={previewCourse} />
            <div className="course-publication-checks"><h3>Antes de publicar</h3><p>Estas comprobaciones se hacen sobre la última versión guardada.</p>{publication?.checks.map(check => <div key={check.id} data-complete={check.complete}>{check.complete ? <CheckCircle2 /> : <Circle />}<span>{check.label}</span></div>) ?? <p>Guarda el borrador para ver las comprobaciones.</p>}</div>
            {course && <Button className="course-publish-button" disabled={busy || update.isPending || !publication?.ready || dirty || course.status === 'PUBLISHED'} onClick={() => void publish()}><Send />{course.status === 'PUBLISHED' ? 'El curso ya está publicado' : 'Publicar curso'}</Button>}
          </>}
        </fieldset>
        <footer className="course-editor-footer"><Button variant="ghost" disabled={index === 0 || busy} onClick={() => void choose(STEPS[index - 1].id)}><ArrowLeft /> Anterior</Button><Button disabled={busy} onClick={() => void save(STEPS[Math.min(index + 1, STEPS.length - 1)].id)}><Save />{index === STEPS.length - 1 ? 'Guardar cambios' : 'Guardar y continuar'}{index < STEPS.length - 1 && <ArrowRight />}</Button></footer>
      </main>
    </div>
    {preview && <Dialog open onOpenChange={setPreview}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Vista previa del curso</DialogTitle><DialogDescription>Vista previa de la ficha. En un curso ya publicado, los cambios se reflejan al guardarlos.</DialogDescription></DialogHeader><CoursePreview course={previewCourse} />{draft.promoVideoUrl && <LessonVideo courseId={course?.id ?? ''} lesson={{ id: 'promo', title: 'Presentación', content: null, position: 0, durationMinutes: 0, videoUrl: draft.promoVideoUrl, completed: false }} />}<ol className="course-preview-outline">{course?.sections?.map(s => <li key={s.id}><strong>{s.title}</strong><ul>{course.lessons.filter(l => l.sectionId === s.id).map(l => <li key={l.id}>{l.title}</li>)}</ul></li>)}</ol></DialogContent></Dialog>}
  </div>
}

function CoursePreview({ course }: { course: { title: string; subtitle?: string | null; description: string | null; category?: string; language?: string; instructorName: string | null; coverUrl?: string | null; price: number; currency: string; owner: {name: string}; learningObjectives?: string[]; targetAudience?: string[]; requirements?: string[] } }) {
  return <article className="course-student-preview"><div className="course-student-preview-cover">{course.coverUrl ? <CourseCover src={course.coverUrl} className="absolute inset-0 size-full" /> : <ImagePlus />}<span>{course.category ?? 'General'}</span></div><div><p>{course.owner.name} · {course.language === 'en' ? 'Inglés' : course.language === 'pt' ? 'Portugués' : 'Español'}</p><h3>{course.title}</h3>{course.subtitle && <p className="course-preview-subtitle">{course.subtitle}</p>}<p>{course.instructorName || 'Instructor por definir'}</p><strong>{course.price > 0 ? `${course.currency} ${course.price.toFixed(2)}` : 'Gratis'}</strong>{course.description && <p className="course-preview-description">{course.description}</p>}{!!course.learningObjectives?.length && <><h4>Qué aprenderás</h4><ul>{course.learningObjectives.map((v, i) => <li key={i}><Check />{v}</li>)}</ul></>}{!!course.targetAudience?.length && <><h4>Dirigido a</h4><ul>{course.targetAudience.map((v, i) => <li key={i}>{v}</li>)}</ul></>}{!!course.requirements?.length && <><h4>Requisitos</h4><ul>{course.requirements.map((v, i) => <li key={i}>{v}</li>)}</ul></>}</div></article>
}

function Curriculum({ course }: { course: CourseDetail }) {
  const sections = useCourseSections(course.id)
  const removeLesson = useDeleteLesson(course.id)
  const moveLesson = useUpdateLesson(course.id)
  const [sectionForm, setSectionForm] = useState<CourseSection | 'new' | null>(null)
  const [sectionTitle, setSectionTitle] = useState('')
  const [sectionDescription, setSectionDescription] = useState('')
  const [lessonForm, setLessonForm] = useState<{lesson?: Lesson; sectionId?: string | null} | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{kind: 'section' | 'lesson'; id: string; title: string} | null>(null)
  const busy = sections.add.isPending || sections.update.isPending || sections.remove.isPending || removeLesson.isPending || moveLesson.isPending
  const groups: Array<CourseSection & {unassigned?: boolean}> = [...(course.sections ?? []), ...(course.lessons.some(l => !l.sectionId) ? [{id: '', title: 'Lecciones sin módulo', description: null, position: 999, unassigned: true}] : [])]
  const run = async (action: () => Promise<unknown>) => { try { await action(); return true } catch (e) { toast.error(errorText(e)); return false } }
  const openSection = (section: CourseSection | 'new') => { setSectionForm(section); setSectionTitle(section === 'new' ? '' : section.title); setSectionDescription(section === 'new' ? '' : section.description ?? '') }
  return <div className="course-curriculum"><div className="course-curriculum-toolbar"><p>{course.sections?.length ?? 0} módulos · {course.lessons.length} lecciones</p><Button variant="outline" onClick={() => openSection('new')}><Plus /> Agregar módulo</Button></div>
    {groups.length === 0 && <p className="course-empty">Crea tu primer módulo y organiza sus lecciones.</p>}
    {groups.map((section, i) => { const lessons = course.lessons.filter(l => (l.sectionId ?? '') === section.id); return <section className="course-module" key={section.id}><header><span className="course-module-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3>{section.description && <p>{section.description}</p>}</div>{!section.unassigned && <div className="course-module-controls"><Button variant="ghost" size="icon" aria-label={`Subir módulo ${section.title}`} disabled={i === 0 || busy} onClick={() => void run(() => sections.update.mutateAsync({id: section.id, position: i - 1}))}><ArrowUp /></Button><Button variant="ghost" size="icon" aria-label={`Bajar módulo ${section.title}`} disabled={i >= (course.sections?.length ?? 0) - 1 || busy} onClick={() => void run(() => sections.update.mutateAsync({id: section.id, position: i + 1}))}><ArrowDown /></Button><Button variant="ghost" size="icon" aria-label={`Editar módulo ${section.title}`} onClick={() => openSection(section)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Eliminar módulo ${section.title}`} disabled={lessons.length > 0 || busy} title={lessons.length ? 'Mueve sus lecciones antes de eliminar el módulo' : undefined} onClick={() => setDeleting({kind: 'section', id: section.id, title: section.title})}><Trash2 /></Button></div>}</header>
      <ol>{lessons.map((lesson, n) => <li key={lesson.id}><BookOpen /><div><strong>{lesson.title}</strong><small>{lesson.video ? lesson.video.status === 'READY' ? 'Video listo' : lesson.video.status === 'FAILED' ? 'Error de video: edita y vuelve a subirlo' : 'Preparando video…' : lesson.videoUrl ? 'Video externo' : lesson.content ? 'Lección de texto' : 'Sin contenido'} · {lesson.durationMinutes} min</small></div><div className="course-lesson-controls"><Button size="icon" variant="ghost" aria-label={`Subir lección ${lesson.title}`} disabled={n === 0 || busy} onClick={() => void run(() => moveLesson.mutateAsync({id: lesson.id, position: lessons[n - 1].position}))}><ArrowUp /></Button><Button size="icon" variant="ghost" aria-label={`Bajar lección ${lesson.title}`} disabled={n === lessons.length - 1 || busy} onClick={() => void run(() => moveLesson.mutateAsync({id: lesson.id, position: lessons[n + 1].position}))}><ArrowDown /></Button>{(lesson.video || lesson.videoUrl) && <Button size="icon" variant="ghost" aria-label={`Ver video de ${lesson.title}`} onClick={() => setVideo(lesson.id)}><Eye /></Button>}<Button size="icon" variant="ghost" aria-label={`Editar lección ${lesson.title}`} onClick={() => setLessonForm({lesson, sectionId: section.id || null})}><Settings2 /></Button><Button size="icon" variant="ghost" aria-label={`Eliminar lección ${lesson.title}`} disabled={busy} onClick={() => setDeleting({kind:'lesson',id:lesson.id,title:lesson.title})}><Trash2 /></Button></div></li>)}</ol>
      <Button variant="ghost" onClick={() => setLessonForm({sectionId: section.id || null})}><Plus /> Agregar lección</Button>
    </section> })}
    {sectionForm && <Dialog open onOpenChange={open => { if (!open) setSectionForm(null) }}><DialogContent><DialogHeader><DialogTitle>{sectionForm === 'new' ? 'Nuevo módulo' : 'Editar módulo'}</DialogTitle><DialogDescription>Agrupa lecciones que comparten un objetivo de aprendizaje.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={async e => { e.preventDefault(); const input = {title: sectionTitle.trim(), description: sectionDescription.trim() || null}; if (await run(() => sectionForm === 'new' ? sections.add.mutateAsync(input) : sections.update.mutateAsync({id: sectionForm.id, ...input}))) setSectionForm(null) }}><Field id="module-title" label="Título del módulo"><Input id="module-title" value={sectionTitle} required maxLength={200} onChange={e => setSectionTitle(e.target.value)} /></Field><Field id="module-description" label="Descripción (opcional)"><Textarea id="module-description" value={sectionDescription} maxLength={2000} onChange={e => setSectionDescription(e.target.value)} /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setSectionForm(null)}>Cancelar</Button><Button disabled={busy || !sectionTitle.trim()}>Guardar módulo</Button></DialogFooter></form></DialogContent></Dialog>}
    {lessonForm && <LessonFormDialog courseId={course.id} lesson={lessonForm.lesson} sections={course.sections} initialSectionId={lessonForm.sectionId} onClose={() => setLessonForm(null)} />}
    <VideoPreviewDialog courseId={course.id} lesson={course.lessons.find(l => l.id === video) ?? null} onClose={() => setVideo(null)} />
    {deleting && <Dialog open onOpenChange={open => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Eliminar {deleting.kind === 'section' ? 'módulo' : 'lección'}</DialogTitle><DialogDescription>Se eliminará «{deleting.title}». Las lecciones que ya tienen alumnos que las completaron se conservan.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (await run(() => deleting.kind === 'section' ? sections.remove.mutateAsync(deleting.id) : removeLesson.mutateAsync(deleting.id))) setDeleting(null) }}>Eliminar</Button></DialogFooter></DialogContent></Dialog>}
  </div>
}
