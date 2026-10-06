import { apiUrl } from '@/lib/api'

const isExternal = (url: string) => /^https?:\/\//i.test(url)

/** Una imagen puede ser una URL externa (http/https) o una ruta de la API (foto subida): se resuelve para usarla en <img>. */
export const imageSrc = (url: string | null | undefined): string | null => (url ? (isExternal(url) ? url : apiUrl(url)) : null)

/** Solo las URL externas se editan como texto: la foto subida se gestiona aparte y su ruta de la API no es una URL válida para el formulario. */
export const externalUrlOnly = (url: string | null | undefined): string => (url && isExternal(url) ? url : '')
