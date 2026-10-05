import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common'
import { ALLOWED_EXTENSIONS, cleanFileName, contentDisposition, inspectUpload } from './file-validation'

const pdf = Buffer.from('%PDF-1.7\n%%EOF')
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])

describe('inspectUpload', () => {
  it.each([
    ['manual.pdf', pdf, 'application/pdf', true],
    ['foto.png', png, 'image/png', true],
    ['foto.jpg', jpg, 'image/jpeg', true],
    ['foto.jpeg', jpg, 'image/jpeg', true],
    ['foto.webp', webp, 'image/webp', true],
    ['informe.docx', zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false],
    ['datos.xlsx', zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false],
    ['charla.pptx', zip, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false],
    ['viejo.doc', ole, 'application/msword', false],
    ['viejo.xls', ole, 'application/vnd.ms-excel', false],
    ['datos.csv', Buffer.from('a,b\n1,2'), 'text/csv', false],
    ['notas.txt', Buffer.from('hola'), 'text/plain', false],
  ])('acepta %s y fija el tipo canónico %s', (name, data, mime, inline) => {
    expect(inspectUpload(name, data)).toMatchObject({ mimeType: mime, inline })
  })

  it('la extensión no distingue mayúsculas', () => {
    expect(inspectUpload('MANUAL.PDF', pdf)).toMatchObject({ extension: 'pdf', mimeType: 'application/pdf' })
  })

  it.each(['virus.exe', 'pagina.html', 'imagen.svg', 'script.js', 'macro.xlsm', 'archivo.zip', 'sin-extension', 'doble.pdf.exe', 'oculto.', '.pdf'])(
    'rechaza %s (tipo no permitido)',
    (name) => {
      expect(() => inspectUpload(name, pdf)).toThrow(UnsupportedMediaTypeException)
    },
  )

  it('HTML y SVG nunca se aceptan (XSS almacenado)', () => {
    expect(ALLOWED_EXTENSIONS).not.toEqual(expect.arrayContaining(['html', 'htm', 'svg', 'js']))
  })

  it('rechaza si el contenido no corresponde a la extensión', () => {
    expect(() => inspectUpload('falso.pdf', png)).toThrow(/no corresponde/)
    expect(() => inspectUpload('falso.png', pdf)).toThrow(UnsupportedMediaTypeException)
    expect(() => inspectUpload('falso.docx', pdf)).toThrow(UnsupportedMediaTypeException)
    expect(() => inspectUpload('script-disfrazado.pdf', Buffer.from('<script>alert(1)</script>'))).toThrow(UnsupportedMediaTypeException)
  })

  it('un .txt/.csv con bytes binarios (NUL) no es texto', () => {
    expect(() => inspectUpload('binario.txt', Buffer.from([0x68, 0x00, 0x69]))).toThrow(UnsupportedMediaTypeException)
  })

  it('rechaza archivos vacíos', () => {
    expect(() => inspectUpload('vacio.pdf', Buffer.alloc(0))).toThrow(BadRequestException)
  })
})

describe('cleanFileName', () => {
  it('recorta rutas (path traversal) y conserva solo el nombre', () => {
    expect(cleanFileName('../../etc/passwd.pdf')).toBe('passwd.pdf')
    expect(cleanFileName('C:\\Users\\x\\manual.pdf')).toBe('manual.pdf')
  })

  it('recupera UTF-8 que multer decodificó como latin1', () => {
    const mojibake = Buffer.from('Manual de operación ñ.pdf', 'utf8').toString('latin1')
    expect(cleanFileName(mojibake)).toBe('Manual de operación ñ.pdf')
  })

  it('reemplaza caracteres de control y peligrosos', () => {
    expect(cleanFileName('a"b<c>d|e:f*g?.pdf')).toBe('a_b_c_d_e_f_g_.pdf')
    expect(cleanFileName('con\nsalto\u0000.pdf')).toBe('con_salto_.pdf')
  })

  it('limita la longitud y nunca devuelve vacío', () => {
    expect(cleanFileName('x'.repeat(400) + '.pdf').length).toBeLessThanOrEqual(255)
    expect(cleanFileName('   ')).toBe('archivo')
  })
})

describe('contentDisposition', () => {
  it('incluye nombre ASCII de respaldo y filename* en UTF-8', () => {
    const header = contentDisposition('attachment', 'Manual de operación.pdf')
    expect(header).toContain('attachment; filename="Manual de operaci_n.pdf"')
    expect(header).toContain("filename*=UTF-8''Manual%20de%20operaci%C3%B3n.pdf")
  })

  it('no permite inyectar cabeceras ni comillas', () => {
    const header = contentDisposition('inline', 'a"; foo=bar\r\nX-Evil: 1.pdf')
    expect(header).not.toMatch(/[\r\n]/)
    expect(header.split('"').length).toBe(3) // solo las dos comillas del filename
  })
})
