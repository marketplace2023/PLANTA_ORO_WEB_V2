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
    expect(within(card).getByText('Tienda verificada')).toBeInTheDocument()
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
    const link = await screen.findByRole('link', { name: /Contactar al vendedor/ })
    expect(link.getAttribute('href')).toMatch(/^mailto:ventas@andinos\.test\?subject=/)
  })

  it('un producto no visible (404) lo dice', async () => {
    setup({ 'GET /marketplace/listings/l1': { status: 404, body: { message: 'x' } } })
    render(<MarketplacePage />, '/marketplace', '/marketplace?listing=l1')
    expect(await screen.findByText(/no existe o ya no está publicado/)).toBeInTheDocument()
  })
})

describe('Marketplace unificado y rutas antiguas',()=>{
  it('offers the verified-store and individual filters to buyers',async()=>{
    const m=setup()
    render(<MarketplacePage />, '/marketplace','/marketplace')
    await screen.findByText('Placa de revestimiento SAG')
    await userEvent.click(screen.getByRole('combobox',{name:'Tipo de vendedor'}))
    await userEvent.click(await screen.findByRole('option',{name:'Particulares no verificados'}))
    await waitFor(()=>expect(calls(m,'/marketplace/listings').at(-1)!.query.get('sellerType')).toBe('INDIVIDUAL'))
    expect(screen.queryByRole('button',{name:/Registrar/})).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:/Gestionar/})).not.toBeInTheDocument()
  })
  it('browses sellers inside marketplace without registration or management controls',async()=>{
    setup({'GET /providers/p1':{body:providerDetail({canManage:true})}})
    render(<MarketplacePage />, '/marketplace','/marketplace?view=sellers&seller=p1')
    const dialog=await screen.findByRole('dialog')
    await within(dialog).findByText('Tienda verificada')
    expect(within(dialog).queryByRole('link',{name:/Gestionar/})).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button',{name:/Editar/})).not.toBeInTheDocument()
  })
  it('redirects the former directory and retains the verification filter',async()=>{
    const m=setup()
    renderWithProviders(<Routes><Route path="providers" element={<ProvidersPage />}/><Route path="marketplace" element={<MarketplacePage />}/></Routes>,{route:'/providers?verified=0'})
    await screen.findByRole('button',{name:'Sin calificar'})
    expect(calls(m,'/providers').at(-1)!.query.get('verified')).toBe('0')
    expect(screen.getByRole('tab',{name:'Vendedores'})).toHaveAttribute('aria-selected','true')
  })
  it('turns old seller-management links into a read-only profile',async()=>{
    const m=setup({'GET /providers/p1':{body:providerDetail({canManage:true})}})
    renderWithProviders(<Routes><Route path="providers/:id/manage" element={<ProviderManagePage />}/><Route path="marketplace" element={<MarketplacePage />}/></Routes>,{route:'/providers/p1/manage?tab=products'})
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button',{name:/Nuevo producto/})).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:/Gestionar/})).not.toBeInTheDocument()
    expect(m.calls.filter(c=>c.method!=='GET')).toHaveLength(0)
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
