import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, formBody, jsonBody } from '@/lib/api'

export type Tag = { code: string; name: string }
export type CourseLevel = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED'
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type OwnerType = 'ECOSYSTEM' | 'PROVIDER' | 'CONTRACTOR'

export type CourseCard = {
  id: string
  title: string
  subtitle?: string | null
  category?: string
  language?: string
  learningObjectives?: string[]
  requirements?: string[]
  targetAudience?: string[]
  coverSource?: 'upload' | 'url' | null
  coverUrl?: string | null
  promoVideoUrl?: string | null
  instructorProfileId?: string | null
  instructor?: {id:string;name:string;headline:string | null;bio:string | null;avatarUrl:string | null} | null
  instructorBio?: string | null
  description: string | null
  level: CourseLevel
  durationMinutes: number
  certificate: boolean
  /** Precio que fija quien ofrece el curso; 0 = gratuito. */
  price: number
  currency: string
  instructorName: string | null
  status: CourseStatus
  owner: { type: OwnerType; id: string | null; name: string; verified: boolean }
  stages: Tag[]
  lessonCount: number
  myEnrollment: { status: 'ENROLLED' | 'COMPLETED' | 'DROPPED'; progressPercent: number } | null
  createdAt: string
  /** Solo en el listado de gestión. */
  enrolledCount?: number
}

export type LessonVideo = { id: string; status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'; originalName: string; durationSeconds: number | null; error: string | null }
export type Playback = { positionSeconds: number; durationSeconds: number; watchedSeconds: number }

export type CourseSection = { id: string; title: string; description: string | null; position: number }
export type Publication = { ready: boolean; checks: Array<{id: string; label: string; complete: boolean}> }

export type Lesson = {
  sectionId?: string | null
  video?: LessonVideo | null
  playback?: Playback | null
  playbackSource?: string | null
  id: string
  position: number
  title: string
  durationMinutes: number
  /** null = no visible (hay que inscribirse). */
  content: string | null
  videoUrl: string | null
  completed: boolean
}

export type Enrollment = {
  id: string
  courseId?: string
  status: 'ENROLLED' | 'COMPLETED' | 'DROPPED'
  progressPercent: number
  startedAt: string
  completedAt: string | null
  certificateCode: string | null
}

export type CourseDetail = Omit<CourseCard, 'myEnrollment'> & { canManage: boolean; sections?: CourseSection[]; publication?: Publication; lessons: Lesson[]; myEnrollment: Enrollment | null }

export type MyCourse = {
  id: string
  course: { id: string; title: string; level: CourseLevel; status: CourseStatus; durationMinutes: number }
  status: 'ENROLLED' | 'COMPLETED'
  progressPercent: number
  startedAt: string
  completedAt: string | null
  certificateCode: string | null
}

export type Certificate = {
  code: string
  holder: string
  course: { title: string; level: CourseLevel; durationMinutes: number }
  issuedBy: string
  completedAt: string
}

export type Roster = { total: number; completed: number; items: Array<{ id: string; name: string; email: string; status: string; progressPercent: number; startedAt: string; completedAt: string | null }> }

export type CourseFilters = { category?: string; level?: string; ownerType?: string; maxMinutes?: string; certificate?: string; free?: string; search?: string; sort?: string; page?: string }

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

// Todo cuelga de ['lms', …]: los cursos son globales y se invalidan juntos.
export const useCourses = (filters: CourseFilters, pageSize = 12) =>
  useQuery({ queryKey: ['lms', 'list', filters, pageSize], queryFn: () => api<Page<CourseCard>>(`/courses${toQuery({ ...filters, pageSize })}`), placeholderData: keepPreviousData })

export const useCourse = (id: string | undefined) => useQuery({ queryKey: ['lms', 'course', id], queryFn: () => api<CourseDetail>(`/courses/${id}`), enabled: !!id, retry: false, refetchInterval: (query) => query.state.data?.lessons.some((lesson) => lesson.video?.status === 'PENDING' || lesson.video?.status === 'PROCESSING') ? 3000 : false })

export const useMyLearning = (enabled: boolean) => useQuery({ queryKey: ['lms', 'mine'], queryFn: () => api<MyCourse[]>('/courses/mine'), enabled })

export const useManagedCourses = (owner: { ownerType: OwnerType; ownerId?: string } | null) =>
  useQuery({
    queryKey: ['lms', 'manage', owner],
    queryFn: () => api<Page<CourseCard>>(`/courses/manage${toQuery({ ownerType: owner!.ownerType, ownerId: owner!.ownerId, pageSize: 100 })}`),
    enabled: !!owner,
    retry: false,
  })

export const useRoster = (id: string | undefined, enabled = true) => useQuery({ queryKey: ['lms', 'roster', id], queryFn: () => api<Roster>(`/courses/${id}/enrollments`), enabled: !!id && enabled })

export const useMyCertificate = (id: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: ['lms', 'certificate', id], queryFn: () => api<Certificate>(`/courses/${id}/certificate`), enabled: !!id && enabled, retry: false })

