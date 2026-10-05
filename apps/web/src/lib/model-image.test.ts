import { describe, expect, it } from 'vitest'
import { MODEL_IMAGE_MAX_BYTES, validateModelImage } from './model-image'

describe('validateModelImage', () => {
  it('acepta PNG, JPG y WebP dentro del límite', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(validateModelImage({ type, size: 1024 })).toBeNull()
    expect(validateModelImage({ type: 'image/png', size: MODEL_IMAGE_MAX_BYTES })).toBeNull()
  })

  it('rechaza otros tipos (SVG, PDF, GIF) con un mensaje claro', () => {
    for (const type of ['image/svg+xml', 'application/pdf', 'image/gif', '']) expect(validateModelImage({ type, size: 1024 })).toBe('Usa una imagen PNG, JPG o WebP.')
  })

  it('rechaza lo que pesa más de 5 MB e indica cuánto pesa', () => {
    expect(validateModelImage({ type: 'image/png', size: MODEL_IMAGE_MAX_BYTES + 1 })).toMatch(/5\.0 MB; el máximo es 5 MB/)
    expect(validateModelImage({ type: 'image/jpeg', size: 8 * 1024 * 1024 })).toMatch(/8\.0 MB/)
  })
})
