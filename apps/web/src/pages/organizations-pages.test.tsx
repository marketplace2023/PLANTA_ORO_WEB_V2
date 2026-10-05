import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contractor, ContractorDetail, Listing, Provider, ProviderDetail, ServiceItem } from '@/features/organizations/use-organizations'
import { FAMILIES, page } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { ContractorManagePage } from './contractor-manage-page'
import { MarketplacePage } from './marketplace-page'
import { ProfessionalsPage } from './professionals-page'
import { ProviderManagePage } from './provider-manage-page'
import { ProvidersPage } from './providers-page'

const auth = vi.hoisted(() => ({ user: null as null | { id: string; isGlobalAdmin: boolean }, status: 'anonymous' as string }))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: auth.user, status: auth.status }) }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ permissions: [], currentPlant: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const STAGES = [
  { id: 's6', code: 'D06', name: 'Molienda Primaria', sequenceDefault: 6, description: null, stageGroup: 'MOLIENDA', colorToken: null },
  { id: 's11', code: 'D11', name: 'Lixiviación', sequenceDefault: 11, description: null, stageGroup: 'LIXIVIACION', colorToken: null },
]
const tag = (code: string, name: string) => ({ code, name })

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'l1',
  title: 'Placa de revestimiento SAG',
  description: 'Aleación Cr-Mo',
  price: 15360,
  currency: 'USD',
  availability: 'IN_STOCK',
  stockText: '3 juegos',
  imageUrl: null,
  status: 'ACTIVE',
  isFeatured: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  family: tag('MOLINOS', 'Molinos'),
  type: null,
  model: null,
  provider: { id: 'p1', name: 'Repuestos Andinos', verified: true, rating: 4.7, countryCode: 'PE' },
  stages: [tag('D06', 'Molienda Primaria')],
  ...over,
})

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'p1',
  organizationName: 'Repuestos Andinos',
  countryCode: 'PE',
  city: 'Lima',
  description: 'Distribuidor de repuestos',
  logoUrl: null,
  certifications: ['ISO 9001'],
  status: 'ACTIVE',
  verified: true,
  rating: 4.7,
  website: 'https://andinos.test',
  contactEmail: 'ventas@andinos.test',
  stages: [tag('D06', 'Molienda Primaria')],
  families: [tag('MOLINOS', 'Molinos')],
  activeListings: 2,
  ...over,
})
const providerDetail = (over: Partial<ProviderDetail> = {}): ProviderDetail => ({ ...provider(), taxId: 'A-1', canManage: true, myRole: 'OWNER', ...over })

const contractor = (over: Partial<Contractor> = {}): Contractor => ({
  id: 'c1',
  organizationName: 'Mecánica Minera',
  countryCode: 'PE',
  city: 'Arequipa',
  description: null,
  logoUrl: null,
  certifications: ['OSHA'],
  availability: 'AVAILABLE',
  status: 'ACTIVE',
  verified: false,
  rating: null,
  website: null,
  contactEmail: null,
  stages: [tag('D06', 'Molienda Primaria')],
  specialties: ['MECANICA'],
  ...over,
})
const contractorDetail = (over: Partial<ContractorDetail> = {}): ContractorDetail => ({
  ...contractor(),
  taxId: 'C-1',
  canManage: true,
  myRole: 'OWNER',
  services: [{ id: 'sv1', name: 'Alineación láser', description: null, serviceType: 'MECANICA', status: 'ACTIVE', stages: [tag('D06', 'Molienda Primaria')] }],
  ...over,
})
const service = (): ServiceItem => ({
  id: 'sv1',
  name: 'Alineación láser',
  description: 'Motor-reductor-molino',
  serviceType: 'MECANICA',
  stages: [tag('D06', 'Molienda Primaria')],
  contractor: { id: 'c1', name: 'Mecánica Minera', verified: true, rating: 4.6, availability: 'AVAILABLE', city: 'Arequipa', countryCode: 'PE', certifications: ['OSHA'] },
})