export const useVerifyCertificate = (code: string | undefined) =>
  useQuery({ queryKey: ['lms', 'verify', code], queryFn: () => api<Certificate & { valid: boolean }>(`/certificates/${code}`), enabled: !!code, retry: false })

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['lms'] })
}

export type CourseInput = {
  ownerType: OwnerType; ownerId?: string; title: string; description?: string; level: CourseLevel; instructorName?: string; certificate: boolean;
  price?: number; currency?: string; subtitle?: string | null; category?: string; language?: string;
  learningObjectives?: string[]; requirements?: string[]; targetAudience?: string[]; coverUrl?: string | null; promoVideoUrl?: string | null; instructorBio?: string | null;
}

export function useCreateCourse() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: CourseInput) => api<CourseDetail>('/courses', { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export type CoursePatch = Partial<Omit<CourseInput, 'ownerType' | 'ownerId' | 'description' | 'instructorName'>> & { description?: string | null; instructorName?: string | null; status?: CourseStatus }

export function useUpdateCourse(id: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: CoursePatch) => api<CourseDetail>(`/courses/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
}

export type LessonInput = { sectionId?: string | null; title: string; content?: string; videoUrl?: string; durationMinutes: number }
export type LessonPatch = Partial<Omit<LessonInput, 'content' | 'videoUrl'>> & { content?: string | null; videoUrl?: string | null; position?: number }

export function useAddLesson(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: LessonInput) => api<CourseDetail & { createdLessonId: string }>(`/courses/${courseId}/lessons`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export function useUpdateLesson(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & LessonPatch) => api<CourseDetail>(`/courses/${courseId}/lessons/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useDeleteLesson(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (lessonId: string) => api<CourseDetail>(`/courses/${courseId}/lessons/${lessonId}`, { method: 'DELETE' }), onSuccess: invalidate })
}

export function useEnroll(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: () => api<Enrollment>(`/courses/${courseId}/enrollment`, { method: 'POST' }), onSuccess: invalidate })
}

export function useDrop(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: () => api<void>(`/courses/${courseId}/enrollment`, { method: 'DELETE' }), onSuccess: invalidate })
}

export function useLessonProgress(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ lessonId, done }: { lessonId: string; done: boolean }) => api<Enrollment>(`/courses/${courseId}/lessons/${lessonId}/complete`, { method: done ? 'POST' : 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useUploadLessonVideo(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ lessonId, file, signal }: { lessonId: string; file: File; signal?: AbortSignal }) =>
    api<{ id: string; status: string }>(`/courses/${courseId}/lessons/${lessonId}/video`, { method: 'POST', ...formBody({}, file), signal }), onSuccess: invalidate })
}

export function useRemoveLessonVideo(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (lessonId: string) => api<void>(`/courses/${courseId}/lessons/${lessonId}/video`, { method: 'DELETE' }), onSuccess: invalidate })
}

export function useCourseSections(courseId: string) {
  const invalidate = useInvalidate()
  const add = useMutation({ mutationFn: (input: {title: string; description?: string | null}) => api<CourseDetail>(`/courses/${courseId}/sections`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
  const update = useMutation({ mutationFn: ({id, ...input}: {id: string; title?: string; description?: string | null; position?: number}) => api<CourseDetail>(`/courses/${courseId}/sections/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => api<CourseDetail>(`/courses/${courseId}/sections/${id}`, { method: 'DELETE' }), onSuccess: invalidate })
  return {add, update, remove}
}

export function useUploadCourseCover() {
  const invalidate = useInvalidate()
  return useMutation({mutationFn: ({id,file}: {id:string;file:File}) => api<CourseDetail>(`/courses/${id}/cover`, {method:'POST',...formBody({},file)}),onSuccess:invalidate})
}

export function useLinkInstructorProfile(id: string) {
  const invalidate = useInvalidate()
  return useMutation({mutationFn:(detach: boolean = false)=>api<CourseDetail>(`/courses/${id}/instructor-profile`,{method:detach ? 'DELETE' : 'POST'}),onSuccess:invalidate})
}
