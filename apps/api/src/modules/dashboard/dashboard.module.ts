import { Module } from '@nestjs/common'
import { EcosystemDashboardController } from './ecosystem-dashboard.controller'

@Module({ controllers: [EcosystemDashboardController] })
export class DashboardModule {}
