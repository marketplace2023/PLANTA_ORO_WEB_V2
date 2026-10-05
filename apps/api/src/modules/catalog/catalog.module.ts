import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { DocumentsModule } from '../documents/documents.module'
import { CatalogAdminController } from './catalog-admin.controller'
import { CatalogController } from './catalog.controller'
import { MODEL_IMAGE_MAX_BYTES } from './model-image'

@Module({
  imports: [
    // El almacenamiento de objetos es el mismo de los documentos (StorageService); aquí solo se añade multer para las fotos.
    DocumentsModule,
    // En memoria porque se valida el contenido antes de escribir; el tope evita agotar la RAM del servidor.
    MulterModule.register({ storage: memoryStorage(), limits: { fileSize: MODEL_IMAGE_MAX_BYTES, files: 1, fields: 5 } }),
  ],
  controllers: [CatalogController, CatalogAdminController],
})
export class CatalogModule {}
