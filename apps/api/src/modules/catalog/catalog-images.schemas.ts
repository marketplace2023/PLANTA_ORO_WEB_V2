import { z } from 'zod'

export const CATALOG_IMAGES_MAX_FILES = 500
export const previewCatalogImagesSchema = z.strictObject({
  files: z.array(z.strictObject({ name: z.string().min(1).max(255), size: z.number().int().nonnegative() })).min(1).max(CATALOG_IMAGES_MAX_FILES),
})
export const uploadCatalogImageSchema = z.strictObject({
  modelId: z.uuid(),
  imageVersion: z.string().max(64),
  replaceExisting: z.enum(['true', 'false']).transform(value => value === 'true'),
})
export type PreviewCatalogImagesDto = z.infer<typeof previewCatalogImagesSchema>
export type UploadCatalogImageDto = z.infer<typeof uploadCatalogImageSchema>

/** El nombre completo, sin la última extensión, es el TAG; nunca se hacen coincidencias parciales. */
export function imageFilenameTag(name: string): string | null {
  if (/[\\/]/.test(name) || !/\.(png|jpe?g|webp)$/i.test(name)) return null
  const tag = name.replace(/\.[^.]+$/, '').trim().toUpperCase()
  return tag && tag.length <= 100 ? tag : null
}
