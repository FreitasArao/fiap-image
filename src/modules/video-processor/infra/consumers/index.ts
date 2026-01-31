import { logger } from '@modules/logging'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { CompleteMultipartConsumer } from './complete-multipart.consumer'
import { CompleteMultipartHandler } from './complete-multipart-handler'

let consumerInstance: CompleteMultipartConsumer | null = null

/**
 * Starts the SQS consumers for the video processor module.
 * This should be called after the API server starts.
 *
 * Consumers:
 * - CompleteMultipartConsumer: Handles S3 CompleteMultipartUpload events
 *   Queue: multipart-complete-queue
 *   Flow: S3 → EventBridge → SQS → This Consumer → DB Update → EventBridge (UPLOADED)
 */
export function startConsumers(): void {
  const queueUrl = process.env.COMPLETE_MULTIPART_QUEUE_URL

  if (!queueUrl) {
    logger.warn(
      'COMPLETE_MULTIPART_QUEUE_URL not set, skipping CompleteMultipartConsumer',
    )
    return
  }

  const videoRepository = new VideoRepositoryImpl(logger)
  const handler = new CompleteMultipartHandler(logger, videoRepository)
  consumerInstance = new CompleteMultipartConsumer(logger, handler)

  consumerInstance.start()
  logger.log('CompleteMultipartConsumer started', { queueUrl })
}

/**
 * Stops all running consumers gracefully.
 * Should be called on API shutdown.
 */
export function stopConsumers(): void {
  if (consumerInstance) {
    consumerInstance.stop()
    logger.log('CompleteMultipartConsumer stopped')
  }
}

export { CompleteMultipartConsumer } from './complete-multipart.consumer'
export { CompleteMultipartHandler } from './complete-multipart-handler'
