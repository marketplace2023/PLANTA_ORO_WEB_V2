import { expect, it } from 'vitest'
import { visibleSpecificationEntries } from './specification-value'

it('oculta No aplica sin distinguir mayúsculas o espacios y no modifica el original', () => {
  const data = { A: 'No aplica', B: '  NO APLICA  ', C: 'no\n aplica', D: 'No\u00a0aplica', Potencia: 0, Reversible: false, Respuesta: 'No', Nota: 'No aplica a equipos nuevos', Lista: ['No aplica', 'Texto'], Vacío: null }
  const before = structuredClone(data)
  expect(visibleSpecificationEntries(data).map(([key]) => key)).toEqual(['Potencia', 'Reversible', 'Respuesta', 'Nota', 'Lista', 'Vacío'])
  expect(data).toEqual(before)
})

it('admite fichas vacías y fichas donde ninguna especificación aplica', () => {
  expect(visibleSpecificationEntries()).toEqual([])
  expect(visibleSpecificationEntries({})).toEqual([])
  expect(visibleSpecificationEntries({ Rango: 'No aplica' })).toEqual([])
})
