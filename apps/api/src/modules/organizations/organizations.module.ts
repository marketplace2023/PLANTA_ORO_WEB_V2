import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { DocumentsModule } from '../documents/documents.module'
import { IMAGE_MAX_BYTES } from '../documents/image-upload'
import { ContractorsService } from './contractors.service'
import { MarketplaceService } from './marketplace.service'
import { OrgAccessService } from './org-access.service'
import { ContractorsController, MarketplaceController, ProfessionalServicesController, ProvidersController } from './organizations.controllers'
import { ProvidersService } from './providers.service'

@Module({
  imports: [
    // El almacenamiento de objetos es el mismo de los documentos (StorageService); aquí solo se añade multer para las fotos.
    DocumentsModule,
    // En memoria porque se valida el contenido antes de escribir; el tope evita agotar la RAM del servidor.
    MulterModule.register({ storage: memoryStorage(), limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 5 } }),
  ],
  controllers: [ProvidersController, MarketplaceController, ContractorsController, ProfessionalServicesController],
  providers: [OrgAccessService, ProvidersService, MarketplaceService, ContractorsService],
  exports: [OrgAccessService, ProvidersService, MarketplaceService, ContractorsService],
})
export class OrganizationsModule {}
