import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import { inspectUpload } from '../documents/file-validation'

/** Tope de la foto de un modelo: es una imagen de referencia, no un documento. */
export const MODEL_IMAGE_MAX_BYTES = 5 * 1024 * 1024

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

export type ModelImage = { data: Buffer; mimeType: string; extension: string }

/**
 * Valida la foto de un modelo: solo PNG, JPG o WebP (SVG y HTML quedan fuera: servirlos desde nuestro dominio
 * permitiría XSS almacenado) y el contenido debe corresponder a la extensión. El tipo declarado por el cliente
 * nunca se usa; el servidor decide el tipo a partir del contenido.
 */
export function inspectModelImage(file: Express.Multer.File | undefined): ModelImage {
  if (!file) throw new BadRequestException('Adjunta la imagen en el campo "file"')
  if (file.size > MODEL_IMAGE_MAX_BYTES) throw new PayloadTooLargeException(`La imagen supera el máximo de ${MODEL_IMAGE_MAX_BYTES / 1024 / 1024} MB`)
  const info = inspectUpload(file.originalname, file.buffer)
  if (!IMAGE_EXTENSIONS.includes(info.extension)) {
    throw new UnsupportedMediaTypeException(`La foto del modelo debe ser ${IMAGE_EXTENSIONS.join(', ')} (recibido .${info.extension})`)
  }
  return { data: file.buffer, mimeType: info.mimeType, extension: info.extension === 'jpeg' ? 'jpg' : info.extension }
}

/** Ruta (relativa a la API) de la imagen de un modelo; `v` evita servir de caché una imagen reemplazada. */
export const modelImagePath = (id: string, updatedAt: Date | string | null): string | null =>
  updatedAt ? `/catalog/models/${id}/image?v=${new Date(updatedAt).getTime()}` : null
