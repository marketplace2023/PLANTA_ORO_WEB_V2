import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { DocumentsModule } from '../documents/documents.module'
import { CatalogAdminController } from './catalog-admin.controller'
import { CatalogController } from './catalog.controller'
import { CatalogVariablesAdminController, CatalogVariablesController } from './variables.controller'
import { MODEL_IMAGE_MAX_BYTES } from './model-image'
import { CatalogImportController } from './catalog-import.controller'
import { CatalogImportService } from './catalog-import.service'
import { CatalogDeleteController } from './catalog-delete.controller'
import { CatalogDeleteService } from './catalog-delete.service'
import { CatalogImagesController } from './catalog-images.controller'
import { CatalogImagesService } from './catalog-images.service'

@Module({
  imports: [
    // El almacenamiento de objetos es el mismo de los documentos (StorageService); aquí solo se añade multer para las fotos.
    DocumentsModule,
    // En memoria porque se valida el contenido antes de escribir; el tope evita agotar la RAM del servidor.
    MulterModule.register({ storage: memoryStorage(), limits: { fileSize: MODEL_IMAGE_MAX_BYTES, files: 1, fields: 5 } }),
  ],
  controllers: [CatalogController, CatalogAdminController, CatalogVariablesController, CatalogVariablesAdminController, CatalogImportController, CatalogDeleteController, CatalogImagesController],
  providers: [CatalogImportService, CatalogDeleteService, CatalogImagesService],
})
export class CatalogModule {}
