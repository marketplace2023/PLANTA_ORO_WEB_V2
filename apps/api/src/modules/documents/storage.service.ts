import { createReadStream } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../../config/env'

/**
 * Almacenamiento de objetos (arquitectura §45). La base de datos solo guarda `storage_key`.
 * Hoy hay un driver de disco local; un driver S3-compatible se enchufa implementando esta misma interfaz.
 */
export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>
  abstract open(key: string): Promise<Readable>
  abstract delete(key: string): Promise<void>
}

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly root: string

  constructor(config: ConfigService<Env, true>) {
    super()
    this.root = path.resolve(config.get('STORAGE_DIR', { infer: true }))
  }

  /** Las claves las genera el servidor, pero se valida igualmente que nunca salgan de la carpeta raíz. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key)
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error('Clave de almacenamiento inválida')
    return full
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key)
    await mkdir(path.dirname(file), { recursive: true })
    // 'wx': nunca sobrescribe un objeto existente (los archivos de versiones anteriores son inmutables).
    await writeFile(file, data, { flag: 'wx' })
  }

  async open(key: string) {
    const file = this.resolve(key)
    await access(file)
    return createReadStream(file)
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true })
  }
}