type Reply = { status?: number; body?: unknown }
function setup(routes: Record<string, Reply> = {}) {
  return mockApi({
    'GET /stages/catalog': { body: STAGES },
    'GET /catalog/families': { body: FAMILIES },
    'GET /marketplace/listings': { body: page([listing(), listing({ id: 'l2', title: 'Rotor a medida', price: null, isFeatured: false, availability: 'ON_REQUEST', provider: { id: 'p2', name: 'Otra', verified: false, rating: null, countryCode: 'CL' } })]) },
    'GET /providers': { body: page([provider(), provider({ id: 'p2', organizationName: 'Sin calificar', rating: null, verified: false, activeListings: 1 })]) },
    'GET /providers/mine': { body: [] },
    'GET /contractors/mine': { body: [] },
    'GET /professional-services': { body: page([service()]) },
    'GET /professional-services/specialties': { body: ['INSTRUMENTACION', 'MECANICA'] },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const calls = (m: Mock, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: Mock, method: string, path: string) => JSON.parse(calls(m, path, method).at(-1)!.init.body as string)

const render = (ui: React.ReactElement, path: string, route: string) =>
  renderWithProviders(
    <Routes>
      <Route path={path} element={ui} />
    </Routes>,
    { route },
  )

beforeEach(() => {
  auth.user = null
  auth.status = 'anonymous'
})
afterEach(() => vi.unstubAllGlobals())

describe('Marketplace', () => {
  it('muestra tarjetas con precio, disponibilidad, proveedor y etapas; "a cotizar" cuando no hay precio', async () => {
    setup()
    render(<MarketplacePage />, '/marketplace', '/marketplace')
    const card = (await screen.findByText('Placa de revestimiento SAG')).closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByText('USD 15,360.00')).toBeInTheDocument()
    expect(within(card).getByText(/En stock · 3 juegos/)).toBeInTheDocument()
    expect(within(card).getByText('Destacado')).toBeInTheDocument()
    expect(within(card).getByText('Verificado')).toBeInTheDocument()
    expect(within(card).getByText('4.7 / 5')).toBeInTheDocument()
    const quoted = screen.getByText('Rotor a medida').closest('[data-slot="card"]') as HTMLElement
    expect(within(quoted).getByText('A cotizar')).toBeInTheDocument()
    expect(within(quoted).getByText('Sin calificaciones')).toBeInTheDocument() // nunca un rating inventado
  })

  it('los filtros viven en la URL y llegan a la API', async () => {
    const m = setup()
    render(<MarketplacePage />, '/marketplace', '/marketplace?stage=D06&priceMax=500')
    await screen.findByText('Placa de revestimiento SAG')
    const q = calls(m, '/marketplace/listings').at(-1)!.query
    expect(q.get('stage')).toBe('D06')
    expect(q.get('priceMax')).toBe('500')
    expect(await screen.findByRole('button', { name: /Quitar filtro Etapa: D06/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Etapa: D06 · Molienda Primaria' }))
    await waitFor(() => expect(calls(m, '/marketplace/listings').at(-1)!.query.get('stage')).toBeNull())
  })

  it('la búsqueda y la disponibilidad se envían al servidor', async () => {
    const m = setup()
    render(<MarketplacePage />, '/marketplace', '/marketplace')
    await userEvent.type(await screen.findByLabelText('Buscar'), 'sello')
    await waitFor(() => expect(calls(m, '/marketplace/listings').at(-1)!.query.get('search')).toBe('sello'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Disponibilidad' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Agotado' }))
    await waitFor(() => expect(calls(m, '/marketplace/listings').at(-1)!.query.get('availability')).toBe('OUT_OF_STOCK'))
  })

  it('sin resultados: con filtros ofrece limpiar; sin filtros explica que aún no hay productos', async () => {
    setup({ 'GET /marketplace/listings': { body: page([]) } })
    const { unmount } = render(<MarketplacePage />, '/marketplace', '/marketplace?family=MOLINOS')
    expect(await screen.findByText('Ningún producto coincide con los filtros')).toBeInTheDocument()
    unmount()
    render(<MarketplacePage />, '/marketplace', '/marketplace')
    expect(await screen.findByText('Aún no hay productos publicados')).toBeInTheDocument()
  })

  it('error con reintentar', async () => {
    setup({ 'GET /marketplace/listings': { status: 500, body: { message: 'x' } } })
    render(<MarketplacePage />, '/marketplace', '/marketplace')
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })

  it('la ficha del producto oculta el contacto a anónimos y lo muestra con sesión', async () => {
    setup({ 'GET /marketplace/listings/l1': { body: listing() }, 'GET /providers/p1': { body: providerDetail({ canManage: false }) } })
    const { unmount } = render(<MarketplacePage />, '/marketplace', '/marketplace?listing=l1')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText(/para ver los datos de contacto/)).toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: /Contactar/ })).not.toBeInTheDocument()
    unmount()

    auth.user = { id: 'u1', isGlobalAdmin: false }
    auth.status = 'authenticated'
    setup({ 'GET /marketplace/listings/l1': { body: listing() }, 'GET /providers/p1': { body: providerDetail({ canManage: false }) } })
    render(<MarketplacePage />, '/marketplace', '/marketplace?listing=l1')
    const link = await screen.findByRole('link', { name: /Contactar al proveedor/ })
    expect(link.getAttribute('href')).toMatch(/^mailto:ventas@andinos\.test\?subject=/)
  })

  it('un producto no visible (404) lo dice', async () => {
    setup({ 'GET /marketplace/listings/l1': { status: 404, body: { message: 'x' } } })
    render(<MarketplacePage />, '/marketplace', '/marketplace?listing=l1')
    expect(await screen.findByText(/no existe o ya no está publicado/)).toBeInTheDocument()
  })
})

