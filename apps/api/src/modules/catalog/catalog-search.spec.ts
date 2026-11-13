import { catalogSearchTerms } from './catalog-search'

describe('Términos de búsqueda del catálogo', () => {
  it.each(['motor 5hp', 'motor 5 HP', 'MOTOR 5 hp'])(
    'une número y unidad con %s', search => {
      expect(catalogSearchTerms(search)).toEqual([{ text: 'motor' }, { number: '5', unit: 'hp' }])
    },
  )

  it('conserva decimales, varias cantidades y símbolos de unidades', () => {
    expect(catalogSearchTerms('Cámara de 0,5 kW 220V 50 m³/h')).toEqual([
      { text: 'camara' }, { number: '0,5', unit: 'kw' }, { number: '220', unit: 'v' }, { number: '50', unit: 'm3/h' },
    ])
  })

  it('conserva TAG, comodines y búsquedas hechas solo de palabras comunes', () => {
    expect(catalogSearchTerms('E2E-ÓPTICO-001 100%_\\')).toEqual([{ text: 'e2e-optico-001' }, { text: '100%_\\' }])
    expect(catalogSearchTerms('de')).toEqual([{ text: 'de' }])
    expect(catalogSearchTerms('de la')).toEqual([{ text: 'de la' }])
  })
})
