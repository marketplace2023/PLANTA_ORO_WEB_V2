import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CourseCard, CourseDetail, Lesson, MyCourse } from '@/features/lms/use-lms'
import { FAMILIES, page } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { CertificatePage } from './certificate-page'
import { CourseEditPage } from './course-edit-page'
import { CourseManagePage } from './course-manage-page'
import { CoursePage } from './course-page'
import { CoursesPage } from './courses-page'
import { MyLearningPage } from './my-learning-page'

const auth = vi.hoisted(() => ({ user: null as null | { id: string; isGlobalAdmin: boolean }, status: 'anonymous' as string }))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: auth.user, status: auth.status }) }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ permissions: [], currentPlant: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const STAGES = [
  { id: 's6', code: 'D06', name: 'Molienda Primaria', sequenceDefault: 6, description: null, stageGroup: 'MOLIENDA', colorToken: null },
  { id: 's11', code: 'D11', name: 'Lixiviación', sequenceDefault: 11, description: null, stageGroup: 'LIXIVIACION', colorToken: null },
]
const OID = '11111111-1111-4111-8111-111111111111'

const card = (over: Partial<CourseCard> = {}): CourseCard => ({
  id: 'c1',
  title: 'Seguridad operativa en molienda',
  description: 'LOTO y espacios confinados',
  level: 'BASIC',
  durationMinutes: 75,
  certificate: true,
  price: 0,
  currency: 'USD',
  instructorName: 'Ing. Quispe',
  status: 'PUBLISHED',
  owner: { type: 'ECOSYSTEM', id: null, name: 'Ecosistema FUR', verified: true },
  stages: [{ code: 'D06', name: 'Molienda Primaria' }],
  lessonCount: 3,
  myEnrollment: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
})
const lesson = (over: Partial<Lesson> = {}): Lesson => ({ id: 'l1', position: 0, title: 'Riesgos', durationMinutes: 20, content: null, videoUrl: null, completed: false, ...over })
const detail = (over: Partial<CourseDetail> = {}): CourseDetail => ({
  ...card(),
  myEnrollment: null,
  canManage: false,
  lessons: [lesson(), lesson({ id: 'l2', position: 1, title: 'Bloqueo y etiquetado', durationMinutes: 30 }), lesson({ id: 'l3', position: 2, title: 'Espacios confinados', durationMinutes: 25 })],
  ...over,
})
const enrolled = (over: object = {}) => ({ id: 'e1', status: 'ENROLLED' as const, progressPercent: 0, startedAt: '2026-09-02T10:00:00.000Z', completedAt: null, certificateCode: null, ...over })
const readable = (ls: Lesson[]) => ls.map((l) => ({ ...l, content: `Contenido de ${l.title}`, videoUrl: l.id === 'l1' ? 'https://video.test/v' : null }))

