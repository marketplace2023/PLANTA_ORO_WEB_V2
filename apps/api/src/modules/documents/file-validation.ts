import path from 'node:path'
import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common'

type Rule = { mime: string; /** Se puede mostrar en el navegador (vista previa). */ inline: boolean; matches: (b: Buffer) => boolean }

const startsWith = (...bytes: number[]) => (b: Buffer) => bytes.every((v, i) => b[i] === v)
const isText = (b: Buffer) => !b.subarray(0, 8000).includes(0) // sin bytes NUL: no es un binario disfrazado
const isZip = startsWith(0x50, 0x4b, 0x03, 0x04)
const isOle = startsWith(0xd0, 0xcf, 0x11, 0xe0)

/**
 * Lista blanca por extensión Y contenido. HTML y SVG quedan fuera a propósito: servirlos desde nuestro
 * dominio permitiría XSS almacenado. El tipo declarado por el cliente (Content-Type) nunca se usa.
 */
const RULES: Record<string, Rule> = {
  pdf: { mime: 'application/pdf', inline: true, matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  png: { mime: 'image/png', inline: true, matches: startsWith(0x89, 0x50, 0x4e, 0x47) },
  jpg: { mime: 'image/jpeg', inline: true, matches: startsWith(0xff, 0xd8, 0xff) },
  jpeg: { mime: 'image/jpeg', inline: true, matches: startsWith(0xff, 0xd8, 0xff) },
  webp: { mime: 'image/webp', inline: true, matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false, matches: isZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false, matches: isZip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false, matches: isZip },
  doc: { mime: 'application/msword', inline: false, matches: isOle },
  xls: { mime: 'application/vnd.ms-excel', inline: false, matches: isOle },
  csv: { mime: 'text/csv', inline: false, matches: isText },
  txt: { mime: 'text/plain', inline: false, matches: isText },
}

export const ALLOWED_EXTENSIONS = Object.keys(RULES)

export type UploadInfo = { originalName: string; extension: string; mimeType: string; inline: boolean }

/** multer decodifica el nombre como latin1: se recupera el UTF-8 original y se limpia. */
export function cleanFileName(raw: string): string {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8')
  const decoded = utf8.includes('\uFFFD') ? raw : utf8
  // eslint-disable-next-line no-control-regex
  const name = path.basename(decoded.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '_').trim()
  return name.slice(-255) || 'archivo'
}

export function inspectUpload(rawName: string, data: Buffer): UploadInfo {
  const originalName = cleanFileName(rawName)
  const extension = path.extname(originalName).slice(1).toLowerCase()
  const rule = RULES[extension]

  if (!rule) {
    throw new UnsupportedMediaTypeException(`Tipo de archivo no permitido (.${extension || '?'}). Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }
  if (data.length === 0) throw new BadRequestException('El archivo está vacío')
  if (!rule.matches(data)) {
    throw new UnsupportedMediaTypeException(`El contenido del archivo no corresponde a su extensión .${extension}`)
  }
  return { originalName, extension, mimeType: rule.mime, inline: rule.inline }
}

/** Content-Disposition seguro: nombre ASCII de respaldo + filename* en UTF-8 (RFC 6266). */
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
