import { randomUUID } from 'node:crypto'
import { Body, Controller, Delete, Get, Inject, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Response } from 'express'
import { DB, type Database } from '../../database/database.module'
import { courses, instructorProfiles } from '../../database/schema'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import type { AuthUser } from '../../common/types'
import { CurrentUser, Public } from '../iam/decorators'
import { StorageService } from '../documents/storage.service'
import { IMAGE_MAX_BYTES, inspectImage, setImageHeaders } from '../documents/image-upload'
import { CoursesService } from './courses.service'

const profileSchema = z.object({name:z.string().trim().min(2).max(160),headline:z.string().trim().max(200).default(''),bio:z.string().trim().max(4000).default('')})
@Injectable()
export class InstructorService {
  constructor(@Inject(DB) private readonly db: Database, private readonly storage: StorageService, private readonly coursesService: CoursesService) {}
  private dto(profile: typeof instructorProfiles.$inferSelect) {
    return {id:profile.id,name:profile.name,headline:profile.headline,bio:profile.bio,avatarUrl:profile.avatarKey ? `/instructors/${profile.id}/avatar?v=${profile.updatedAt.getTime()}` : null}
  }
  async mine(user: AuthUser) {
    const [profile] = await this.db.select().from(instructorProfiles).where(eq(instructorProfiles.id,user.id))
    return profile ? this.dto(profile) : null
  }
  async save(user: AuthUser, input: z.infer<typeof profileSchema>) {
    await this.db.transaction(async tx => {
      await tx.insert(instructorProfiles).values({id:user.id,...input}).onConflictDoUpdate({target:instructorProfiles.id,set:{...input,updatedAt:new Date()}})
      await tx.update(courses).set({instructorName:input.name,instructorBio:input.bio,updatedAt:new Date()}).where(eq(courses.instructorProfileId,user.id))
    })
    return this.mine(user)
  }
  async avatar(user: AuthUser, file?: Express.Multer.File) {
    const image = inspectImage(file)
    if (!await this.mine(user)) throw new NotFoundException('Guarda primero tu perfil de instructor')
    const key = `lms/instructors/${user.id}/${randomUUID()}.${image.extension}`
    await this.storage.put(key,image.data)
    let previous: string | null = null
    try {
      await this.db.transaction(async tx => {
        const [profile] = await tx.select().from(instructorProfiles).where(eq(instructorProfiles.id,user.id)).for('update')
        if (!profile) throw new NotFoundException('Perfil no disponible')
        previous = profile.avatarKey
        await tx.update(instructorProfiles).set({avatarKey:key,avatarMime:image.mimeType,updatedAt:new Date()}).where(eq(instructorProfiles.id,user.id))
      })
    } catch (error) { await this.storage.delete(key).catch(()=>undefined); throw error }
    if (previous) await this.storage.delete(previous).catch(()=>undefined)
    return this.mine(user)
  }
  async removeAvatar(user: AuthUser) {
    const previous = await this.db.transaction(async tx => {
      const [profile] = await tx.select().from(instructorProfiles).where(eq(instructorProfiles.id,user.id)).for('update')
      if (!profile) throw new NotFoundException('Perfil no disponible')
      await tx.update(instructorProfiles).set({avatarKey:null,avatarMime:null,updatedAt:new Date()}).where(eq(instructorProfiles.id,user.id))
      return profile.avatarKey
    })
    if (previous) await this.storage.delete(previous).catch(()=>undefined)
    return this.mine(user)
  }
  async link(id: string, user: AuthUser, detach = false) {
    await this.coursesService.assertManageCourse(id,user)
    const profile = detach ? null : await this.mine(user)
    if (!detach && !profile) throw new NotFoundException('Crea tu perfil en Mi perfil de instructor del portal de Cursos')
    await this.db.update(courses).set({instructorProfileId:profile?.id ?? null,...(profile ? {instructorName:profile.name,instructorBio:profile.bio} : {}),updatedAt:new Date()}).where(eq(courses.id,id))
    return this.coursesService.get(id,user)
  }
  async readAvatar(id: string, user?: AuthUser) {
    const [profile] = await this.db.select().from(instructorProfiles).where(eq(instructorProfiles.id,id))
    if (!profile?.avatarKey || !profile.avatarMime) throw new NotFoundException('Foto no disponible')
    if (user?.id !== id) {
      const linked = await this.db.select({id:courses.id}).from(courses).where(eq(courses.instructorProfileId,id))
      let visible = false
      for (const course of linked) { try { await this.coursesService.get(course.id,user); visible = true; break } catch (error) { if (!(error instanceof NotFoundException)) throw error } }
      if (!visible) throw new NotFoundException('Foto no disponible')
    }
    return {stream:await this.storage.open(profile.avatarKey),mime:profile.avatarMime}
  }
}
@Controller('instructors')
export class InstructorController {
  constructor(private readonly service: InstructorService) {}
  @Get('me') async mine(@CurrentUser() user: AuthUser) { return {profile:await this.service.mine(user)} }
  @Patch('me') save(@CurrentUser() user: AuthUser,@Body(new ZodValidationPipe(profileSchema)) body: z.infer<typeof profileSchema>) { return this.service.save(user,body) }
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:IMAGE_MAX_BYTES,files:1,fields:0}}))
  avatar(@CurrentUser() user: AuthUser,@UploadedFile() file?: Express.Multer.File) { return this.service.avatar(user,file) }
  @Delete('me/avatar') remove(@CurrentUser() user: AuthUser) { return this.service.removeAvatar(user) }
  @Public() @Get(':id/avatar')
  async read(@Param('id',ParseUUIDPipe) id: string,@CurrentUser() user: AuthUser | undefined,@Res({passthrough:true}) res: Response) {
    const image = await this.service.readAvatar(id,user); setImageHeaders(res,image.mime); res.set('Cache-Control','private, no-store'); return new StreamableFile(image.stream)
  }
}
@Controller('courses/:id/instructor-profile')
export class CourseInstructorController {
  constructor(private readonly service: InstructorService) {}
  @Post() link(@Param('id',ParseUUIDPipe) id: string,@CurrentUser() user: AuthUser) { return this.service.link(id,user) }
  @Delete() detach(@Param('id',ParseUUIDPipe) id: string,@CurrentUser() user: AuthUser) { return this.service.link(id,user,true) }
}
