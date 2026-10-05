export const MODEL_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const MODEL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Validación en el navegador (el servidor valida de nuevo el contenido real): da el error antes de enviar nada. */
export function validateModelImage(file: Pick<File, 'type' | 'size'>): string | null {
  if (!MODEL_IMAGE_TYPES.includes(file.type)) return 'Usa una imagen PNG, JPG o WebP.'
  if (file.size > MODEL_IMAGE_MAX_BYTES) return `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${MODEL_IMAGE_MAX_BYTES / 1024 / 1024} MB.`
  return null
}
