import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetDetail, AssetFur } from '@/features/assets/use-assets'
import { asset, FAMILIES, fur, MODELS, NETWORKS, page, plantDetail, STAGES } from '@/test/assets-fixtures'
import { doc, pdfDownload } from '@/test/documents-fixtures'
import { wo } from '@/test/maintenance-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { AssetFurPage } from './asset-fur-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const FUR_URL = 'GET /plants/revemin-ii/assets/a1/fur'
const VARS_URL = 'GET /catalog/models/m1/variables'

const def = (over: object) => ({
  id: 'v?', code: 'X', label: 'X', unit: null, valueType: 'TEXT', group: null, isKey: false, sortOrder: 0, networkCodes: [], stageCodes: [], assetTypeCodes: [], value: null, defaultValue: null, ...over,
})
// Datos del fabricante del modelo m1 (asset: etapa D06, red FUR-IOT).
const VARIABLES = [
  def({ id: 'v1', code: 'VIB', label: 'Vibración máxima', unit: 'mm/s', valueType: 'NUMBER', group: 'Variables de instrumentación', isKey: true, networkCodes: ['FUR-IOT'], stageCodes: ['D06'], value: 4.5 }),
  def({ id: 'v2', code: 'SENS', label: 'Sensores instalados', valueType: 'LIST', group: 'Variables de instrumentación', sortOrder: 2, networkCodes: ['FUR-IOT'], value: null }),
  def({ id: 'v3', code: 'PWR', label: 'Potencia nominal', unit: 'kW', valueType: 'NUMBER', networkCodes: ['FUR-PTE'], value: 3000 }),
  def({ id: 'v4', code: 'OTRA', label: 'Dato de otra etapa', networkCodes: ['FUR-IOT'], stageCodes: ['D01'], value: 'no debe verse' }),
  def({ id: 'v5', code: 'GEN', label: 'Tensión de suministro', unit: 'kV', valueType: 'NUMBER', group: 'Datos generales', defaultValue: 13.8 }),
  def({ id: 'v6', code: 'PESO', label: 'Peso del equipo', unit: 't', valueType: 'NUMBER', stageCodes: ['D06', 'D07'], value: 42 }),
]

type Reply = { status?: number; body?: unknown; raw?: string | Uint8Array; headers?: Record<string, string> }

function setup(furReply: AssetFur | Reply = fur(), extra: Record<string, Reply> = {}) {
  const reply: Reply = 'status' in furReply ? (furReply as Reply) : { body: furReply }
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    [FUR_URL]: reply,
    [VARS_URL]: { body: VARIABLES },
    'GET /plants/revemin-ii/stages': { body: STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
    'GET /catalog/assets': { body: page(MODELS) },
    'GET /catalog/families': { body: FAMILIES },
    ...extra,
  })
}

const renderFur = () =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="assets" element={<p>Listado de activos</p>} />
        <Route path="assets/:assetId" element={<AssetFurPage />} />
      </Route>
    </Routes>,
    { route: '/plants/revemin-ii/assets/a1' },
  )

