import { PERMISSIONS, ROLE_PERMISSIONS } from './permissions.catalog'

describe('catálogo de permisos', () => {
  const known = new Set<string>(PERMISSIONS)

  it('no tiene permisos duplicados y todos siguen el formato recurso.acción', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
    for (const p of PERMISSIONS) expect(p).toMatch(/^[a-z_]+\.[a-z_.]+$/)
  })

  it('todo permiso asignado a un rol existe en el catálogo', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) expect({ role, p, known: known.has(p) }).toEqual({ role, p, known: true })
    }
  })

  it('el usuario consumidor es de solo lectura (ADR-006)', () => {
    expect(ROLE_PERMISSIONS.CONSUMER.length).toBeGreaterThan(0)
    for (const p of ROLE_PERMISSIONS.CONSUMER) expect(p).toMatch(/\.read$/)
  })

  it('los roles externos no reciben permisos sobre datos internos de planta', () => {
    expect(ROLE_PERMISSIONS.PROVIDER).toEqual([])
    expect(ROLE_PERMISSIONS.CONTRACTOR).toEqual([])
    expect(ROLE_PERMISSIONS.INSTRUCTOR).toEqual([])
  })

  it('solo el administrador de planta puede configurar la planta y asignar usuarios', () => {
    const holders = (perm: string) =>
      Object.entries(ROLE_PERMISSIONS)
        .filter(([, perms]) => (perms as readonly string[]).includes(perm))
        .map(([role]) => role)
        .sort()
    for (const perm of ['plant.update', 'plant.configure', 'user.assign']) {
      expect(holders(perm)).toEqual(['ECOSYSTEM_ADMIN', 'PLANT_ADMIN'])
    }
  })

  it('el administrador de planta tiene todos los permisos', () => {
    expect([...ROLE_PERMISSIONS.PLANT_ADMIN].sort()).toEqual([...PERMISSIONS].sort())
  })
})
