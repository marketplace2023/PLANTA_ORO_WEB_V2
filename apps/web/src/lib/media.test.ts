import { describe, expect, it } from 'vitest'
import { externalUrlOnly, imageSrc } from './media'

describe('imageSrc', () => {
  it('deja intactas las URL externas y resuelve las rutas de la API', () => {
    expect(imageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(imageSrc('/marketplace/listings/abc/image?v=1')).toBe('http://localhost:3000/api/v1/marketplace/listings/abc/image?v=1')
    expect(imageSrc('/providers/abc/logo?v=2')).toBe('http://localhost:3000/api/v1/providers/abc/logo?v=2')
  })

  it('sin imagen no hay origen', () => {
    expect(imageSrc(null)).toBeNull()
    expect(imageSrc(undefined)).toBeNull()
    expect(imageSrc('')).toBeNull()
  })
})

describe('externalUrlOnly', () => {
  it('solo devuelve las URL externas para editarlas como texto', () => {
    expect(externalUrlOnly('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(externalUrlOnly('/marketplace/listings/abc/image?v=1')).toBe('')
    expect(externalUrlOnly(null)).toBe('')
  })
})
