import { logger } from '@modules/logging'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import type { AbstractSQSConsumer } from '@modules/messaging/sqs'
import type { CompleteMultipartEvent } from '@core/messaging/schemas'
import { createCompleteMultipartConsumer } from './complete-multipart.consumer'
import { CompleteMultipartHandler } from './complete-multipart-handler'

let consumerInstance: AbstractSQSConsumer<CompleteMultipartEvent> | null = null

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
  consumerInstance = createCompleteMultipartConsumer(logger, handler, queueUrl)

  consumerInstance.start()
  logger.log('CompleteMultipartConsumer started', { queueUrl })
}

export function stopConsumers(): void {
  if (consumerInstance) {
    consumerInstance.stop()
    logger.log('CompleteMultipartConsumer stopped')
  }
}

export {
  createCompleteMultipartConsumer,
  CompleteMultipartMessageHandler,
} from './complete-multipart.consumer'
export { CompleteMultipartHandler } from './complete-multipart-handler'
export type { CompleteMultipartEvent } from '@core/messaging/schemas'