describe('Ficha FUR del activo', () => {
  beforeEach(() => {
    state.permissions = []
  })
  afterEach(() => vi.unstubAllGlobals())

  it('cabecera: tag en mono, nombre, estado, criticidad, planta, etapa y código FUR', async () => {
    setup()
    renderFur()

    const header = (await screen.findByRole('heading', { level: 1, name: 'MB-301' })).closest('header')!
    expect(within(header).getByText('Molino de bolas 1')).toBeInTheDocument()
    expect(within(header).getByText('Operativo')).toBeInTheDocument()
    expect(within(header).getByText('Crítica')).toBeInTheDocument()
    expect(within(header).getByText('Planta REVEMIN II')).toBeInTheDocument()
    expect(within(header).getByText('D06')).toBeInTheDocument()
    expect(within(header).getByText('FUR-REV-II-00001')).toBeInTheDocument()
  })

  it('breadcrumb: Planta / Activos / Etapa / Tag (design.md §18)', async () => {
    setup()
    renderFur()
    const nav = await screen.findByRole('navigation', { name: 'breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Planta REVEMIN II' })).toHaveAttribute('href', '/plants/revemin-ii/dashboard')
    expect(within(nav).getByRole('link', { name: 'Activos' })).toHaveAttribute('href', '/plants/revemin-ii/assets')
    expect(within(nav).getByRole('link', { name: 'Molienda Primaria' })).toHaveAttribute('href', '/plants/revemin-ii/assets?stage=D06')
    expect(within(nav).getByText('MB-301')).toHaveAttribute('aria-current', 'page')
  })

  it('tiene las pestañas del activo y, después de Documentos, una por cada red a la que pertenece', async () => {
    setup()
    renderFur()
    await screen.findByRole('heading', { level: 1, name: 'MB-301' })
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Resumen', 'Datos técnicos', 'Mantenimiento', 'Inventario / BOM', 'Documentos', 'FUR-IOT'])
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
  })

  it('Resumen: datos del activo con fechas en formato del diseño y redes', async () => {
    setup()
    renderFur()
    const panel = await screen.findByRole('tabpanel')
    expect(within(panel).getByText('Molino de bolas')).toBeInTheDocument() // tipo
    expect(within(panel).getByText('Metso')).toBeInTheDocument()
    expect(within(panel).getByText('SN-0001')).toBeInTheDocument()
    expect(within(panel).getByText('15 mar 2022')).toBeInTheDocument()
    expect(within(panel).getByText('FUR-IOT')).toBeInTheDocument()
  })

  it('Datos técnicos: especificaciones del modelo y datos técnicos', async () => {
    setup()
    renderFur()
    await userEvent.click(await screen.findByRole('tab', { name: 'Datos técnicos' }))
    const panel = await screen.findByRole('tabpanel')
    expect(within(panel).getByText('powerKw')).toBeInTheDocument()
    expect(within(panel).getByText('3000')).toBeInTheDocument()
    expect(within(panel).getByText('weightT')).toBeInTheDocument()
  })

  describe('Inventario / BOM', () => {
    const INV = {
      compatibleItems: [
        { id: 'i1', sku: 'REV-SAG-PL', name: 'Placa de revestimiento', uom: 'UND', onHand: 2, minStock: 8, isCritical: true, belowMin: true },
        { id: 'i2', sku: 'ROD-6310', name: 'Rodamiento 6310', uom: 'UND', onHand: 14, minStock: 6, isCritical: false, belowMin: false },
      ],
      partsUsed: [{ id: 'i2', sku: 'ROD-6310', name: 'Rodamiento 6310', uom: 'UND', quantity: 3, cost: 128.7 }],
    }

    it('sin inventory.read: mensaje de acceso, sin datos', async () => {
      setup(fur({ inventory: {} }))
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Inventario / BOM' }))
      expect(await screen.findByText('Sin acceso al Inventario')).toBeInTheDocument()
    })

    it('repuestos compatibles con alerta de mínimo (texto, no solo color) y lo consumido con su costo', async () => {
      setup(fur({ inventory: INV, maintenance: { openWorkOrders: 0, partsCost: 128.7, currency: 'USD' } }))
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Inventario / BOM' }))
      const panel = await screen.findByRole('tabpanel')
      const row = within(panel).getByText('Placa de revestimiento').closest('li')!
      expect(within(row).getByText('Bajo mínimo')).toBeInTheDocument()
      expect(within(row).getByText('Crítico')).toBeInTheDocument()
      expect(within(row).getByRole('link', { name: 'REV-SAG-PL' })).toHaveAttribute('href', '/plants/revemin-ii/inventory?tab=stock&item=i1')
      expect(within(panel).getByText('USD 128.70')).toBeInTheDocument()
    })

    it('sin ítems vinculados ni consumos lo dice', async () => {
      setup(fur({ inventory: { compatibleItems: [], partsUsed: [] } }))
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Inventario / BOM' }))
      expect(await screen.findByText(/No hay ítems de inventario vinculados/)).toBeInTheDocument()
      expect(screen.getByText('Este activo aún no ha consumido repuestos.')).toBeInTheDocument()
    })

  })

  describe('pestañas por red (variables del fabricante)', () => {
    const twoNetworks = () =>
      fur({
        networks: [
          { code: 'FUR-PROC', name: 'Procesos', colorToken: 'network-proc' },
          { code: 'FUR-IOT', name: 'IoT / Instrumentación', colorToken: 'network-iot' },
        ],
      })

    it('no hay Telemetría, Historial, Costos ni KPIs', async () => {
      setup()
      renderFur()
      await screen.findByRole('heading', { level: 1, name: 'MB-301' })
      for (const name of ['Telemetría', 'Historial', 'Costos', 'KPIs']) expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument()
    })

    it('una pestaña por red del activo, en el orden de la red', async () => {
      setup(twoNetworks())
      renderFur()
      await screen.findByRole('heading', { level: 1, name: 'MB-301' })
      expect(screen.getAllByRole('tab').map((t) => t.textContent).slice(-2)).toEqual(['FUR-PROC', 'FUR-IOT'])
    })

    it('muestra las variables de esa red que aplican a la etapa: valor, «Sin registrar» y clave', async () => {
      setup()
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'FUR-IOT' }))
      const panel = await screen.findByRole('tabpanel')
      expect(await within(panel).findByText('Vibración máxima')).toBeInTheDocument()
      expect(within(panel).getByText('4,5 mm/s')).toBeInTheDocument()
      expect(within(panel).getByLabelText('Variable clave')).toBeInTheDocument()
      expect(within(panel).getByText('Sensores instalados')).toBeInTheDocument()
      expect(within(panel).getByText('Sin registrar')).toBeInTheDocument()
      // No mezcla datos de otra red, de otra etapa ni las generales.
      expect(within(panel).queryByText('Potencia nominal')).not.toBeInTheDocument()
      expect(within(panel).queryByText('Dato de otra etapa')).not.toBeInTheDocument()
      expect(within(panel).queryByText('Tensión de suministro')).not.toBeInTheDocument()
    })

    it('una red sin variables lo explica', async () => {
      setup(twoNetworks())
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'FUR-PROC' }))
      expect(await screen.findByText(/aún no tiene variables definidas para este activo/)).toBeInTheDocument()
    })

    it('las variables generales (sin red) van en Datos técnicos, con su valor general', async () => {
      setup()
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Datos técnicos' }))
      const panel = await screen.findByRole('tabpanel')
      const general = await within(panel).findByRole('region', { name: 'Variables generales' })
      expect(within(general).getByText('Tensión de suministro')).toBeInTheDocument()
      expect(within(general).getByText('13,8 kV')).toBeInTheDocument()
      expect(within(general).getByText('(general)')).toBeInTheDocument()
      expect(within(general).getByText('Peso del equipo')).toBeInTheDocument() // compartida por etapas D06 y D07
      expect(within(general).queryByText('Vibración máxima')).not.toBeInTheDocument()
    })
  })

  describe('vista de visitante (datos internos omitidos)', () => {
    it('no muestra el número de serie ni los datos técnicos internos', async () => {
      const publicFur = fur({ history: [] })
      // El backend omite estos campos para visitantes: la respuesta pública no los trae.
      const publicAsset: Partial<AssetDetail> = { ...publicFur.asset }
      for (const field of ['serialNumber', 'parentAssetId', 'metadata', 'technicalData'] as const) delete publicAsset[field]
      setup({ ...publicFur, asset: publicAsset as AssetDetail })
      renderFur()

      const panel = await screen.findByRole('tabpanel')
      expect(within(panel).queryByText('Número de serie')).not.toBeInTheDocument()
      expect(within(panel).queryByText('SN-0001')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('tab', { name: 'Datos técnicos' }))
      expect(screen.queryByText('Datos técnicos', { selector: 'h2' })).not.toBeInTheDocument()
    })

    it('sin permisos: no aparecen Editar ni Dar de baja', async () => {
      setup()
      renderFur()
      await screen.findByRole('heading', { level: 1, name: 'MB-301' })
      expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Dar de baja/ })).not.toBeInTheDocument()
    })
  })

  describe('acciones protegidas por permiso', () => {
    it('asset.update ofrece Editar pero no la baja', async () => {
      state.permissions = ['asset.update']
      setup()
      renderFur()
      expect(await screen.findByRole('button', { name: /Editar/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Dar de baja/ })).not.toBeInTheDocument()
    })

    it('un activo dado de baja no ofrece acciones aunque haya permisos', async () => {
      state.permissions = ['asset.update', 'asset.delete']
      setup(fur({}, { status: 'DECOMMISSIONED' }))
      renderFur()
      await screen.findByRole('heading', { level: 1, name: 'MB-301' })
      expect(screen.getByText('Dado de baja')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Dar de baja/ })).not.toBeInTheDocument()
    })

    it('Editar: precarga el activo, el FUR no es editable y el motivo solo aparece al cambiar el estado', async () => {
      state.permissions = ['asset.update']
      const mock = setup(fur(), { 'PATCH /plants/revemin-ii/assets/a1': { body: fur().asset } })
      renderFur()

      await userEvent.click(await screen.findByRole('button', { name: /Editar/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText('Tag')).toHaveValue('MB-301')
      expect(within(dialog).getByText(/El código FUR \(FUR-REV-II-00001\) es permanente/)).toBeInTheDocument()
      expect(within(dialog).queryByLabelText(/Motivo del cambio/)).not.toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Estado' }))
      await userEvent.click(await screen.findByRole('option', { name: 'En reparación' }))
      await userEvent.type(await within(dialog).findByLabelText(/Motivo del cambio/), 'Falla en reductor')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(mock.count('PATCH /plants/revemin-ii/assets/a1')).toBe(1))
      const body = JSON.parse(mock.calls.find((c) => c.method === 'PATCH')!.init.body as string)
      expect(body).toMatchObject({ status: 'REPAIR', statusReason: 'Falla en reductor', stageCode: 'D06', networkCodes: ['FUR-IOT'] })
      expect(body).not.toHaveProperty('furCode')
    })

    describe('baja', () => {
      beforeEach(() => {
        state.permissions = ['asset.delete']
      })

      it('pide confirmación; cancelar no llama al servidor ni navega', async () => {
        const mock = setup()
        renderFur()
        await userEvent.click(await screen.findByRole('button', { name: /Dar de baja/ }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('¿Dar de baja MB-301?')).toBeInTheDocument()

        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(mock.calls.some((c) => c.method === 'DELETE')).toBe(false)
        expect(screen.getByRole('heading', { level: 1, name: 'MB-301' })).toBeInTheDocument() // sigue en la ficha
      })

      it('confirmar da de baja (DELETE) y vuelve al listado', async () => {
        const mock = setup(fur(), { 'DELETE /plants/revemin-ii/assets/a1': { status: 204 } })
        renderFur()
        await userEvent.click(await screen.findByRole('button', { name: /Dar de baja/ }))
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dar de baja' }))

        expect(await screen.findByText('Listado de activos')).toBeInTheDocument()
        expect(mock.count('DELETE /plants/revemin-ii/assets/a1')).toBe(1)
      })

      it('si el backend rechaza (403) lo informa y no navega', async () => {
        setup(fur(), { 'DELETE /plants/revemin-ii/assets/a1': { status: 403, body: { message: 'Falta el permiso asset.delete' } } })
        renderFur()
        await userEvent.click(await screen.findByRole('button', { name: /Dar de baja/ }))
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dar de baja' }))

        expect(await screen.findByText('No tienes permiso para dar de baja activos.')).toBeInTheDocument()
        expect(screen.queryByText('Listado de activos')).not.toBeInTheDocument()
      })
    })
  })

  describe('estados', () => {
    it('activo inexistente o no visible (404): mensaje con salida al listado', async () => {
      setup({ status: 404, body: { message: 'Activo no encontrado' } })
      renderFur()
      expect(await screen.findByText('Activo no encontrado')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver a Activos Físicos' })).toHaveAttribute('href', '/plants/revemin-ii/assets')
    })

    it('error del servidor: reintentar', async () => {
      let fail = true
      setup()
      mockApi({
        'GET /plants/revemin-ii': { body: plantDetail() },
        [FUR_URL]: () => (fail ? { status: 500, body: { message: 'boom' } } : { body: fur() }),
      })
      renderFur()
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'MB-301' })).toBeInTheDocument()
    })
  })

  describe('pestaña Documentos', () => {
    const withDocs = (over = {}) =>
      fur({ documents: [doc(), doc({ id: 'd2', title: 'Plano del molino', documentType: 'PLANO', currentVersion: 1, file: { originalName: 'plano.png', mimeType: 'image/png', sizeBytes: 2048 } })], ...over })

    it('lista los documentos vinculados con tipo, versión, tamaño y enlace al detalle', async () => {
      setup(withDocs())
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Documentos' }))

      const panel = await screen.findByRole('tabpanel')
      expect(within(panel).getByText('2 documento(s) vinculado(s)')).toBeInTheDocument()
      const first = within(panel).getByRole('link', { name: 'Manual de operación MB-301' })
      expect(first).toHaveAttribute('href', '/plants/revemin-ii/documents?doc=d1')
      expect(first.closest('li')).toHaveTextContent('Manuales · v2 · 2.5 MB')
      expect(within(panel).getByRole('link', { name: 'Plano del molino' }).closest('li')).toHaveTextContent('Planos · v1 · 2.0 KB')
      expect(within(panel).getByRole('link', { name: 'Ver en Documentos' })).toHaveAttribute('href', '/plants/revemin-ii/documents?assetId=a1')
    })

    it('descarga directa desde la pestaña (Blob autenticado)', async () => {
      const mock = setup(withDocs(), { 'GET /plants/revemin-ii/documents/d1/download': pdfDownload })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Documentos' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Descargar Manual MB-301 rev B.pdf' }))

      await waitFor(() => expect(click).toHaveBeenCalled())
      expect(mock.calls.some((c) => c.path === '/plants/revemin-ii/documents/d1/download')).toBe(true)
      click.mockRestore()
    })

    it('sin documentos: lo dice, y los visitantes no ven el botón de subir', async () => {
      setup(withDocs({ documents: [] }))
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Documentos' }))
      expect(await screen.findByText('Este activo no tiene documentos vinculados.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Subir documento/ })).not.toBeInTheDocument()
    })

    it('con document.upload se puede subir un documento ya vinculado a este activo', async () => {
      state.permissions = ['document.upload']
      const mock = setup(withDocs({ documents: [] }), {
        'GET /plants/revemin-ii/assets': { body: page([asset()]) },
        'POST /plants/revemin-ii/documents': { status: 201, body: {} },
      })
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Documentos' }))
      await userEvent.click(await screen.findByRole('button', { name: /Subir documento/ }))

      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      expect(await within(dialog).findByRole('checkbox', { name: /MB-301/ })).toBeChecked() // el activo ya viene marcado

      await userEvent.upload(within(dialog).getByLabelText('Archivo'), new File(['%PDF-1.4 x'], 'certificado.pdf'))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Subir documento' }))
      await waitFor(() => expect(mock.count('POST /plants/revemin-ii/documents')).toBe(1))
      expect((mock.calls.find((c) => c.method === 'POST')!.init.body as FormData).get('assetIds')).toBe('a1')
    })
  })

  describe('pestaña Mantenimiento', () => {
    const withMaintenance = (over = {}) =>
      fur({
        maintenance: {
          openWorkOrders: 2,
          overdueWorkOrders: 1,
          lastMaintenanceAt: '2026-09-10T12:00:00.000Z',
          nextMaintenanceAt: '2026-12-01T12:00:00.000Z',
          recent: [wo({ id: 'w1', code: 'OT-2026-00001', title: 'Cambio de rodamiento', status: 'IN_PROGRESS', overdue: true }), wo({ id: 'w2', code: 'OT-2026-00002', title: 'Lubricación', status: 'CLOSED' })],
          ...over,
        },
      })

    it('resume último/próximo mantenimiento, órdenes abiertas y atrasadas, con enlaces a cada orden', async () => {
      setup(withMaintenance())
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Mantenimiento' }))

      const panel = await screen.findByRole('tabpanel')
      expect(within(panel).getByText('Último mantenimiento').closest('div')).toHaveTextContent('10 sep 2026')
      expect(within(panel).getByText('Próximo mantenimiento').closest('div')).toHaveTextContent('01 dic 2026')
      expect(within(panel).getByText('Órdenes abiertas').closest('div')).toHaveTextContent('2')
      expect(within(panel).getByText('Órdenes atrasadas').closest('div')).toHaveTextContent('1')

      const first = within(panel).getByRole('link', { name: 'OT-2026-00001' })
      expect(first).toHaveAttribute('href', '/plants/revemin-ii/maintenance?tab=orders&wo=w1')
      expect(first.closest('li')).toHaveTextContent('En ejecución')
      expect(first.closest('li')).toHaveTextContent('Atrasada')
      expect(within(panel).getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/plants/revemin-ii/maintenance?tab=orders&assetId=a1')
    })

    it('sin fechas: muestra guiones (no inventa)', async () => {
      setup(withMaintenance({ lastMaintenanceAt: null, nextMaintenanceAt: null, openWorkOrders: 0, overdueWorkOrders: 0, recent: [] }))
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Mantenimiento' }))
      const panel = await screen.findByRole('tabpanel')
      expect(within(panel).getByText('Último mantenimiento').closest('div')).toHaveTextContent('—')
      expect(within(panel).getByText('Próximo mantenimiento').closest('div')).toHaveTextContent('—')
      expect(within(panel).getByText('Este activo no tiene órdenes de trabajo.')).toBeInTheDocument()
    })

    it('sin maintenance.read la API devuelve {} y la pestaña lo explica en vez de mostrar ceros engañosos', async () => {
      setup(fur()) // maintenance: {}
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Mantenimiento' }))
      expect(await screen.findByText('Sin acceso a Mantenimiento')).toBeInTheDocument()
      expect(screen.queryByText('Órdenes abiertas')).not.toBeInTheDocument()
    })

    it('sin maintenance.create no se ofrece solicitar mantenimiento', async () => {
      setup(withMaintenance({ recent: [] }))
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Mantenimiento' }))
      await screen.findByText('Este activo no tiene órdenes de trabajo.')
      expect(screen.queryByRole('button', { name: 'Solicitar mantenimiento' })).not.toBeInTheDocument()
    })

    it('con maintenance.create se solicita con el activo ya preseleccionado', async () => {
      state.permissions = ['maintenance.create']
      const mock = setup(withMaintenance({ recent: [] }), {
        'GET /plants/revemin-ii/assets': { body: page([asset()]) },
        'POST /plants/revemin-ii/maintenance/work-orders': { status: 201, body: { id: 'w9', code: 'OT-2026-00009' } },
      })
      renderFur()
      await userEvent.click(await screen.findByRole('tab', { name: 'Mantenimiento' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Solicitar mantenimiento' }))

      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      expect(await within(dialog).findByRole('combobox', { name: 'Activo' })).toHaveTextContent('MB-301') // preseleccionado
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Ruido en el reductor')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))

      await waitFor(() => expect(mock.count('POST /plants/revemin-ii/maintenance/work-orders')).toBe(1))
      expect(JSON.parse(mock.calls.find((c) => c.method === 'POST')!.init.body as string)).toEqual({ assetId: 'a1', title: 'Ruido en el reductor', type: 'CORRECTIVE', priority: 'MEDIUM' })
    })
  })
})