type Reply = { status?: number; body?: unknown }
function setup(routes: Record<string, Reply> = {}) {
  return mockApi({
    'GET /stages/catalog': { body: STAGES },
    'GET /catalog/families': { body: FAMILIES },
    'GET /courses': { body: page([card(), card({ id: 'c2', title: 'Alineación láser', level: 'INTERMEDIATE', certificate: false, owner: { type: 'CONTRACTOR', id: 'k1', name: 'Mecánica Minera', verified: true }, durationMinutes: 45 })]) },
    'GET /providers/mine': { body: [] },
    'GET /contractors/mine': { body: [] },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const calls = (m: Mock, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: Mock, method: string, path: string) => JSON.parse(calls(m, path, method).at(-1)!.init.body as string)
const at = (ui: React.ReactElement, path: string, route: string) =>
  renderWithProviders(
    <Routes>
      <Route path={path} element={ui} />
    </Routes>,
    { route },
  )
const login = (isGlobalAdmin = false) => {
  auth.user = { id: 'u1', isGlobalAdmin }
  auth.status = 'authenticated'
}

beforeEach(() => {
  auth.user = null
  auth.status = 'anonymous'
})
afterEach(() => vi.unstubAllGlobals())

describe('Catálogo de cursos', () => {
  it('CourseCard: nivel, certificado, instructor, ofrece, duración, lecciones y etapas', async () => {
    setup()
    at(<CoursesPage />, '/courses', '/courses')
    const c = (await screen.findByRole('link', { name: 'Seguridad operativa en molienda' })).closest('[data-slot="card"]') as HTMLElement
    expect(within(c).getByText('Básico')).toBeInTheDocument()
    expect(within(c).getByText('Certificado')).toBeInTheDocument()
    expect(within(c).getByText('Ing. Quispe')).toBeInTheDocument()
    expect(within(c).getByText('Ecosistema FUR')).toBeInTheDocument()
    expect(within(c).getByText(/1 h 15 min · 3 lecciones/)).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: 'Ver curso Seguridad operativa en molienda' })).toHaveAttribute('href', '/courses/c1')
  })

  it('los filtros viven en la URL y llegan a la API; se pueden quitar como chips', async () => {
    const m = setup()
    at(<CoursesPage />, '/courses', '/courses?stage=D06&level=ADVANCED&certificate=1&maxMinutes=60')
    await screen.findByText('Alineación láser')
    const q = calls(m, '/courses').at(-1)!.query
    expect([q.get('stage'), q.get('level'), q.get('certificate'), q.get('maxMinutes')]).toEqual(['D06', 'ADVANCED', '1', '60'])
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Nivel: Avanzado' }))
    await waitFor(() => expect(calls(m, '/courses').at(-1)!.query.get('level')).toBeNull())
  })

  it('muestra el precio que fija el facilitador: "Gratis" o la cantidad con su moneda', async () => {
    setup({ 'GET /courses': { body: page([card(), card({ id: 'c2', title: 'Alineación láser', price: 120.5, currency: 'PEN' })]) } })
    at(<CoursesPage />, '/courses', '/courses')
    const free = (await screen.findByRole('link', { name: 'Seguridad operativa en molienda' })).closest('[data-slot="card"]') as HTMLElement
    expect(within(free).getByLabelText('Precio: Gratis')).toBeInTheDocument()
    const paid = screen.getByRole('link', { name: 'Alineación láser' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(paid).getByLabelText('Precio: PEN 120.50')).toHaveTextContent('PEN 120.50')
  })

  it('filtra por precio (gratis / de pago) y ordena por precio: llega al servidor y se quita como chip', async () => {
    const m = setup()
    at(<CoursesPage />, '/courses', '/courses?free=0')
    await screen.findByText('Alineación láser')
    expect(calls(m, '/courses').at(-1)!.query.get('free')).toBe('0')
    expect(screen.getByRole('button', { name: 'Quitar filtro Precio: De pago' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Ordenar' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Menor precio' }))
    await waitFor(() => expect(calls(m, '/courses').at(-1)!.query.get('sort')).toBe('price_asc'))
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Precio: De pago' }))
    await waitFor(() => expect(calls(m, '/courses').at(-1)!.query.get('free')).toBeNull())
  })

  it('búsqueda y orden se envían al servidor', async () => {
    const m = setup()
    at(<CoursesPage />, '/courses', '/courses')
    await userEvent.type(await screen.findByLabelText('Buscar'), 'laser')
    await waitFor(() => expect(calls(m, '/courses').at(-1)!.query.get('search')).toBe('laser'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Ordenar' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Menor duración' }))
    await waitFor(() => expect(calls(m, '/courses').at(-1)!.query.get('sort')).toBe('duration'))
  })

  it('muestra mi progreso en las tarjetas de cursos en los que estoy inscrito', async () => {
    login()
    setup({ 'GET /courses': { body: page([card({ myEnrollment: { status: 'ENROLLED', progressPercent: 33.33 } }), card({ id: 'c2', title: 'Otro', myEnrollment: { status: 'COMPLETED', progressPercent: 100 } })]) } })
    at(<CoursesPage />, '/courses', '/courses')
    expect(await screen.findByRole('progressbar', { name: /Progreso en Seguridad operativa/ })).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByText('Completado')).toBeInTheDocument()
  })

  it('anónimo: sin accesos de gestión; con sesión: Mi aprendizaje; gestores ven sus organizaciones', async () => {
    setup()
    const { unmount } = at(<CoursesPage />, '/courses', '/courses')
    await screen.findByText('Alineación láser')
    expect(screen.queryByRole('link', { name: /Mi aprendizaje/ })).not.toBeInTheDocument()
    unmount()

    login(true)
    setup({ 'GET /providers/mine': { body: [{ id: OID, organizationName: 'Repuestos Andinos' }] } })
    at(<CoursesPage />, '/courses', '/courses')
    expect(await screen.findByRole('link', { name: /Mi aprendizaje/ })).toHaveAttribute('href', '/courses/mine')
    expect(screen.getByRole('link', { name: /Cursos del ecosistema/ })).toHaveAttribute('href', '/courses/manage?owner=ecosystem')
    expect(await screen.findByRole('link', { name: /Cursos de Repuestos Andinos/ })).toHaveAttribute('href', `/courses/manage?owner=provider:${OID}`)
  })

  it('vacío (con y sin filtros) y error con reintentar', async () => {
    setup({ 'GET /courses': { body: page([]) } })
    const a = at(<CoursesPage />, '/courses', '/courses?level=BASIC')
    expect(await screen.findByText('Ningún curso coincide con los filtros')).toBeInTheDocument()
    a.unmount()
    const b = at(<CoursesPage />, '/courses', '/courses')
    expect(await screen.findByText('Aún no hay cursos publicados')).toBeInTheDocument()
    b.unmount()
    setup({ 'GET /courses': { status: 500, body: { message: 'x' } } })
    at(<CoursesPage />, '/courses', '/courses')
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })
})

