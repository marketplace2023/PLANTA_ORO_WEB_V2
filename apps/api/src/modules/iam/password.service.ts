import { Injectable } from '@nestjs/common'
import { hash, verify } from '@node-rs/argon2'

/** Argon2id con los parámetros por defecto de @node-rs/argon2 (OWASP: m=19456 KiB, t=2, p=1). Arquitectura §40. */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>

  hash(password: string): Promise<string> {
    return hash(password)
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password)
    } catch {
      return false
    }
  }

  /**
   * Gasta el mismo tiempo que una verificación real. Se usa cuando el usuario no existe
   * para que la respuesta de /auth/login no revele qué correos están registrados.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= hash('fur-dummy-password')
    await this.verify(await this.dummyHash, password)
    return false
  }
}
