import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionGate } from './permission-gate'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions }),
}))

describe('PermissionGate', () => {
  beforeEach(() => {
    state.permissions = []
  })

  it('renderiza el contenido si el usuario tiene el permiso', () => {
    state.permissions = ['asset.update']
    render(
      <PermissionGate permission="asset.update">
        <button>Editar activo</button>
      </PermissionGate>,
    )
    expect(screen.getByRole('button', { name: 'Editar activo' })).toBeInTheDocument()
  })

  it('no renderiza nada sin permiso (la UI no ofrece acciones que el backend rechazará)', () => {
    state.permissions = ['asset.read']
    render(
      <PermissionGate permission="asset.update">
        <button>Editar activo</button>
      </PermissionGate>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('muestra el fallback cuando se indica', () => {
    render(
      <PermissionGate permission="asset.update" fallback={<span>Solo lectura</span>}>
        <button>Editar activo</button>
      </PermissionGate>,
    )
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
  })
})

describe('PermissionGate anyOf', () => {
  it('basta con tener uno de los permisos', () => {
    state.permissions = ['plant.configure']
    render(
      <PermissionGate anyOf={['user.read', 'plant.configure']}>
        <button>Administrar</button>
      </PermissionGate>,
    )
    expect(screen.getByRole('button', { name: 'Administrar' })).toBeInTheDocument()
  })

  it('sin ninguno, o con la lista vacía, no se muestra (nunca "permitido por omisión")', () => {
    state.permissions = ['asset.read']
    const { unmount } = render(
      <PermissionGate anyOf={['user.read', 'plant.configure']}>
        <button>Administrar</button>
      </PermissionGate>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    unmount()

    render(
      <PermissionGate anyOf={[]}>
        <button>Vacío</button>
      </PermissionGate>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    render(
      <PermissionGate>
        <button>Sin requisito</button>
      </PermissionGate>,
    )
    expect(screen.queryByRole('button', { name: 'Sin requisito' })).not.toBeInTheDocument()
  })
})