describe('Curso: temario, inscripción y estudio', () => {
  const open = (c: CourseDetail, extra: Record<string, Reply> = {}) => {
    const m = setup({ 'GET /courses/c1': { body: c }, ...extra })
    at(<CoursePage />, '/courses/:id', '/courses/c1')
    return m
  }

  it('anónimo: ve el temario pero no el contenido; se le invita a iniciar sesión', async () => {
    open(detail())
    expect(await screen.findByRole('heading', { name: 'Seguridad operativa en molienda', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Temario' })).toHaveTextContent('2. Bloqueo y etiquetado')
    expect(screen.getByText(/disponible al inscribirte/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).not.toBeInTheDocument()
  })

  it('el detalle muestra el precio del curso', async () => {
    open(detail({ price: 300, currency: 'USD' }))
    expect(await screen.findByLabelText('Precio: USD 300.00')).toBeInTheDocument()
  })

  it('un curso sin precio se muestra como gratuito', async () => {
    open(detail())
    expect(await screen.findByLabelText('Precio: Gratis')).toBeInTheDocument()
  })

  it('con sesión: se inscribe', async () => {
    login()
    const m = open(detail(), { 'POST /courses/c1/enrollment': { status: 201, body: enrolled() } })
    await userEvent.click(await screen.findByRole('button', { name: 'Inscribirme' }))
    await waitFor(() => expect(calls(m, '/courses/c1/enrollment', 'POST')).toHaveLength(1))
  })

  it('inscrito: lee el contenido, el video es un enlace seguro y marca la lección como completada', async () => {
    login()
    const ls = readable(detail().lessons)
    const m = open(detail({ lessons: ls, myEnrollment: enrolled({ progressPercent: 0 }) }), { 'POST /courses/c1/lessons/l1/complete': { status: 201, body: enrolled({ progressPercent: 33.33 }) } })
    expect(await screen.findByText('Contenido de Riesgos')).toBeInTheDocument()
    const video = screen.getByRole('link', { name: /Ver video/ })
    expect(video).toHaveAttribute('href', 'https://video.test/v')
    expect(video).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByRole('progressbar', { name: 'Tu progreso en el curso' })).toHaveAttribute('aria-valuenow', '0')
    await userEvent.click(screen.getByRole('button', { name: /Marcar como completada/ }))
    await waitFor(() => expect(calls(m, '/courses/c1/lessons/l1/complete', 'POST')).toHaveLength(1))
  })

  it('se abre en la primera lección pendiente y se puede elegir otra del temario', async () => {
    login()
    const ls = readable(detail().lessons).map((l) => (l.id === 'l1' ? { ...l, completed: true } : l))
    open(detail({ lessons: ls, myEnrollment: enrolled({ progressPercent: 33.33 }) }))
    expect(await screen.findByText('Contenido de Bloqueo y etiquetado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Riesgos/ }))
    expect(await screen.findByText('Contenido de Riesgos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled()
  })

  it('un error del servidor al marcar se muestra (toast) y no rompe la pantalla', async () => {
    login()
    const { toast } = await import('sonner')
    open(detail({ lessons: readable(detail().lessons), myEnrollment: enrolled() }), { 'POST /courses/c1/lessons/l1/complete': { status: 409, body: { message: 'Inscríbete en el curso para registrar tu avance' } } })
    await userEvent.click(await screen.findByRole('button', { name: /Marcar como completada/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Inscríbete en el curso para registrar tu avance'))
  })

  it('curso completado: muestra la fecha, enlaza el certificado y no permite deshacer', async () => {
    login()
    const ls = readable(detail().lessons).map((l) => ({ ...l, completed: true }))
    open(detail({ lessons: ls, myEnrollment: enrolled({ status: 'COMPLETED', progressPercent: 100, completedAt: '2026-09-20T15:00:00.000Z', certificateCode: 'FUR-C-ABCDEFGHJK' }) }))
    expect(await screen.findByText(/Completaste este curso el/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver mi certificado/ })).toHaveAttribute('href', '/certificates/FUR-C-ABCDEFGHJK')
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Abandonar/ })).not.toBeInTheDocument()
  })

  it('abandonar conserva el avance; quien abandonó puede retomar', async () => {
    login()
    const m = open(detail({ lessons: readable(detail().lessons), myEnrollment: enrolled({ progressPercent: 33.33 }) }), { 'DELETE /courses/c1/enrollment': { status: 204 } })
    await userEvent.click(await screen.findByRole('button', { name: 'Abandonar curso' }))
    await waitFor(() => expect(calls(m, '/courses/c1/enrollment', 'DELETE')).toHaveLength(1))
  })

  it('"Retomar curso" cuando la inscripción fue abandonada', async () => {
    login()
    open(detail({ myEnrollment: enrolled({ status: 'DROPPED' as never }) }))
    expect(await screen.findByRole('button', { name: 'Retomar curso' })).toBeInTheDocument()
  })

  it('quien gestiona ve el contenido y "Editar curso"; un borrador lo avisa', async () => {
    login()
    open(detail({ canManage: true, status: 'DRAFT', lessons: readable(detail().lessons) }))
    expect(await screen.findByText('Contenido de Riesgos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Editar curso/ })).toHaveAttribute('href', '/courses/c1/edit')
    expect(screen.getByText(/Borrador \(no visible al público\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).not.toBeInTheDocument()
  })

  it('404: mensaje claro con enlace al catálogo', async () => {
    setup({ 'GET /courses/c1': { status: 404, body: { message: 'x' } } })
    at(<CoursePage />, '/courses/:id', '/courses/c1')
    expect(await screen.findByText('Curso no disponible')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver cursos' })).toHaveAttribute('href', '/courses')
  })
})

describe('Mi aprendizaje', () => {
  const item = (over: Partial<MyCourse> = {}): MyCourse => ({
    id: 'e1',
    course: { id: 'c1', title: 'Seguridad operativa', level: 'BASIC', status: 'PUBLISHED', durationMinutes: 75 },
    status: 'ENROLLED',
    progressPercent: 33.33,
    startedAt: '2026-09-02T10:00:00.000Z',
    completedAt: null,
    certificateCode: null,
    ...over,
  })

  it('exige sesión', async () => {
    setup()
    at(<MyLearningPage />, '/courses/mine', '/courses/mine')
    expect(await screen.findByText('Inicia sesión')).toBeInTheDocument()
  })

  it('separa en progreso y completados, con certificado', async () => {
    login()
    setup({ 'GET /courses/mine': { body: [item(), item({ id: 'e2', course: { id: 'c2', title: 'Lixiviación', level: 'INTERMEDIATE', status: 'ARCHIVED', durationMinutes: 120 }, status: 'COMPLETED', progressPercent: 100, completedAt: '2026-09-20T10:00:00.000Z', certificateCode: 'FUR-C-ZZZZZZZZZZ' })] } })
    at(<MyLearningPage />, '/courses/mine', '/courses/mine')
    expect(await screen.findByRole('heading', { name: 'En progreso (1)' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Progreso en Seguridad operativa' })).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByRole('heading', { name: 'Completados (1)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Certificado/ })).toHaveAttribute('href', '/certificates/FUR-C-ZZZZZZZZZZ')
  })

  it('sin cursos: invita a explorar', async () => {
    login()
    setup({ 'GET /courses/mine': { body: [] } })
    at(<MyLearningPage />, '/courses/mine', '/courses/mine')
    expect(await screen.findByText('Aún no estás inscrito en ningún curso')).toBeInTheDocument()
  })
})

describe('Verificación de certificados', () => {
  it('muestra titular, curso, emisor y fecha', async () => {
    setup({ 'GET /certificates/FUR-C-ABCDEFGHJK': { body: { valid: true, code: 'FUR-C-ABCDEFGHJK', holder: 'Lucía Lectora', course: { title: 'Seguridad operativa', level: 'BASIC', durationMinutes: 75 }, issuedBy: 'Ecosistema FUR', completedAt: '2026-09-20T15:00:00.000Z' } } })
    at(<CertificatePage />, '/certificates/:code', '/certificates/FUR-C-ABCDEFGHJK')
    expect(await screen.findByRole('heading', { name: 'Lucía Lectora' })).toBeInTheDocument()
    expect(screen.getByText('Seguridad operativa')).toBeInTheDocument()
    expect(screen.getByText('Ecosistema FUR')).toBeInTheDocument()
    expect(screen.getByText('FUR-C-ABCDEFGHJK')).toBeInTheDocument()
    expect(screen.getByText(/Nivel básico · 1 h 15 min/)).toBeInTheDocument()
  })

  it('código inexistente: lo dice sin inventar nada', async () => {
    setup({ 'GET /certificates/FUR-C-NOPE': { status: 404, body: { message: 'x' } } })
    at(<CertificatePage />, '/certificates/:code', '/certificates/FUR-C-NOPE')
    expect(await screen.findByText('Certificado no encontrado')).toBeInTheDocument()
  })
})

describe('Gestión de cursos', () => {
  const manageRoute = `/courses/manage?owner=provider:${OID}`

  it('exige sesión y una organización válida', async () => {
    setup()
    const a = at(<CourseManagePage />, '/courses/manage', '/courses/manage?owner=ecosystem')
    expect(await screen.findByText('Inicia sesión')).toBeInTheDocument()
    a.unmount()
    login()
    setup()
    at(<CourseManagePage />, '/courses/manage', '/courses/manage?owner=nada')
    expect(await screen.findByText('Organización no indicada')).toBeInTheDocument()
  })

  it('lista todos los estados con inscritos y consulta por propietario', async () => {
    login()
    const m = setup({ 'GET /courses/manage': { body: page([card({ status: 'DRAFT', enrolledCount: 0, title: 'Borrador X' }), card({ id: 'c9', enrolledCount: 7, title: 'Publicado Y' })]) } })
    at(<CourseManagePage />, '/courses/manage', manageRoute)
    const row = (await screen.findByRole('link', { name: 'Publicado Y' })).closest('tr')!
    expect(within(row).getByText('Publicado')).toBeInTheDocument()
    expect(within(row).getByText('7')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: 'Borrador X' }).closest('tr')!).getByText('Borrador')).toBeInTheDocument()
    const q = calls(m, '/courses/manage').at(-1)!.query
    expect([q.get('ownerType'), q.get('ownerId')]).toEqual(['PROVIDER', OID])
  })

  it('sin acceso (403): lo explica', async () => {
    login()
    setup({ 'GET /courses/manage': { status: 403, body: { message: 'No gestionas esta organización' } } })
    at(<CourseManagePage />, '/courses/manage', manageRoute)
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument()
  })

  it('crea un curso: valida el título y envía propietario, nivel, certificado y etapas', async () => {
    login()
    const m = setup({ 'GET /courses/manage': { body: page([]) }, 'POST /courses': { status: 201, body: detail({ id: 'new' }) } })
    at(<CourseManagePage />, '/courses/manage', manageRoute)
    await userEvent.click((await screen.findAllByRole('button', { name: /Nuevo curso/ }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear curso' }))
    expect(await within(dialog).findByText('Requerido')).toBeInTheDocument()
    expect(calls(m, '/courses', 'POST')).toHaveLength(0)
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Curso nuevo')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Nivel' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Avanzado' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Emite certificado/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /D11/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear curso' }))
    await waitFor(() => expect(body(m, 'POST', '/courses')).toEqual({ ownerType: 'PROVIDER', ownerId: OID, title: 'Curso nuevo', level: 'ADVANCED', certificate: true, stageCodes: ['D11'] }))
  })
})

describe('Editor del curso', () => {
  const E = '/courses/c1/edit'
  const mount = (c: CourseDetail, extra: Record<string, Reply> = {}) => {
    const m = setup({ 'GET /courses/c1': { body: c }, ...extra })
    at(<CourseEditPage />, '/courses/:id/edit', E)
    return m
  }
  const mine = (over: Partial<CourseDetail> = {}) => detail({ canManage: true, status: 'DRAFT', lessons: readable(detail().lessons), ...over })

  it('sin permiso de gestión no muestra el editor', async () => {
    login()
    mount(detail({ canManage: false }))
    expect(await screen.findByText('Sin acceso a la edición')).toBeInTheDocument()
  })

  it('lista las lecciones con duración total y orden; no permite subir la primera ni bajar la última', async () => {
    login()
    mount(mine())
    expect(await screen.findByText('Bloqueo y etiquetado')).toBeInTheDocument()
    expect(screen.getByText(/1 h 15 min · 3 lecciones/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir Riesgos' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bajar Espacios confinados' })).toBeDisabled()
  })

  it('reordena con subir/bajar enviando la nueva posición', async () => {
    login()
    const m = mount(mine(), { 'PATCH /courses/c1/lessons/l2': { body: mine() } })
    await userEvent.click(await screen.findByRole('button', { name: 'Subir Bloqueo y etiquetado' }))
    await waitFor(() => expect(body(m, 'PATCH', '/courses/c1/lessons/l2')).toEqual({ position: 0 }))
  })

  it('agrega una lección: valida y envía contenido, enlace y minutos', async () => {
    login()
    const m = mount(mine(), { 'POST /courses/c1/lessons': { status: 201, body: mine() } })
    await userEvent.click(await screen.findByRole('button', { name: /Nueva lección/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar lección' }))
    expect(await within(dialog).findByText('Requerido')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Nueva')
    await userEvent.type(within(dialog).getByLabelText('Contenido'), 'Texto')
    await userEvent.type(within(dialog).getByLabelText('Video (enlace)'), 'https://v.test/1')
    await userEvent.clear(within(dialog).getByLabelText('Duración (minutos)'))
    await userEvent.type(within(dialog).getByLabelText('Duración (minutos)'), '15')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar lección' }))
    await waitFor(() => expect(body(m, 'POST', '/courses/c1/lessons')).toEqual({ title: 'Nueva', content: 'Texto', videoUrl: 'https://v.test/1', durationMinutes: 15 }))
  })

  it('el servidor rechaza un enlace no http(s): se ve bajo el campo y el diálogo sigue abierto', async () => {
    login()
    mount(mine(), { 'POST /courses/c1/lessons': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'videoUrl', message: 'URL inválida' }] } } })
    await userEvent.click(await screen.findByRole('button', { name: /Nueva lección/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Título'), 'X')
    await userEvent.type(within(dialog).getByLabelText('Video (enlace)'), 'javascript:alert(1)')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar lección' }))
    expect(await within(dialog).findByText('URL inválida')).toBeInTheDocument()
  })

  it('eliminar: el rechazo del servidor (lección ya completada) se informa', async () => {
    login()
    const { toast } = await import('sonner')
    mount(mine(), { 'DELETE /courses/c1/lessons/l1': { status: 409, body: { message: 'Esta lección ya fue completada por alumnos; no se puede eliminar' } } })
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Riesgos' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/ya fue completada/)))
  })

  it('publicar envía el estado; si falta una etapa, el motivo del servidor se muestra', async () => {
    login()
    const { toast } = await import('sonner')
    const m = mount(mine(), { 'PATCH /courses/c1': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'stageCodes', message: 'Indique al menos una etapa para publicar el curso' }] } } })
    await userEvent.click(await screen.findByRole('button', { name: /Publicar/ }))
    await waitFor(() => expect(body(m, 'PATCH', '/courses/c1')).toEqual({ status: 'PUBLISHED' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Indique al menos una etapa para publicar el curso'))
  })

  it('un curso publicado ofrece archivar y pasar a borrador, no publicar', async () => {
    login()
    mount(mine({ status: 'PUBLISHED' }))
    expect(await screen.findByRole('button', { name: 'Archivar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pasar a borrador' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Publicar/ })).not.toBeInTheDocument()
  })

  it('alumnado: totales y avance por persona', async () => {
    login()
    const m = setup({
      'GET /courses/c1': { body: mine() },
      'GET /courses/c1/enrollments': { body: { total: 2, completed: 1, items: [{ id: 'e1', name: 'Lucía Lectora', email: 'lector@fur.local', status: 'COMPLETED', progressPercent: 100, startedAt: '2026-09-02T10:00:00.000Z', completedAt: null }, { id: 'e2', name: 'Otro Alumno', email: 'otro@fur.local', status: 'ENROLLED', progressPercent: 33.33, startedAt: '2026-09-03T10:00:00.000Z', completedAt: null }] } },
    })
    void m
    at(<CourseEditPage />, '/courses/:id/edit', `${E}?tab=students`)
    expect(await screen.findByText('2 inscritos · 1 completaron')).toBeInTheDocument()
    const row = screen.getByText('Otro Alumno').closest('tr')!
    expect(within(row).getByText('En curso')).toBeInTheDocument()
    expect(within(row).getByText('33 %')).toBeInTheDocument()
  })
})
