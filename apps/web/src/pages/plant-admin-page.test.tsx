import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { PlantAdminPage } from './plant-admin-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const P = '/plants/revemin-ii'
type Reply = { status?: number; body?: unknown }

const MEMBERS = [
  { id: 'm1', userId: 'u1', email: 'gerente@fur.local', firstName: 'Gabriel', lastName: 'Gerente', roleCode: 'PLANT_ADMIN', roleName: 'Administrador de planta', status: 'ACTIVE', startsAt: null, endsAt: null },
  { id: 'm2', userId: 'u2', email: 'marta@fur.local', firstName: 'Marta', lastName: 'Mantenimiento', roleCode: 'MAINTENANCE_LEAD', roleName: 'x', status: 'ACTIVE', startsAt: null, endsAt: null },
]
const ROLES = [
  { code: 'MAINTENANCE_LEAD', name: 'Jefe de mantenimiento', scope: 'PLANT' },
  { code: 'PLANT_ADMIN', name: 'Administrador de planta', scope: 'PLANT' },
  { code: 'CONSUMER', name: 'Usuario común', scope: 'EXTERNAL' },
]
const STAGE_CATALOG = [
  { id: 'c1', code: 'D01', name: 'Recepción y Alimentación', sequenceDefault: 1, description: null, stageGroup: 'TRITURACION', colorToken: 'orange' },
  { id: 'c6', code: 'D06', name: 'Molienda Primaria', sequenceDefault: 6, description: null, stageGroup: 'MOLIENDA', colorToken: 'blue' },
  { id: 'c11', code: 'D11', name: 'Lixiviación y Adsorción CIL', sequenceDefault: 11, description: null, stageGroup: 'LIXIVIACION', colorToken: 'green' },
]
const PLANT_STAGES = [
  { id: 's6', code: 'D06', name: 'Molienda Primaria', displayName: 'Molino SAG', stageGroup: 'MOLIENDA', colorToken: 'blue', sequence: 6, isEnabled: true, isPublic: false },
  { id: 's11', code: 'D11', name: 'Lixiviación y Adsorción CIL', displayName: 'Lixiviación y Adsorción CIL', stageGroup: 'LIXIVIACION', colorToken: 'green', sequence: 11, isEnabled: false, isPublic: false },
]
const NETWORK_CATALOG = [
  { id: 'nm1', code: 'FUR-IOT', name: 'IoT / Instrumentación', description: null, icon: 'radio', colorToken: 'network-iot' },
  { id: 'nm2', code: 'FUR-PTE', name: 'Potencia Eléctrica', description: null, icon: 'zap', colorToken: 'network-pte' },
]
const PLANT_NETWORKS = [{ id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', colorToken: 'network-iot', isEnabled: true, isPublic: true }]

function setup(routes: Record<string, Reply | (() => Reply | Promise<Reply>)> = {}) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    [`GET ${P}/members`]: { body: MEMBERS },
    [`GET ${P}/members/roles`]: { body: ROLES },
    'GET /stages/catalog': { body: STAGE_CATALOG },
    [`GET ${P}/stages`]: { body: PLANT_STAGES },
    'GET /networks/catalog': { body: NETWORK_CATALOG },
    [`GET ${P}/networks`]: { body: PLANT_NETWORKS },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const bodyOf = (m: Mock, method: string, path: string) => JSON.parse(m.calls.filter((c) => c.method === method && c.path === path).at(-1)!.init.body as string)

const renderAdmin = (route = `${P}/admin`) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="admin" element={<PlantAdminPage />} />
      </Route>
    </Routes>,
    { route },
  )

describe('Administrar planta', () => {
  beforeEach(() => {
    state.permissions = []
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sin permisos de administración: lo explica y no muestra pestañas', async () => {
    setup()
    renderAdmin()
    expect(await screen.findByText('Sin acceso a la administración')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('cada pestaña existe solo para quien puede usarla', async () => {
    state.permissions = ['user.read']
    setup()
    const { unmount } = renderAdmin()
    await screen.findByText('gerente@fur.local')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Miembros'])
    unmount()

    state.permissions = ['plant.configure']
    setup()
    renderAdmin()
    await screen.findByText(/etapas habilitadas/)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Etapas', 'Redes'])
  })

  it('una pestaña no permitida en la URL cae a la primera disponible', async () => {
    state.permissions = ['plant.configure']
    setup()
    renderAdmin(`${P}/admin?tab=members`)
    expect(await screen.findByText(/etapas habilitadas/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Etapas' })).toHaveAttribute('aria-selected', 'true')
  })

  describe('miembros', () => {
    it('lista personas y roles; solo lectura (user.read) sin acciones', async () => {
      state.permissions = ['user.read']
      setup()
      renderAdmin()
      const row = (await screen.findByText('gerente@fur.local')).closest('tr')!
      expect(within(row).getByText('Gabriel Gerente')).toBeInTheDocument()
      expect(within(row).getByText('Administrador de planta')).toBeInTheDocument()
      expect(screen.getByText('Jefe de mantenimiento')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Asignar rol/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Retirar rol/ })).not.toBeInTheDocument()
    })

    it('estado vacío y error con reintento', async () => {
      state.permissions = ['user.read']
      setup({ [`GET ${P}/members`]: { body: [] } })
      const { unmount } = renderAdmin()
      expect(await screen.findByText('Esta planta aún no tiene miembros')).toBeInTheDocument()
      unmount()

      let fail = true
      setup({ [`GET ${P}/members`]: () => (fail ? { status: 500, body: {} } : { body: MEMBERS }) })
      renderAdmin()
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('gerente@fur.local')).toBeInTheDocument()
    })

    describe('asignar roles (user.assign)', () => {
      beforeEach(() => {
        state.permissions = ['user.read', 'user.assign']
      })

      async function open() {
        await userEvent.click(await screen.findByRole('button', { name: /Asignar rol/ }))
        return screen.findByRole('dialog')
      }

      it('valida correo y rol sin llamar al servidor', async () => {
        const m = setup()
        renderAdmin()
        const dialog = await open()
        await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'no-es-correo')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar rol' }))
        expect(await within(dialog).findByText('Ingresa un correo válido')).toBeInTheDocument()
        expect(within(dialog).getByText('Selecciona un rol', { selector: 'p' })).toBeInTheDocument()
        expect(m.calls.some((c) => c.method === 'POST')).toBe(false)
      })

      it('solo ofrece roles asignables, con nombres del diseño, y envía el cuerpo', async () => {
        const m = setup({ [`POST ${P}/members`]: { status: 201, body: MEMBERS[0] } })
        renderAdmin()
        const dialog = await open()
        await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'nuevo@fur.local')
        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Rol' }))
        const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
        expect(options).toEqual(['Jefe de mantenimiento', 'Administrador de planta', 'Usuario común'])
        await userEvent.click(screen.getByRole('option', { name: 'Jefe de mantenimiento' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar rol' }))

        await waitFor(() => expect(m.calls.some((c) => c.method === 'POST')).toBe(true))
        expect(bodyOf(m, 'POST', `${P}/members`)).toEqual({ email: 'nuevo@fur.local', roleCode: 'MAINTENANCE_LEAD' })
      })

      it('usuario inexistente (404) y rol repetido (409) se explican bajo el campo', async () => {
        setup({ [`POST ${P}/members`]: { status: 404, body: { message: 'No existe un usuario con ese correo' } } })
        const { unmount } = renderAdmin()
        let dialog = await open()
        await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'nadie@fur.local')
        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Rol' }))
        await userEvent.click(await screen.findByRole('option', { name: 'Usuario común' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar rol' }))
        expect(await within(dialog).findByText(/Debe registrarse primero/)).toBeInTheDocument()
        unmount()

        setup({ [`POST ${P}/members`]: { status: 409, body: { message: 'El usuario ya tiene ese rol en la planta' } } })
        renderAdmin()
        dialog = await open()
        await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'marta@fur.local')
        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Rol' }))
        await userEvent.click(await screen.findByRole('option', { name: 'Jefe de mantenimiento' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar rol' }))
        expect(await within(dialog).findByText('El usuario ya tiene ese rol en la planta.')).toBeInTheDocument()
      })

      it('retirar pide confirmación; cancelar no llama al servidor; confirmar hace DELETE', async () => {
        const m = setup({ [`DELETE ${P}/members/m2`]: { status: 204 } })
        renderAdmin()
        await userEvent.click(await screen.findByRole('button', { name: /Retirar rol Jefe de mantenimiento a Marta Mantenimiento/ }))
        let dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText(/Perderá el rol «Jefe de mantenimiento»/)).toBeInTheDocument()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
        expect(m.calls.some((c) => c.method === 'DELETE')).toBe(false)

        await userEvent.click(screen.getByRole('button', { name: /Retirar rol Jefe de mantenimiento a Marta/ }))
        dialog = await screen.findByRole('dialog')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar rol' }))
        await waitFor(() => expect(m.count(`DELETE ${P}/members/m2`)).toBe(1))
      })
    })
  })

  describe('etapas (plant.configure)', () => {
    beforeEach(() => {
      state.permissions = ['plant.configure']
    })

    it('muestra el catálogo con su estado en la planta y el conteo', async () => {
      setup()
      renderAdmin()
      expect(await screen.findByText(/1 de 3 etapas habilitadas/)).toBeInTheDocument()
      const d06 = screen.getByText('D06').closest('tr')!
      expect(within(d06).getByText('Molino SAG')).toBeInTheDocument()
      expect(within(d06).getByText('(Molienda Primaria)')).toBeInTheDocument() // muestra también el nombre del catálogo
      expect(within(d06).getByText('Habilitada')).toBeInTheDocument()
      expect(within(screen.getByText('D01').closest('tr')!).getByText('No habilitada')).toBeInTheDocument()
      expect(within(screen.getByText('D11').closest('tr')!).getByText('No habilitada')).toBeInTheDocument() // existe pero deshabilitada
    })

    it('Habilitar usa el código del catálogo (POST); sirve también para re-habilitar', async () => {
      const m = setup({ [`POST ${P}/stages`]: { status: 201, body: {} } })
      renderAdmin()
      await userEvent.click(await screen.findByRole('button', { name: 'Habilitar D01' }))
      await waitFor(() => expect(bodyOf(m, 'POST', `${P}/stages`)).toEqual({ stageCode: 'D01' }))
      await userEvent.click(screen.getByRole('button', { name: 'Habilitar D11' }))
      await waitFor(() => expect(bodyOf(m, 'POST', `${P}/stages`)).toEqual({ stageCode: 'D11' }))
    })

    it('Deshabilitar y Pública envían PATCH sobre la etapa de la planta', async () => {
      const m = setup({ [`PATCH ${P}/stages/s6`]: { body: {} } })
      renderAdmin()
      await userEvent.click(await screen.findByRole('checkbox', { name: 'D06 pública' }))
      await waitFor(() => expect(bodyOf(m, 'PATCH', `${P}/stages/s6`)).toEqual({ isPublic: true }))
      await userEvent.click(screen.getByRole('button', { name: 'Deshabilitar D06' }))
      await waitFor(() => expect(bodyOf(m, 'PATCH', `${P}/stages/s6`)).toEqual({ isEnabled: false }))
    })

    it('si la etapa tiene activos el servidor responde 409 y la fila no cambia de estado', async () => {
      setup({ [`PATCH ${P}/stages/s6`]: { status: 409, body: { message: 'No se puede deshabilitar la etapa: tiene 3 activo(s) asignado(s)' } } })
      renderAdmin()
      await userEvent.click(await screen.findByRole('button', { name: 'Deshabilitar D06' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Deshabilitar D06' })).toBeEnabled())
      expect(within(screen.getByText('D06').closest('tr')!).getByText('Habilitada')).toBeInTheDocument()
    })

    it('Editar: nombre propio y orden (valida el orden)', async () => {
      const m = setup({ [`PATCH ${P}/stages/s6`]: { body: {} } })
      renderAdmin()
      await userEvent.click(await screen.findByRole('button', { name: 'Editar D06' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText(/Nombre propio/)).toHaveValue('Molino SAG')

      await userEvent.clear(within(dialog).getByLabelText('Orden en el proceso'))
      await userEvent.type(within(dialog).getByLabelText('Orden en el proceso'), '0')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      expect(await within(dialog).findByText(/entero mayor o igual a 1/)).toBeInTheDocument()
      expect(m.calls.some((c) => c.method === 'PATCH')).toBe(false)

      await userEvent.clear(within(dialog).getByLabelText('Orden en el proceso'))
      await userEvent.type(within(dialog).getByLabelText('Orden en el proceso'), '7')
      await userEvent.clear(within(dialog).getByLabelText(/Nombre propio/))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(bodyOf(m, 'PATCH', `${P}/stages/s6`)).toEqual({ sequence: 7, nameOverride: null })) // vacío = volver al nombre del catálogo
    })
  })

  describe('redes (plant.configure)', () => {
    beforeEach(() => {
      state.permissions = ['plant.configure']
    })

    it('muestra el catálogo y permite habilitar/deshabilitar y publicar', async () => {
      const m = setup({ [`POST ${P}/networks`]: { status: 201, body: {} }, [`PATCH ${P}/networks/n1`]: { body: {} } })
      renderAdmin(`${P}/admin?tab=networks`)
      expect(await screen.findByText(/1 de 2 redes habilitadas/)).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Habilitar FUR-PTE' }))
      await waitFor(() => expect(bodyOf(m, 'POST', `${P}/networks`)).toEqual({ networkCode: 'FUR-PTE' }))

      expect(screen.getByRole('checkbox', { name: 'FUR-IOT pública' })).toBeChecked()
      await userEvent.click(screen.getByRole('checkbox', { name: 'FUR-IOT pública' }))
      await waitFor(() => expect(bodyOf(m, 'PATCH', `${P}/networks/n1`)).toEqual({ isPublic: false }))

      await userEvent.click(screen.getByRole('button', { name: 'Deshabilitar FUR-IOT' }))
      await waitFor(() => expect(bodyOf(m, 'PATCH', `${P}/networks/n1`)).toEqual({ isEnabled: false }))
    })
  })
})
