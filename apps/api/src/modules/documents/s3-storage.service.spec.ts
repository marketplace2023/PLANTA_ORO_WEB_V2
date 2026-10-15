import { Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3StorageService } from './storage.service'

describe('S3StorageService', () => {
  const send = jest.fn()
  const storage = new S3StorageService('fur-archivos', { send } as never)

  beforeEach(() => send.mockReset())

  it('guarda sin sobrescribir (If-None-Match: *) en el bucket configurado', async () => {
    send.mockResolvedValue({})
    await storage.put('planta/doc/v1.pdf', Buffer.from('contenido'))
    const cmd = send.mock.calls[0][0] as PutObjectCommand
    expect(cmd).toBeInstanceOf(PutObjectCommand)
    expect(cmd.input).toMatchObject({ Bucket: 'fur-archivos', Key: 'planta/doc/v1.pdf', IfNoneMatch: '*' })
    expect((cmd.input.Body as Buffer).toString()).toBe('contenido')
  })

  it('un objeto que ya existe hace fallar el guardado (las versiones son inmutables)', async () => {
    send.mockRejectedValue(Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' }))
    await expect(storage.put('a/b.pdf', Buffer.from('x'))).rejects.toThrow('PreconditionFailed')
  })

  it('abre un objeto como stream', async () => {
    send.mockResolvedValue({ Body: Readable.from([Buffer.from('hola')]) })
    const stream = await storage.open('a/b.pdf')
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.from(c))
    expect(Buffer.concat(chunks).toString()).toBe('hola')
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand)
  })

  it('un objeto inexistente rechaza (el llamador lo traduce a 404)', async () => {
    send.mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }))
    await expect(storage.open('no/existe.pdf')).rejects.toThrow('NoSuchKey')
  })

  it('elimina el objeto', async () => {
    send.mockResolvedValue({})
    await storage.delete('a/b.pdf')
    const cmd = send.mock.calls[0][0] as DeleteObjectCommand
    expect(cmd).toBeInstanceOf(DeleteObjectCommand)
    expect(cmd.input).toMatchObject({ Bucket: 'fur-archivos', Key: 'a/b.pdf' })
  })

  it('rechaza claves que escapan o son absolutas', async () => {
    for (const key of ['../fuera.pdf', 'a/../../x.pdf', '/etc/passwd', '']) {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Clave de almacenamiento inválida')
      await expect(storage.open(key)).rejects.toThrow('Clave de almacenamiento inválida')
    }
    expect(send).not.toHaveBeenCalled()
  })
})
