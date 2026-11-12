import { InstructorController, InstructorService, CourseInstructorController } from './instructor.controller'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MulterModule } from '@nestjs/platform-express'
import type { Env } from '../../config/env'
import { DocumentsModule } from '../documents/documents.module'
import { LessonVideoController, LessonVideoManageGuard, videoUploadStorage } from './lesson-video.controller'
import { LessonVideoService } from './lesson-video.service'
import { OrganizationsModule } from '../organizations/organizations.module'
import { CoursesService } from './courses.service'
import { LearningService } from './learning.service'
import { CourseCoverController, CourseCoverManageGuard } from './course-cover.controller'
import { CertificatesController, CoursesController } from './lms.controller'

@Module({
  imports: [OrganizationsModule, DocumentsModule, MulterModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService<Env, true>) => ({ storage: videoUploadStorage, limits: { fileSize: config.get('MAX_VIDEO_UPLOAD_MB', { infer: true }) * 1024 * 1024, files: 1, fields: 0 } }) })],
  controllers: [InstructorController, CourseInstructorController, CoursesController, CertificatesController, LessonVideoController, CourseCoverController],
  providers: [InstructorService, CoursesService, LearningService, LessonVideoService, LessonVideoManageGuard, CourseCoverManageGuard],
})
export class LmsModule {}
