import { BaseElysia } from '@core/libs/elysia'
import { simulateUploadPartRoute } from './upload-part.route'
import { simulateCompleteUploadRoute } from './complete-upload.route'

export const simulateRoutes = BaseElysia.create({ prefix: 'simulate' })
  .use(simulateUploadPartRoute)
  .use(simulateCompleteUploadRoute)
