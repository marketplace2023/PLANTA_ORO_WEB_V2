import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { DocumentsModule } from '../documents/documents.module'
import { IMAGE_MAX_BYTES } from '../documents/image-upload'
import { NetworksAdminController } from './networks-admin.controller'
import { NetworksController } from './networks.controller'

@Module({
  imports: [
    // El almacenamiento de objetos es el de los documentos (StorageService); aquí solo se añade multer para la imagen.
    DocumentsModule,
    MulterModule.register({ storage: memoryStorage(), limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 5 } }),
  ],
  controllers: [NetworksController, NetworksAdminController],
})
export class NetworksModule {}
