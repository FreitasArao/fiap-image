import { AbstractSQSConsumer } from '@modules/messaging/sqs/abstract-sqs-consumer'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  CompleteMultipartEvent,
  CompleteMultipartHandler,
} from '@modules/video-processor/infra/consumers/complete-multipart-handler'

export class CompleteMultipartConsumer extends AbstractSQSConsumer<CompleteMultipartEvent> {
  constructor(
    logger: AbstractLoggerService,
    private readonly completeMultipartHandler: CompleteMultipartHandler,
  ) {
    super(
      {
        queueUrl: process.env.COMPLETE_MULTIPART_QUEUE_URL || '',
        region: 'us-east-1',
      },
      logger,
    )
  }

  protected parseMessage(body: string): CompleteMultipartEvent | null {
    const data = JSON.parse(body)
    const event = data as CompleteMultipartEvent

    if (!event.detail) {
      return null
    }

    return event
  }

  protected async handleMessage(event: CompleteMultipartEvent): Promise<void> {
    this.logger.log('Handling S3 CompleteMultipartUpload event', {
      event,
    })
    await this.completeMultipartHandler.handle(event)
    this.logger.log('S3 CompleteMultipartUpload event handled successfully', {
      event,
    })
  }
}
