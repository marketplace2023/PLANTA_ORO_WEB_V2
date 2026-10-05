import { describe, expect, it } from 'vitest'
import { plantMapUrl } from './plant-maps'

describe('plantMapUrl', () => {
  it('devuelve el mapa de cada planta por su código, con los espacios codificados', () => {
    expect(plantMapUrl('REV-II')).toBe('/MAPA%20REVERMIN.png')
    expect(plantMapUrl('CAR-01')).toBe('/MAPA%20CARATAL.jpeg')
    expect(plantMapUrl('MSM-01')).toBe('/MAPA%20MINA%20SOSA.jpeg')
    expect(plantMapUrl('MCO-01')).toBe('/MAPA%20MINERVEN.jpeg')
  })

  it('una planta sin mapa o sin código no tiene mapa', () => {
    expect(plantMapUrl('NUEVA-01')).toBeNull()
    expect(plantMapUrl(null)).toBeNull()
    expect(plantMapUrl(undefined)).toBeNull()
  })
})
