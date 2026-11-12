import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { catchError, throwError } from 'rxjs'
import { isUniqueViolation } from '../../common/db-errors'
@Injectable()
export class LuloDbInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) { return next.handle().pipe(catchError(error => throwError(() => isUniqueViolation(error) ? new ConflictException('Ya existe un registro con ese código o referencia en esta planta. Revisa el listado antes de repetirlo') : error))) }
}
