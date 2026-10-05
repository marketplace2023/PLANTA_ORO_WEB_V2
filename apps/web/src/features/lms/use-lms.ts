import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, jsonBody } from '@/lib/api'

export type Tag = { code: string; name: string }
export type CourseLevel = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED'
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type OwnerType = 'ECOSYSTEM' | 'PROVIDER' | 'CONTRACTOR'

export type CourseCard = {
  id: string
  title: string
  description: string | null
  level: CourseLevel
  durationMinutes: number
  certificate: boolean
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

export type Lesson = {
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

export type CourseDetail = Omit<CourseCard, 'myEnrollment'> & { canManage: boolean; lessons: Lesson[]; myEnrollment: Enrollment | null }

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

export type CourseFilters = { stage?: string; level?: string; ownerType?: string; maxMinutes?: string; certificate?: string; search?: string; sort?: string; page?: string }

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

// Todo cuelga de ['lms', …]: los cursos son globales y se invalidan juntos.
export const useCourses = (filters: CourseFilters, pageSize = 12) =>
  useQuery({ queryKey: ['lms', 'list', filters, pageSize], queryFn: () => api<Page<CourseCard>>(`/courses${toQuery({ ...filters, pageSize })}`), placeholderData: keepPreviousData })

export const useCourse = (id: string | undefined) => useQuery({ queryKey: ['lms', 'course', id], queryFn: () => api<CourseDetail>(`/courses/${id}`), enabled: !!id, retry: false })

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

export type CourseInput = { ownerType: OwnerType; ownerId?: string; title: string; description?: string; level: CourseLevel; instructorName?: string; certificate: boolean; stageCodes: string[] }

export function useCreateCourse() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: CourseInput) => api<CourseDetail>('/courses', { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export type CoursePatch = Partial<Omit<CourseInput, 'ownerType' | 'ownerId' | 'description' | 'instructorName'>> & { description?: string | null; instructorName?: string | null; status?: CourseStatus }

export function useUpdateCourse(id: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: CoursePatch) => api<CourseDetail>(`/courses/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
}

export type LessonInput = { title: string; content?: string; videoUrl?: string; durationMinutes: number }
export type LessonPatch = Partial<Omit<LessonInput, 'content' | 'videoUrl'>> & { content?: string | null; videoUrl?: string | null; position?: number }

export function useAddLesson(courseId: string) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: LessonInput) => api<CourseDetail>(`/courses/${courseId}/lessons`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
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
