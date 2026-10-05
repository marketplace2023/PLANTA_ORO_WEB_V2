import { Module } from '@nestjs/common'
import { PlantsModule } from '../plants/plants.module'
import { ProcessController } from './process.controller'
import { ProcessService } from './process.service'

@Module({
  imports: [PlantsModule],
  controllers: [ProcessController],
  providers: [ProcessService],
})
export class ProcessModule {}
