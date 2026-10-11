import { describe, expect, it } from 'vitest'
import { reorderIds } from './reorder-ids'

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']

  it('lleva una tarjeta a la primera posición', () => {
    expect(reorderIds(ids, 5, 'c', 'a')).toEqual(['c', 'a', 'b', 'd', 'e'])
  })

  it('la lleva hacia el final', () => {
    expect(reorderIds(ids, 5, 'a', 'e')).toEqual(['b', 'c', 'd', 'e', 'a'])
  })

  it('con solo las primeras visibles, las que no se ven conservan su lugar al final', () => {
    expect(reorderIds(ids, 3, 'c', 'a')).toEqual(['c', 'a', 'b', 'd', 'e'])
  })

  it('no hay cambio si se suelta sobre sí misma o sobre una tarjeta que no se ve', () => {
    expect(reorderIds(ids, 3, 'b', 'b')).toBeNull()
    expect(reorderIds(ids, 3, 'a', 'e')).toBeNull()
  })
})
