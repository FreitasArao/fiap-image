import { BaseElysia } from '@core/libs/elysia'
import { createVideoRoute } from './create-video.route'
import { reportPartRoute } from './report-part.route'
import { progressRoute } from './progress.route'
import { completeUploadRoute } from './complete-upload.route'
import { uploadUrlsRoute } from './upload-urls.route'

/**
 * Combined video processor routes.
 * Mounts all video-related routes under the /videos prefix.
 */
export const videoProcessorRoutes = BaseElysia.create({ prefix: 'videos' })
  .use(createVideoRoute)
  .use(uploadUrlsRoute)
  .use(reportPartRoute)
  .use(progressRoute)
  .use(completeUploadRoute)
