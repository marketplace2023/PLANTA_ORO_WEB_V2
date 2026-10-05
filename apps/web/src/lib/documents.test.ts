import { describe, expect, it, vi } from 'vitest'
import { ALLOWED_EXTENSIONS, canPreview, extensionOf, formatBytes, iconForMime, MAX_UPLOAD_BYTES, saveBlob, typeLabel, validateFile } from './documents'

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name)

describe('validateFile (espejo del backend)', () => {
  it('acepta todas las extensiones permitidas', () => {
    for (const ext of ALLOWED_EXTENSIONS) expect(validateFile(file(`x.${ext}`))).toBeUndefined()
  })

  it('no distingue mayúsculas en la extensión', () => {
    expect(validateFile(file('MANUAL.PDF'))).toBeUndefined()
  })

  it('exige un archivo', () => {
    expect(validateFile(null)).toBe('Selecciona un archivo')
  })

  it.each(['virus.exe', 'pagina.html', 'dibujo.svg', 'script.js', 'sin-extension', 'doble.pdf.exe'])('rechaza %s', (name) => {
    expect(validateFile(file(name))).toMatch(/Tipo no permitido/)
  })

  it('rechaza vacíos y demasiado grandes', () => {
    expect(validateFile(file('a.pdf', 0))).toBe('El archivo está vacío')
    const big = file('a.pdf')
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })
    expect(validateFile(big)).toMatch(/supera el máximo de 25\.0 MB/)
  })
})

describe('utilidades de documentos', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2_621_440)).toBe('2.5 MB')
  })

  it('canPreview: solo PDF e imágenes', () => {
    for (const mime of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']) expect(canPreview(mime)).toBe(true)
    for (const mime of ['image/svg+xml', 'text/html', 'application/msword', 'text/plain']) expect(canPreview(mime)).toBe(false)
  })

  it('extensionOf y typeLabel', () => {
    expect(extensionOf('Informe.Final.PDF')).toBe('pdf')
    expect(typeLabel('MANUAL')).toBe('Manuales')
    expect(typeLabel('NUEVO')).toBe('NUEVO')
  })

  it('iconForMime devuelve un icono para cualquier tipo', () => {
    for (const mime of ['image/png', 'application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/zip']) {
      expect(iconForMime(mime)).toBeTruthy()
    }
  })

  it('saveBlob descarga con el nombre indicado y libera el object URL', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    saveBlob(new Blob(['x']), 'Manual.pdf')

    expect(create).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:x')
    expect(document.querySelector('a[download]')).toBeNull() // no deja el enlace en el DOM
    vi.restoreAllMocks()
  })
})
