import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asset, NETWORKS, page, plantDetail, STAGES } from '@/test/assets-fixtures'
import { detail, doc, pdfDownload, publicDetail } from '@/test/documents-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { DocumentsPage } from './documents-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const BASE = '/plants/revemin-ii/documents'
type Reply = { status?: number; body?: unknown; raw?: string | Uint8Array; headers?: Record<string, string> }

function setup(routes: Record<string, Reply | (() => Reply | Promise<Reply>)> = {}) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    'GET /plants/revemin-ii/stages': { body: STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
    'GET /plants/revemin-ii/assets': { body: page([asset()]) },
    'GET /plants/revemin-ii/documents': { body: page([doc(), doc({ id: 'd2', title: 'Plano eléctrico', documentType: 'PLANO', visibility: 'PUBLIC', currentVersion: 1, file: { originalName: 'plano.png', mimeType: 'image/png', sizeBytes: 512 }, assets: [] })]) },
    'GET /plants/revemin-ii/documents/d1': { body: detail() },
    'GET /plants/revemin-ii/documents/d1/download': pdfDownload,
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const listCalls = (m: Mock) => m.calls.filter((c) => c.method === 'GET' && c.path === '/plants/revemin-ii/documents')
const lastQuery = (m: Mock) => listCalls(m).at(-1)!.query

const renderDocs = (route = BASE) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="assets/:assetId" element={<p>Ficha del activo</p>} />
      </Route>
    </Routes>,
    { route },
  )

