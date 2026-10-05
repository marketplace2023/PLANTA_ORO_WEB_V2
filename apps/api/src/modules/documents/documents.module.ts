import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { Env } from '../../config/env'
import { PlantsModule } from '../plants/plants.module'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'
import { LocalStorageService, StorageService } from './storage.service'

@Module({
  imports: [
    PlantsModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // En memoria porque se valida el contenido antes de escribir; el tope evita agotar la RAM del servidor.
        storage: memoryStorage(),
        limits: { fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024, files: 1, fields: 20 },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, { provide: StorageService, useClass: LocalStorageService }],
  exports: [DocumentsService, StorageService],
})
export class DocumentsModule {}
