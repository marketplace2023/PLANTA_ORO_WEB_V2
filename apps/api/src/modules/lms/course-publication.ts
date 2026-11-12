type Course = { title: string; description: string | null; instructorName: string | null; learningObjectives: string[]; targetAudience: string[] }
type Lesson = { content: string | null; videoUrl: string | null; video?: { status: string } | null }

/** The same readiness result is used by the editor and by the publication endpoint. */
export function coursePublication(course: Course, lessons: Lesson[], active: boolean) {
  const checks = [
    { id: 'title', label: 'Título del curso definido', complete: course.title.trim().length >= 3 },
    { id: 'description', label: 'Descripción de al menos 80 caracteres', complete: (course.description?.trim().length ?? 0) >= 80 },
    { id: 'instructorName', label: 'Instructor identificado', complete: !!course.instructorName?.trim() },
    { id: 'learningObjectives', label: 'Al menos un objetivo de aprendizaje', complete: course.learningObjectives.length > 0 },
    { id: 'targetAudience', label: 'Público del curso definido', complete: course.targetAudience.length > 0 },
    { id: 'lessons', label: 'Al menos una lección en el temario', complete: lessons.length > 0 },
    { id: 'content', label: 'Todas las lecciones tienen contenido y sus videos están listos', complete: lessons.length > 0 && lessons.every(l => l.video ? l.video.status === 'READY' : !!l.videoUrl || !!l.content?.trim()) },
    { id: 'owner', label: 'Organización habilitada para publicar', complete: active },
  ]
  return { ready: checks.every(c => c.complete), checks }
}
