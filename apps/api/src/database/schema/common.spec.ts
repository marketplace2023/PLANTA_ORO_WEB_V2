import { uuidv7 } from './common'

describe('uuidv7', () => {
  it('genera un UUID v7 válido (versión 7, variante RFC 4122)', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('codifica el timestamp en los primeros 48 bits', () => {
    const before = Date.now()
    const id = uuidv7()
    const after = Date.now()
    const ts = parseInt(id.replace(/-/g, '').slice(0, 12), 16)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('es ordenable por tiempo y no repite valores', async () => {
    const first = uuidv7()
    await new Promise((r) => setTimeout(r, 3))
    const second = uuidv7()
    expect(second > first).toBe(true)
    expect(new Set(Array.from({ length: 1000 }, uuidv7)).size).toBe(1000)
  })
})
