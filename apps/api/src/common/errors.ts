import { BadRequestException } from '@nestjs/common'

/** 400 con el mismo formato que la validación de Zod, para que el frontend lo muestre bajo el campo. */
export const validationError = (path: string, message: string) =>
  new BadRequestException({ message: 'Datos inválidos', errors: [{ path, message }] })