describe('Proveedores', () => {
  it('lista con verificación, rating (o "Sin calificaciones") y conteo de productos', async () => {
    setup()
    render(<ProvidersPage />, '/providers', '/providers')
    const card = (await screen.findByRole('button', { name: 'Repuestos Andinos' })).closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByText('Verificado')).toBeInTheDocument()
    expect(within(card).getByText('ISO 9001')).toBeInTheDocument()
    expect(within(card).getByText('2 productos publicados')).toBeInTheDocument()
    const other = screen.getByRole('button', { name: 'Sin calificar' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(other).getByText('Sin calificaciones')).toBeInTheDocument()
    expect(within(other).getByText('1 producto publicado')).toBeInTheDocument()
  })

  it('filtros: etapa, país, rating y verificados llegan a la API', async () => {
    const m = setup()
    render(<ProvidersPage />, '/providers', '/providers?country=CL&ratingMin=4&verified=1&family=MOLINOS')
    await screen.findByRole('button', { name: 'Repuestos Andinos' })
    const q = calls(m, '/providers').at(-1)!.query
    expect([q.get('country'), q.get('ratingMin'), q.get('verified'), q.get('family')]).toEqual(['CL', '4', '1', 'MOLINOS'])
  })

  it('anónimo: invita a iniciar sesión para registrar; con sesión abre el registro y valida', async () => {
    setup()
    const { unmount } = render(<ProvidersPage />, '/providers', '/providers')
    expect(await screen.findByRole('link', { name: /Inicia sesión para registrar/ })).toBeInTheDocument()
    unmount()

    auth.user = { id: 'u1', isGlobalAdmin: false }
    auth.status = 'authenticated'
    const m = setup({ 'POST /providers': { status: 201, body: providerDetail({ status: 'PENDING' }) } })
    render(<ProvidersPage />, '/providers', '/providers')
    await userEvent.click(await screen.findByRole('button', { name: /Registrar mi empresa/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await within(dialog).findByText('Requerido')).toBeInTheDocument()
    expect(calls(m, '/providers', 'POST')).toHaveLength(0)

    await userEvent.type(within(dialog).getByLabelText('Razón social'), 'Mi Empresa SAC')
    await userEvent.type(within(dialog).getByLabelText('Certificaciones'), 'ISO 9001, , OSHA, ISO 9001')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(body(m, 'POST', '/providers')).toEqual({ organizationName: 'Mi Empresa SAC', countryCode: 'PE', certifications: ['ISO 9001', 'OSHA'] }))
  })

  it('errores del servidor por campo (web inválida) aparecen bajo el campo', async () => {
    auth.user = { id: 'u1', isGlobalAdmin: false }
    auth.status = 'authenticated'
    setup({ 'POST /providers': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'website', message: 'URL inválida' }] } } })
    render(<ProvidersPage />, '/providers', '/providers')
    await userEvent.click(await screen.findByRole('button', { name: /Registrar mi empresa/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Razón social'), 'X Corp')
    await userEvent.type(within(dialog).getByLabelText('Sitio web'), 'javascript:alert(1)')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await within(dialog).findByText('URL inválida')).toBeInTheDocument()
  })

  it('mis organizaciones aparecen como accesos directos a su gestión', async () => {
    auth.user = { id: 'u1', isGlobalAdmin: false }
    auth.status = 'authenticated'
    setup({ 'GET /providers/mine': { body: [{ ...provider(), myRole: 'OWNER' }] } })
    render(<ProvidersPage />, '/providers', '/providers')
    expect(await screen.findByRole('link', { name: /Repuestos Andinos/ })).toHaveAttribute('href', '/providers/p1/manage')
  })

  it('ficha: enlaza el correo solo con sesión y ofrece gestionar a quien puede', async () => {
    setup({ 'GET /providers/p1': { body: providerDetail({ contactEmail: null, canManage: false }) } })
    render(<ProvidersPage />, '/providers', '/providers?provider=p1')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText(/para ver el correo de contacto/)).toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: /Gestionar/ })).not.toBeInTheDocument()
    const site = within(sheet).getByRole('link', { name: /Sitio web/ })
    expect(site).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(site).toHaveAttribute('target', '_blank')
  })
})

