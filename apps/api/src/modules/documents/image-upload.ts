import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import type { Response } from 'express'
import { inspectUpload } from './file-validation'

/** Tope de una foto (modelo del catálogo, producto o logo): es una imagen de referencia, no un documento. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

export type ImageUpload = { data: Buffer; mimeType: string; extension: string }

/**
 * Valida una foto subida: solo PNG, JPG o WebP (SVG y HTML quedan fuera: servirlos desde nuestro dominio
 * permitiría XSS almacenado) y el contenido debe corresponder a la extensión. El tipo declarado por el cliente
 * nunca se usa; el servidor decide el tipo a partir del contenido.
 */
export function inspectImage(file: Express.Multer.File | undefined): ImageUpload {
  if (!file) throw new BadRequestException('Adjunta la imagen en el campo "file"')
  if (file.size > IMAGE_MAX_BYTES) throw new PayloadTooLargeException(`La imagen supera el máximo de ${IMAGE_MAX_BYTES / 1024 / 1024} MB`)
  const info = inspectUpload(file.originalname, file.buffer)
  if (!IMAGE_EXTENSIONS.includes(info.extension)) {
    throw new UnsupportedMediaTypeException(`La imagen debe ser ${IMAGE_EXTENSIONS.join(', ')} (recibido .${info.extension})`)
  }
  return { data: file.buffer, mimeType: info.mimeType, extension: info.extension === 'jpeg' ? 'jpg' : info.extension }
}

/** Cabeceras para servir una foto pública. La URL lleva `?v=<versión>`: reemplazarla cambia la URL, así que puede cachearse. */
export function setImageHeaders(res: Response, mimeType: string) {
  res.set({
    'Content-Type': mimeType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=86400',
    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    // helmet pone same-origin por defecto; las webs del ecosistema viven en otro origen y deben poder mostrarla.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
}
