import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ConfigService } from '@nestjs/config'
import { LocalStorageService } from './storage.service'

describe('LocalStorageService', () => {
  let dir: string
  let storage: LocalStorageService

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'fur-storage-'))
    storage = new LocalStorageService({ get: () => dir } as unknown as ConfigService<never, true>)
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const read = async (stream: NodeJS.ReadableStream) => {
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.from(c))
    return Buffer.concat(chunks)
  }

  it('guarda y recupera un objeto (creando carpetas intermedias)', async () => {
    await storage.put('planta/doc/v1-abc.pdf', Buffer.from('contenido'))
    expect((await read(await storage.open('planta/doc/v1-abc.pdf'))).toString()).toBe('contenido')
    expect((await readFile(path.join(dir, 'planta/doc/v1-abc.pdf'))).toString()).toBe('contenido')
  })

  it('nunca sobrescribe un objeto existente (las versiones son inmutables)', async () => {
    await storage.put('a/b.pdf', Buffer.from('uno'))
    await expect(storage.put('a/b.pdf', Buffer.from('dos'))).rejects.toThrow()
    expect((await read(await storage.open('a/b.pdf'))).toString()).toBe('uno')
  })

  it('rechaza claves que escapan de la carpeta raíz (path traversal)', async () => {
    for (const key of ['../fuera.pdf', '../../etc/passwd', 'a/../../fuera.pdf', '/etc/passwd']) {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Clave de almacenamiento inválida')
      await expect(storage.open(key)).rejects.toThrow()
    }
  })

  it('abrir un objeto inexistente falla; borrar uno inexistente no', async () => {
    await expect(storage.open('no/existe.pdf')).rejects.toThrow()
    await expect(storage.delete('no/existe.pdf')).resolves.toBeUndefined()
  })

  it('borra un objeto', async () => {
    await storage.put('x/y.pdf', Buffer.from('1'))
    await storage.delete('x/y.pdf')
    await expect(storage.open('x/y.pdf')).rejects.toThrow()
  })
})