describe('Servicios profesionales', () => {
  it('ServiceCard: especialidad, contratista, ubicación, disponibilidad, rating y etapas', async () => {
    setup()
    render(<ProfessionalsPage />, '/professionals', '/professionals')
    const card = (await screen.findByText('Alineación láser')).closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByText('Mecanica')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Mecánica Minera' })).toBeInTheDocument()
    expect(within(card).getByText('Arequipa, Perú')).toBeInTheDocument()
    expect(within(card).getByText('Disponible')).toBeInTheDocument()
    expect(within(card).getByText('4.6 / 5')).toBeInTheDocument()
    expect(within(card).getByText('OSHA')).toBeInTheDocument()
  })

  it('filtros: especialidad (poblada desde la API), etapa, ubicación y certificación', async () => {
    const m = setup()
    render(<ProfessionalsPage />, '/professionals', '/professionals')
    await screen.findByText('Alineación láser')
    await userEvent.click(screen.getByRole('combobox', { name: 'Especialidad' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Todos', 'Instrumentacion', 'Mecanica'])
    await userEvent.click(screen.getByRole('option', { name: 'Mecanica' }))
    await waitFor(() => expect(calls(m, '/professional-services').at(-1)!.query.get('specialty')).toBe('MECANICA'))
    await userEvent.type(screen.getByLabelText('Ubicación'), 'Are')
    await waitFor(() => expect(calls(m, '/professional-services').at(-1)!.query.get('location')).toBe('Are'))
  })

  it('abre la ficha del contratista con sus servicios', async () => {
    setup({ 'GET /contractors/c1': { body: contractorDetail({ canManage: false }) } })
    render(<ProfessionalsPage />, '/professionals', '/professionals?contractor=c1')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText('Alineación láser')).toBeInTheDocument()
    expect(within(sheet).getByText('Sin calificaciones')).toBeInTheDocument()
  })

  it('estado vacío', async () => {
    setup({ 'GET /professional-services': { body: page([]) } })
    render(<ProfessionalsPage />, '/professionals', '/professionals')
    expect(await screen.findByText('Aún no hay servicios publicados')).toBeInTheDocument()
  })
})

describe('Gestión de proveedor', () => {
  const route = '/providers/p1/manage'
  const mount = (over: Record<string, Reply> = {}) => {
    const m = setup({
      'GET /providers/p1': { body: providerDetail() },
      'GET /providers/p1/dashboard': { body: { listingsActive: 3, listingsDraft: 2, listingsArchived: 1, featured: 1, onRequestPricing: 1 } },
      'GET /providers/p1/listings': { body: page([listing({ id: 'l9', title: 'Borrador X', status: 'DRAFT', isFeatured: false })]) },
      'GET /providers/p1/members': { body: [{ userId: 'u1', email: 'owner@x.test', firstName: 'Olga', lastName: 'Dueña', role: 'OWNER', createdAt: '2026-09-01T00:00:00.000Z' }] },
      ...over,
    })
    render(<ProviderManagePage />, '/providers/:id/manage', over.__route ? (over.__route as unknown as string) : route)
    return m
  }
  beforeEach(() => {
    auth.user = { id: 'u1', isGlobalAdmin: false }
    auth.status = 'authenticated'
  })

  it('sin sesión pide iniciar sesión', async () => {
    auth.user = null
    auth.status = 'anonymous'
    mount()
    expect(await screen.findByText('Inicia sesión')).toBeInTheDocument()
  })

  it('sin permiso de gestión no muestra el panel', async () => {
    mount({ 'GET /providers/p1': { body: providerDetail({ canManage: false, myRole: null }) } })
    expect(await screen.findByText('Sin acceso a la gestión')).toBeInTheDocument()
  })

  it('panel: indicadores reales y compras como no disponible', async () => {
    mount()
    const card = (t: string) => screen.getByText(t).closest('[data-slot="card"]') as HTMLElement
    await waitFor(() => expect(card('Productos publicados')).toHaveTextContent('3'))
    expect(card('Borradores')).toHaveTextContent('2')
    expect(card('Pedidos')).toHaveTextContent('—')
  })

  it('un proveedor pendiente ve el aviso y no puede crear productos', async () => {
    mount({ 'GET /providers/p1': { body: providerDetail({ status: 'PENDING' }) } })
    expect(await screen.findByText(/pendiente de aprobación: todavía no apareces/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Productos' }))
    expect(await screen.findByRole('button', { name: /Nuevo producto/ })).toBeDisabled()
  })

  it('publicar un borrador envía status ACTIVE y muestra el error del servidor (falta etapa)', async () => {
    const m = mount({ 'PATCH /providers/p1/listings/l9': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'stageCodes', message: 'Indica al menos una etapa para publicar el producto' }] } } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Productos' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar Borrador X' }))
    await waitFor(() => expect(body(m, 'PATCH', '/providers/p1/listings/l9')).toEqual({ status: 'ACTIVE' }))
  })

  it('"Destacar" solo lo ve el administrador del ecosistema', async () => {
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Productos' }))
    await screen.findByText('Borrador X')
    expect(screen.queryByRole('button', { name: /Destacar/ })).not.toBeInTheDocument()
  })

  it('administrador: ve Destacar y los controles de confianza', async () => {
    auth.user = { id: 'admin', isGlobalAdmin: true }
    const m = mount({ 'PATCH /providers/p1': { body: providerDetail() } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Productos' }))
    expect(await screen.findByRole('button', { name: 'Destacar Borrador X' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Perfil' }))
    await userEvent.click(await screen.findByRole('button', { name: /Administrar/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Rating (0 a 5)'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(body(m, 'PATCH', '/providers/p1')).toEqual({ status: 'ACTIVE', verified: true, rating: null }))
  })

  it('el perfil no ofrece controles de confianza a un miembro', async () => {
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Perfil' }))
    expect(await screen.findByRole('button', { name: /Editar perfil/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Administrar/ })).not.toBeInTheDocument()
  })

  it('crear producto: valida y envía precio numérico, familia y etapas', async () => {
    const m = mount({ 'POST /providers/p1/listings': { status: 201, body: listing() } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Productos' }))
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear producto' }))
    expect(await within(dialog).findAllByText('Requerido')).toHaveLength(2) // título y familia
    expect(calls(m, '/providers/p1/listings', 'POST')).toHaveLength(0)

    await userEvent.type(within(dialog).getByLabelText('Título'), 'Rodamiento')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Familia' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Molinos' }))
    await userEvent.type(within(dialog).getByLabelText('Precio'), '12.5')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /D06/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear producto' }))
    await waitFor(() =>
      expect(body(m, 'POST', '/providers/p1/listings')).toEqual({ title: 'Rodamiento', assetFamilyCode: 'MOLINOS', price: 12.5, currency: 'USD', availability: 'ON_REQUEST', stageCodes: ['D06'] }),
    )
  })

  it('miembros: solo el responsable agrega y quita; el servidor rechaza al único responsable', async () => {
    const m = mount({ 'DELETE /providers/p1/members/u1': { status: 409, body: { message: 'No se puede quitar al único responsable de la organización' } } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Miembros' }))
    expect(await screen.findByLabelText('Correo de la persona')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar a Olga Dueña' }))
    await waitFor(() => expect(calls(m, '/providers/p1/members/u1', 'DELETE')).toHaveLength(1))
  })

  it('un miembro sin rol de responsable ve la lista pero no edita', async () => {
    mount({ 'GET /providers/p1': { body: providerDetail({ myRole: 'MEMBER' }) } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Miembros' }))
    expect(await screen.findByText('Olga Dueña')).toBeInTheDocument()
    expect(screen.queryByLabelText('Correo de la persona')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar a/ })).not.toBeInTheDocument()
  })
})

describe('Gestión de contratista', () => {
  beforeEach(() => {
    auth.user = { id: 'u1', isGlobalAdmin: false }
    auth.status = 'authenticated'
  })
  const mount = (over: Record<string, Reply> = {}) => {
    const m = setup({ 'GET /contractors/c1': { body: contractorDetail() }, 'GET /contractors/c1/members': { body: [] }, ...over })
    render(<ContractorManagePage />, '/contractors/:id/manage', '/contractors/c1/manage')
    return m
  }

  it('lista servicios y permite desactivar uno', async () => {
    const m = mount({ 'PATCH /contractors/c1/services/sv1': { body: contractorDetail() } })
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Alineación láser' }))
    await waitFor(() => expect(body(m, 'PATCH', '/contractors/c1/services/sv1')).toEqual({ status: 'INACTIVE' }))
  })

  it('crear servicio valida nombre y especialidad y envía las etapas elegidas', async () => {
    const m = mount({ 'POST /contractors/c1/services': { status: 201, body: contractorDetail() } })
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo servicio/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear servicio' }))
    expect(await within(dialog).findByText('Requerido')).toBeInTheDocument()
    expect(await within(dialog).findByText(/Indica la especialidad/)).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Balanceo')
    await userEvent.type(within(dialog).getByLabelText('Especialidad'), 'Mecánica')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /D11/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear servicio' }))
    await waitFor(() => expect(body(m, 'POST', '/contractors/c1/services')).toEqual({ name: 'Balanceo', serviceType: 'Mecánica', stageCodes: ['D11'] }))
  })

  it('perfil: la disponibilidad se edita; estado y verificación no se ofrecen a un miembro', async () => {
    const m = mount({ 'PATCH /contractors/c1': { body: contractorDetail() } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Perfil' }))
    expect(screen.queryByRole('button', { name: /Administrar/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil y disponibilidad/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Disponibilidad' }))
    await userEvent.click(await screen.findByRole('option', { name: 'No disponible' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(body(m, 'PATCH', '/contractors/c1')).toMatchObject({ availability: 'UNAVAILABLE', certifications: ['OSHA'] }))
    expect(body(m, 'PATCH', '/contractors/c1')).not.toHaveProperty('verified')
    expect(body(m, 'PATCH', '/contractors/c1')).not.toHaveProperty('status')
  })

  it('un contratista pendiente no puede crear servicios', async () => {
    mount({ 'GET /contractors/c1': { body: contractorDetail({ status: 'PENDING' }) } })
    expect(await screen.findByRole('button', { name: /Nuevo servicio/ })).toBeDisabled()
  })

  it('sin permiso de gestión: acceso denegado', async () => {
    mount({ 'GET /contractors/c1': { body: contractorDetail({ canManage: false, myRole: null }) } })
    expect(await screen.findByText('Sin acceso a la gestión')).toBeInTheDocument()
  })
})
