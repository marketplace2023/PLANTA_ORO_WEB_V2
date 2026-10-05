import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export default async function globalTeardown() {
  // En Windows un archivo recién escrito puede seguir retenido unos ms (antivirus/indexador): se reintenta.
  // Limpiar un directorio temporal nunca debe hacer fallar toda la suite.
  try {
    await rm(path.join(os.tmpdir(), 'fur-e2e-storage'), { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
  } catch (err) {
    console.warn('No se pudo limpiar el almacenamiento temporal de pruebas:', (err as Error).message)
  }
}
