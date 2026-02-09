import { BaseElysia } from '@core/libs/elysia'
import { createVideoRoute } from './create-video.route'
import { reportPartRoute } from './report-part.route'
import { progressRoute } from './progress.route'
import { completeUploadRoute } from './complete-upload.route'
import { uploadUrlsRoute } from './upload-urls.route'
import { simulateRoutes } from './simulate'

// S3 events flow via EventBridge → SNS → SQS → CompleteMultipartConsumer (see ADR 010/014).
// The ReconcileUploadService provides idempotent processing for both
// the API endpoint (POST /complete) and the SQS consumer.

export const videoProcessorRoutes = BaseElysia.create({ prefix: 'videos' })
  .use(createVideoRoute)
  .use(uploadUrlsRoute)
  .use(reportPartRoute)
  .use(progressRoute)
  .use(completeUploadRoute)
  .use(simulateRoutes)
