import { describe, expect, it } from 'vitest'
import { specLabel } from './spec-label'

describe('specLabel', () => {
  it('traduce la palabra y pone la unidad entre paréntesis', () => {
    expect(specLabel('powerKw')).toBe('Potencia (kW)')
    expect(specLabel('voltageV')).toBe('Tensión (V)')
    expect(specLabel('diameterFt')).toBe('Diámetro (ft)')
    expect(specLabel('suctionIn')).toBe('Succión (in)')
    expect(specLabel('powerMva')).toBe('Potencia (MVA)')
    expect(specLabel('areaFt2')).toBe('Área (ft²)')
    expect(specLabel('primaryKv')).toBe('Primario (kV)')
  })

  it('sin unidad conocida deja la clave legible', () => {
    expect(specLabel('poles')).toBe('Polos')
    expect(specLabel('decks')).toBe('Pisos')
    expect(specLabel('cubicles')).toBe('Celdas')
    expect(specLabel('finishType')).toBe('Finish type')
  })
})