describe('Documentos (página)', () => {
  beforeEach(() => {
    state.permissions = []
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('listado', () => {
    it('muestra título, archivo, tipo, activos, versión, tamaño y visibilidad (texto, no solo icono)', async () => {
      setup()
      renderDocs()
      const row = (await screen.findByRole('button', { name: 'Manual de operación MB-301' })).closest('tr')!
      expect(within(row).getByText('Manual MB-301 rev B.pdf')).toBeInTheDocument()
      expect(within(row).getByText('Manuales')).toBeInTheDocument()
      expect(within(row).getByText('MB-301')).toBeInTheDocument()
      expect(within(row).getByText('v2')).toBeInTheDocument()
      expect(within(row).getByText('2.5 MB')).toBeInTheDocument()
      expect(within(row).getByText('Interno')).toBeInTheDocument()
      expect(within(screen.getByText('Plano eléctrico').closest('tr')!).getByText('Público')).toBeInTheDocument()
    })

    it('pide la primera página de 25 sin filtros vacíos', async () => {
      const m = setup()
      renderDocs()
      await screen.findByText('Plano eléctrico')
      expect([...lastQuery(m).keys()].sort()).toEqual(['pageSize'])
      expect(lastQuery(m).get('pageSize')).toBe('25')
    })

    it('categorías por tipo: filtran, marcan la activa y dejan chip', async () => {
      const m = setup()
      renderDocs()
      await screen.findByText('Plano eléctrico')
      const rail = screen.getByRole('navigation', { name: 'Categorías de documentos' })
      expect(within(rail).getAllByRole('button')).toHaveLength(10) // Todos + 9 tipos
      expect(within(rail).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-current', 'true')

      await userEvent.click(within(rail).getByRole('button', { name: 'Planos' }))
      await waitFor(() => expect(lastQuery(m).get('type')).toBe('PLANO'))
      expect(within(rail).getByRole('button', { name: 'Planos' })).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('button', { name: /Quitar filtro Tipo: Planos/ })).toBeInTheDocument()

      await userEvent.click(within(rail).getByRole('button', { name: 'Todos' }))
      await waitFor(() => expect(lastQuery(m).has('type')).toBe(false))
    })

    it('los filtros de la URL llegan a la API', async () => {
      const m = setup()
      renderDocs(`${BASE}?type=MANUAL&stage=D06&assetId=a1`)
      await screen.findByText('Plano eléctrico')
      expect(Object.fromEntries(lastQuery(m))).toMatchObject({ type: 'MANUAL', stage: 'D06', assetId: 'a1' })
      expect(await screen.findByRole('button', { name: /Quitar filtro Activo: MB-301/ })).toBeInTheDocument()
    })

    it('la búsqueda se envía con debounce y reinicia la página', async () => {
      const m = setup()
      renderDocs(`${BASE}?page=2`)
      await screen.findByText('Plano eléctrico')
      const before = listCalls(m).length
      await userEvent.type(screen.getByLabelText('Buscar'), 'plano')
      await waitFor(() => expect(lastQuery(m).get('search')).toBe('plano'))
      expect(lastQuery(m).has('page')).toBe(false)
      expect(listCalls(m).length - before).toBeLessThanOrEqual(2)
    })

    it('pagina', async () => {
      const m = setup({ 'GET /plants/revemin-ii/documents': { body: page([doc()], 60) } })
      renderDocs()
      await screen.findByText('Manual de operación MB-301')
      expect(screen.getByText('1–25 de 60')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastQuery(m).get('page')).toBe('2'))
    })

    it('el filtro "Estado: archivados" solo existe para quien tiene document.read', async () => {
      setup()
      const { unmount } = renderDocs()
      await screen.findByText('Plano eléctrico')
      expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument()
      unmount()

      state.permissions = ['document.read']
      setup()
      renderDocs()
      expect(await screen.findByLabelText('Estado')).toBeInTheDocument()
    })
  })

  describe('estados vacíos, carga y error', () => {
    it('visitante sin documentos: mensaje claro y sin botones de gestión', async () => {
      setup({ 'GET /plants/revemin-ii/documents': { body: page([]) } })
      renderDocs()
      expect(await screen.findByText('No hay documentos en esta planta')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument()
    })

    it('con document.upload el estado vacío invita a subir el primero', async () => {
      state.permissions = ['document.upload']
      setup({ 'GET /plants/revemin-ii/documents': { body: page([]) } })
      renderDocs()
      expect(await screen.findByRole('button', { name: /Subir el primer documento/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Subir documento/ })).toBeInTheDocument()
    })

    it('sin resultados con filtros: lo explica y permite limpiarlos', async () => {
      const m = setup({ 'GET /plants/revemin-ii/documents': { body: page([]) } })
      renderDocs(`${BASE}?type=PLANO`)
      expect(await screen.findByText('Ningún documento coincide con los filtros')).toBeInTheDocument()
      await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0])
      await waitFor(() => expect(lastQuery(m).has('type')).toBe(false))
    })

    it('error del servidor: alerta con reintentar', async () => {
      let fail = true
      setup({ 'GET /plants/revemin-ii/documents': () => (fail ? { status: 500, body: {} } : { body: page([doc()]) }) })
      renderDocs()
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('Manual de operación MB-301')).toBeInTheDocument()
    })

    it('esqueletos accesibles mientras carga', async () => {
      setup({ 'GET /plants/revemin-ii/documents': () => new Promise<Reply>(() => undefined) })
      renderDocs()
      expect(await screen.findByLabelText('Cargando documentos')).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('panel de detalle', () => {
    it('al elegir un documento abre el panel con metadatos, versiones y vista previa', async () => {
      const m = setup()
      renderDocs()
      await userEvent.click(await screen.findByRole('button', { name: 'Manual de operación MB-301' }))

      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByText('Manuales · versión 2')).toBeInTheDocument()
      expect(within(sheet).getByText('Marta Mantenimiento', { selector: 'dd' })).toBeInTheDocument() // autor (interno)
      expect(within(sheet).getByRole('link', { name: 'MB-301' })).toHaveAttribute('href', '/plants/revemin-ii/assets/a1')

      const versions = within(sheet).getByRole('list')
      expect(within(versions).getByText('Vigente')).toBeInTheDocument()
      expect(within(versions).getByText('Corrige torques')).toBeInTheDocument()
      expect(within(versions).getAllByRole('listitem')).toHaveLength(2)

      // Vista previa del PDF: se pidió inline de la versión vigente, con fetch autenticado.
      expect(await within(sheet).findByTitle('Vista previa de Manual de operación MB-301')).toBeInTheDocument()
      const previewCall = m.calls.find((c) => c.path.endsWith('/download'))!
      expect(Object.fromEntries(previewCall.query)).toEqual({ inline: '1', version: '2' })
    })

    it('el panel se enlaza desde la URL (?doc=) para poder compartirlo', async () => {
      setup()
      renderDocs(`${BASE}?doc=d1`)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(await screen.findByText('Manuales · versión 2')).toBeInTheDocument()
    })

    it('un archivo que no se puede previsualizar (Word) lo dice y no pide la vista previa', async () => {
      const m = setup({
        'GET /plants/revemin-ii/documents/d1': { body: detail({ file: { originalName: 'informe.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 100 } }) },
      })
      renderDocs(`${BASE}?doc=d1`)
      expect(await screen.findByText(/La vista previa no está disponible/)).toBeInTheDocument()
      expect(m.calls.some((c) => c.path.endsWith('/download'))).toBe(false)
    })

    it('una imagen se previsualiza como <img>', async () => {
      setup({
        'GET /plants/revemin-ii/documents/d1': { body: detail({ title: 'Foto del molino', file: { originalName: 'foto.png', mimeType: 'image/png', sizeBytes: 4 } }) },
        'GET /plants/revemin-ii/documents/d1/download': { raw: new Uint8Array([0x89, 0x50]), headers: { 'Content-Type': 'image/png' } },
      })
      renderDocs(`${BASE}?doc=d1`)
      expect(await screen.findByRole('img', { name: 'Vista previa de Foto del molino' })).toBeInTheDocument()
    })

    it('visitante: sin autor, checksums ni notas; solo la versión vigente; sin acciones de gestión', async () => {
      setup({ 'GET /plants/revemin-ii/documents/d1': { body: publicDetail() } })
      renderDocs(`${BASE}?doc=d1`)
      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByText('Público')).toBeInTheDocument()
      expect(within(sheet).queryByText('Creado por')).not.toBeInTheDocument()
      expect(within(sheet).getAllByRole('listitem')).toHaveLength(1)
      expect(within(sheet).getByText(/Los visitantes ven solo la versión vigente/)).toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: /^Descargar Manual/ })).toBeInTheDocument()
      for (const name of [/Nueva versión/, /Editar/, /Archivar/]) expect(within(sheet).queryByRole('button', { name })).not.toBeInTheDocument()
    })

    it('documento inexistente o no visible (404): mensaje claro', async () => {
      setup({ 'GET /plants/revemin-ii/documents/d1': { status: 404, body: { message: 'Documento no encontrado' } } })
      renderDocs(`${BASE}?doc=d1`)
      expect(await screen.findByText(/no existe o no es visible para tu cuenta/)).toBeInTheDocument()
    })

    it('descarga autenticada: baja el Blob (versión indicada) y lo guarda con su nombre', async () => {
      const m = setup()
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const create = vi.spyOn(URL, 'createObjectURL')
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Descargar v1 Manual MB-301.pdf' }))

      await waitFor(() => expect(click).toHaveBeenCalled())
      const downloads = m.calls.filter((c) => c.path.endsWith('/download') && !c.query.has('inline'))
      expect(downloads).toHaveLength(1)
      expect(downloads[0].query.get('version')).toBe('1')
      expect(create).toHaveBeenCalled()
      click.mockRestore()
    })

    it('si el archivo ya no existe en el almacenamiento (404) avisa sin romper', async () => {
      setup({ 'GET /plants/revemin-ii/documents/d1/download': () => ({ status: 404, body: { message: 'no disponible' } }) })
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Descargar Manual MB-301 rev B.pdf' }))
      // El botón vuelve a estar disponible (no queda "Descargando…" colgado)
      await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar Manual MB-301 rev B.pdf' })).toBeEnabled())
    })
  })

  describe('subir documento', () => {
    beforeEach(() => {
      state.permissions = ['document.upload']
    })
    const pdf = () => new File(['%PDF-1.4 x'], 'Procedimiento de arranque.pdf', { type: 'application/pdf' })

    async function openUpload() {
      await userEvent.click(await screen.findByRole('button', { name: /Subir documento/ }))
      return screen.findByRole('dialog')
    }

    it('valida: archivo obligatorio, extensión permitida y título', async () => {
      const user = userEvent.setup({ applyAccept: false })
      const m = setup()
      renderDocs()
      const dialog = await openUpload()

      await user.click(within(dialog).getByRole('button', { name: 'Subir documento' }))
      expect(await within(dialog).findByText('Selecciona un archivo')).toBeInTheDocument()

      await user.upload(within(dialog).getByLabelText('Archivo'), new File(['MZ'], 'virus.exe'))
      await user.click(within(dialog).getByRole('button', { name: 'Subir documento' }))
      expect(await within(dialog).findByText(/Tipo no permitido \(\.exe\)/)).toBeInTheDocument()
      expect(m.calls.some((c) => c.method === 'POST')).toBe(false)
    })

    it('sugiere el título desde el nombre del archivo y sube un multipart con los metadatos', async () => {
      const m = setup({ 'POST /plants/revemin-ii/documents': { status: 201, body: detail({ id: 'd9', title: 'Procedimiento de arranque' }) }, 'GET /plants/revemin-ii/documents/d9': { body: detail({ id: 'd9', title: 'Procedimiento de arranque' }) } })
      renderDocs()
      const dialog = await openUpload()

      await userEvent.upload(within(dialog).getByLabelText('Archivo'), pdf())
      expect(within(dialog).getByLabelText('Título')).toHaveValue('Procedimiento de arranque')

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tipo' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Procedimientos' }))
      await userEvent.click(await within(dialog).findByRole('checkbox', { name: /MB-301/ }))
      await userEvent.type(within(dialog).getByLabelText(/Nota/), 'Primera edición')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Subir documento' }))

      await waitFor(() => expect(m.calls.some((c) => c.method === 'POST')).toBe(true))
      const post = m.calls.find((c) => c.method === 'POST')!
      expect(post.headers.get('Content-Type')).toBeNull() // multipart: lo fija el navegador
      const form = post.init.body as FormData
      expect(Object.fromEntries([...form.entries()].filter(([k]) => k !== 'file'))).toEqual({
        title: 'Procedimiento de arranque',
        documentType: 'PROCEDIMIENTO',
        visibility: 'INTERNAL', // interno por defecto
        assetIds: 'a1',
        note: 'Primera edición',
      })
      expect((form.get('file') as File).name).toBe('Procedimiento de arranque.pdf')

      // Tras subir, abre el documento nuevo.
      expect(await screen.findByText(/versión 2/)).toBeInTheDocument()
    })

    it('el servidor rechaza el tipo (415): se muestra en el campo archivo y no se cierra', async () => {
      setup({ 'POST /plants/revemin-ii/documents': { status: 415, body: { message: 'El contenido del archivo no corresponde a su extensión .pdf' } } })
      renderDocs()
      const dialog = await openUpload()
      await userEvent.upload(within(dialog).getByLabelText('Archivo'), pdf())
      await userEvent.click(within(dialog).getByRole('button', { name: 'Subir documento' }))

      expect(await within(dialog).findByText(/no corresponde a su extensión/)).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Archivo')).toHaveAttribute('aria-invalid', 'true')
    })

    it('413: informa que el archivo es demasiado grande', async () => {
      setup({ 'POST /plants/revemin-ii/documents': { status: 413, body: { message: 'Payload Too Large' } } })
      renderDocs()
      const dialog = await openUpload()
      await userEvent.upload(within(dialog).getByLabelText('Archivo'), pdf())
      await userEvent.click(within(dialog).getByRole('button', { name: 'Subir documento' }))
      expect(await within(dialog).findByText(/supera el tamaño máximo/)).toBeInTheDocument()
    })

    it('publicar es explícito: al elegir Público se avisa que depende de la planta', async () => {
      setup()
      renderDocs()
      const dialog = await openUpload()
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Visibilidad' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Público' }))
      expect(within(dialog).getByText(/solo si la planta publica sus documentos/)).toBeInTheDocument()
    })
  })

  describe('nueva versión, edición y archivado', () => {
    beforeEach(() => {
      state.permissions = ['document.upload', 'document.delete']
    })

    it('permisos finos: con document.upload pero SIN document.delete se puede editar, pero no archivar', async () => {
      state.permissions = ['document.upload']
      setup()
      renderDocs(`${BASE}?doc=d1`)
      expect(await screen.findByRole('button', { name: /Editar/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Nueva versión/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Archivar/ })).not.toBeInTheDocument()
    })

    it('Nueva versión: sube solo archivo y nota a /versions', async () => {
      const m = setup({ 'POST /plants/revemin-ii/documents/d1/versions': { status: 201, body: detail({ currentVersion: 3 }) } })
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: /Nueva versión/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      expect(within(dialog).getByText(/Nueva versión de «Manual de operación MB-301»/)).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Título')).not.toBeInTheDocument() // no se piden metadatos

      await userEvent.upload(within(dialog).getByLabelText('Archivo'), new File(['%PDF-1.4 v3'], 'manual-rev-c.pdf'))
      await userEvent.type(within(dialog).getByLabelText(/Nota de la versión/), 'Rev C')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Subir versión' }))

      await waitFor(() => expect(m.count('POST /plants/revemin-ii/documents/d1/versions')).toBe(1))
      const form = m.calls.find((c) => c.method === 'POST')!.init.body as FormData
      expect([...form.keys()].sort()).toEqual(['file', 'note'])
      expect(form.get('note')).toBe('Rev C')
    })

    it('Editar: precarga y envía solo título, tipo y visibilidad (PATCH JSON)', async () => {
      const m = setup({ 'PATCH /plants/revemin-ii/documents/d1': { body: detail({ title: 'Manual vigente' }) } })
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: /Editar/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      const title = within(dialog).getByLabelText('Título')
      expect(title).toHaveValue('Manual de operación MB-301')

      await userEvent.clear(title)
      await userEvent.type(title, 'Manual vigente')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(m.count('PATCH /plants/revemin-ii/documents/d1')).toBe(1))
      const patch = m.calls.find((c) => c.method === 'PATCH')!
      expect(patch.headers.get('Content-Type')).toBe('application/json')
      expect(JSON.parse(patch.init.body as string)).toEqual({ title: 'Manual vigente', documentType: 'MANUAL', visibility: 'INTERNAL' })
    })

    it('Archivar: pide confirmación; cancelar no llama al servidor', async () => {
      const m = setup()
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: /Archivar/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      expect(within(dialog).getByText(/Sus archivos, versiones y registro de auditoría se conservan/)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(m.calls.some((c) => c.method === 'DELETE')).toBe(false)
    })

    it('Archivar confirmado: DELETE y se cierra el panel', async () => {
      const m = setup({ 'DELETE /plants/revemin-ii/documents/d1': { status: 204 } })
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: /Archivar/ }))
      const confirm = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(confirm).getByRole('button', { name: 'Archivar' }))

      await waitFor(() => expect(m.count('DELETE /plants/revemin-ii/documents/d1')).toBe(1))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('si el backend rechaza el archivado (403) lo informa y deja el panel abierto', async () => {
      setup({ 'DELETE /plants/revemin-ii/documents/d1': { status: 403, body: { message: 'Falta el permiso document.delete' } } })
      renderDocs(`${BASE}?doc=d1`)
      await userEvent.click(await screen.findByRole('button', { name: /Archivar/ }))
      const confirm = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(confirm).getByRole('button', { name: 'Archivar' }))
      expect(await screen.findByText('No tienes permiso para archivar documentos.')).toBeInTheDocument()
    })

    it('un documento archivado no ofrece acciones de gestión', async () => {
      setup({ 'GET /plants/revemin-ii/documents/d1': { body: detail({ status: 'ARCHIVED' }) } })
      renderDocs(`${BASE}?doc=d1`)
      expect(await screen.findByText('Archivado')).toBeInTheDocument()
      for (const name of [/Nueva versión/, /Editar/, /Archivar/]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    })
  })
})
