import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/** Valida el body/query con un schema de Zod y devuelve el dato ya tipado y normalizado. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    return result.data
  }
}
