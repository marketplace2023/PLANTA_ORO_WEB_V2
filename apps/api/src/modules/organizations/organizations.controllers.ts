import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import type { AppRequest, AuthUser } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { setImageHeaders } from '../documents/image-upload'
import { CurrentUser, Public } from '../iam/decorators'
import { ContractorsService } from './contractors.service'
import { MarketplaceService } from './marketplace.service'
import { OrgAccessService } from './org-access.service'
import {
  type AddMemberDto,
  addMemberSchema,
  type CreateContractorDto,
  createContractorSchema,
  type CreateListingDto,
  createListingSchema,
  type CreateProviderDto,
  createProviderSchema,
  type CreateServiceDto,
  createServiceSchema,
  type ListContractorsQuery,
  listContractorsQuerySchema,
  type ListListingsQuery,
  listListingsQuerySchema,
  type ListProviderListingsQuery,
  listProviderListingsQuerySchema,
  type ListProvidersQuery,
  listProvidersQuerySchema,
  type ListServicesQuery,
  listServicesQuerySchema,
  type UpdateContractorDto,
  updateContractorSchema,
  type UpdateListingDto,
  updateListingSchema,
  type UpdateProviderDto,
  updateProviderSchema,
  type UpdateServiceDto,
  updateServiceSchema,
} from './organizations.schemas'
import { ProvidersService } from './providers.service'

/**
 * Proveedores, contratistas y marketplace son GLOBALES: no cuelgan de una planta. Lo público (listados y fichas)
 * se lee sin sesión; la gestión exige ser miembro de la organización o administrador del ecosistema.
 */
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly market: MarketplaceService,
    private readonly access: OrgAccessService,
  ) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(listProvidersQuerySchema)) q: ListProvidersQuery, @CurrentUser() user?: AuthUser) {
    return this.providers.list(q, user)
  }

  // Debe ir antes de ':id' para que "mine" no se interprete como un identificador.
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.providers.mine(user)
  }

  /** Cualquier usuario con sesión puede solicitar el registro; el administrador lo aprueba. */
  @Post()
  create(@Body(new ZodValidationPipe(createProviderSchema)) dto: CreateProviderDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.providers.create(dto, user, req)
  }

  @Public()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.providers.get(id, user)
  }

  /** Logo del proveedor (público). */
  @Public()
  @Get(':id/logo')
  async logo(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, mime } = await this.providers.openLogo(id)
    setImageHeaders(res, mime)
    return new StreamableFile(stream)
  }

  /** multipart/form-data con el campo `file`. Los guards y la membresía se validan antes de procesar el archivo. */
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  setLogo(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.providers.setLogo(id, file, user, req)
  }

  @Delete(':id/logo')
  @HttpCode(204)
  removeLogo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.providers.removeLogo(id, user, req)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateProviderSchema)) dto: UpdateProviderDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.providers.update(id, dto, user, req)
  }

  @Get(':id/dashboard')
  dashboard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.providers.dashboard(id, user)
  }

  // ----- Miembros -----

  @Get(':id/members')
  members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.providers.loadVisible(id, user).then(() => this.access.list('provider', id, user))
  }

  @Post(':id/members')
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.providers.loadVisible(id, user).then(() => this.access.add('provider', id, dto, user, req))
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.providers.loadVisible(id, user).then(() => this.access.remove('provider', id, userId, user, req))
  }

  // ----- Productos del proveedor -----

  @Get(':id/listings')
  listings(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(listProviderListingsQuerySchema)) q: ListProviderListingsQuery, @CurrentUser() user: AuthUser) {
    return this.market.listForProvider(id, q, user)
  }

  @Post(':id/listings')
  createListing(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(createListingSchema)) dto: CreateListingDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.market.create(id, dto, user, req)
  }

  @Patch(':id/listings/:listingId')
  updateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body(new ZodValidationPipe(updateListingSchema)) dto: UpdateListingDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.market.update(id, listingId, dto, user, req)
  }

  /** multipart/form-data con el campo `file`: foto del producto (reemplaza la anterior). */
  @Post(':id/listings/:listingId/image')
  @UseInterceptors(FileInterceptor('file'))
  setListingImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.market.setImage(id, listingId, file, user, req)
  }

  @Delete(':id/listings/:listingId/image')
  @HttpCode(204)
  removeListingImage(@Param('id', ParseUUIDPipe) id: string, @Param('listingId', ParseUUIDPipe) listingId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.market.removeImage(id, listingId, user, req)
  }
}

@Public()
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly market: MarketplaceService) {}

  @Get('listings')
  list(@Query(new ZodValidationPipe(listListingsQuerySchema)) q: ListListingsQuery) {
    return this.market.listPublic(q)
  }

  @Get('listings/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.market.getPublic(id, user)
  }

  /** Foto del producto (pública). */
  @Get('listings/:id/image')
  async image(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, mime } = await this.market.openImage(id)
    setImageHeaders(res, mime)
    return new StreamableFile(stream)
  }
}

@Controller('contractors')
export class ContractorsController {
  constructor(
    private readonly contractors: ContractorsService,
    private readonly access: OrgAccessService,
  ) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(listContractorsQuerySchema)) q: ListContractorsQuery, @CurrentUser() user?: AuthUser) {
    return this.contractors.list(q, user)
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.contractors.mine(user)
  }

  @Post()
  create(@Body(new ZodValidationPipe(createContractorSchema)) dto: CreateContractorDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.create(dto, user, req)
  }

  @Public()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.contractors.get(id, user)
  }

  /** Logo del contratista (público). */
  @Public()
  @Get(':id/logo')
  async logo(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, mime } = await this.contractors.openLogo(id)
    setImageHeaders(res, mime)
    return new StreamableFile(stream)
  }

  /** multipart/form-data con el campo `file`. La membresía se valida antes de procesar el archivo. */
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  setLogo(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.setLogo(id, file, user, req)
  }

  @Delete(':id/logo')
  @HttpCode(204)
  removeLogo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.removeLogo(id, user, req)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateContractorSchema)) dto: UpdateContractorDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.update(id, dto, user, req)
  }

  @Get(':id/members')
  members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.contractors.loadVisible(id, user).then(() => this.access.list('contractor', id, user))
  }

  @Post(':id/members')
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.loadVisible(id, user).then(() => this.access.add('contractor', id, dto, user, req))
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.loadVisible(id, user).then(() => this.access.remove('contractor', id, userId, user, req))
  }

  @Post(':id/services')
  createService(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(createServiceSchema)) dto: CreateServiceDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.contractors.createService(id, dto, user, req)
  }

  @Patch(':id/services/:serviceId')
  updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: UpdateServiceDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.contractors.updateService(id, serviceId, dto, user, req)
  }
}

@Public()
@Controller('professional-services')
export class ProfessionalServicesController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listServicesQuerySchema)) q: ListServicesQuery, @CurrentUser() user?: AuthUser) {
    return this.contractors.listServices(q, user)
  }

  @Get('specialties')
  specialties() {
    return this.contractors.specialties()
  }
}
