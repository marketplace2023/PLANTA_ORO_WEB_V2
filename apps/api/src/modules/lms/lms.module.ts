import { Module } from '@nestjs/common'
import { OrganizationsModule } from '../organizations/organizations.module'
import { CoursesService } from './courses.service'
import { LearningService } from './learning.service'
import { CertificatesController, CoursesController } from './lms.controller'

@Module({
  imports: [OrganizationsModule],
  controllers: [CoursesController, CertificatesController],
  providers: [CoursesService, LearningService],
})
export class LmsModule {}
