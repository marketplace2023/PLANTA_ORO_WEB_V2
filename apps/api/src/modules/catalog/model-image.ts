export { IMAGE_MAX_BYTES as MODEL_IMAGE_MAX_BYTES, inspectImage as inspectModelImage } from '../documents/image-upload'

/** Ruta (relativa a la API) de la imagen de un modelo; `v` evita servir de caché una imagen reemplazada. */
export const modelImagePath = (id: string, updatedAt: Date | string | null): string | null =>
  updatedAt ? `/catalog/models/${id}/image?v=${new Date(updatedAt).getTime()}` : null
