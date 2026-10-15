import { createReadStream } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../../config/env'

/**
 * Almacenamiento de objetos (arquitectura §45). La base de datos solo guarda `storage_key`.
 * Hay dos drivers con la misma interfaz: disco local (desarrollo) y S3 (AWS), elegidos con `STORAGE_DRIVER`.
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

/** Mínimo del cliente S3 que usa el driver (permite probarlo sin red). */
export type S3Like = Pick<S3Client, 'send'>

/**
 * Driver S3: los objetos viven en un bucket privado y se sirven siempre a través de la API (que valida permisos).
 * Las credenciales las resuelve el SDK desde el rol IAM del servicio; no hay claves en la configuración.
 */
@Injectable()
export class S3StorageService extends StorageService {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Like,
  ) {
    super()
  }

  static fromConfig(config: ConfigService<Env, true>): S3StorageService {
    const region = config.get('S3_REGION', { infer: true })
    return new S3StorageService(config.get('S3_BUCKET', { infer: true }), new S3Client(region ? { region } : {}))
  }

  /** Mismo contrato que el disco: las claves las genera el servidor y nunca se sobrescribe un objeto existente. */
  async put(key: string, data: Buffer) {
    if (!key || key.startsWith('/') || key.split('/').includes('..')) throw new Error('Clave de almacenamiento inválida')
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, IfNoneMatch: '*' }))
  }

  async open(key: string) {
    if (!key || key.startsWith('/') || key.split('/').includes('..')) throw new Error('Clave de almacenamiento inválida')
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!res.Body) throw new Error('Objeto vacío')
    return res.Body as Readable
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
