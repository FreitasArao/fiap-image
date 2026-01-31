import { BaseElysia } from '@core/libs/elysia'
import { healthRouter } from './health.route'

export const healthRoutes = BaseElysia.create({
  prefix: '/health',
}).use(healthRouter)
